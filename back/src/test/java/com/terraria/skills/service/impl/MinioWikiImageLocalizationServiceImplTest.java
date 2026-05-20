package com.terraria.skills.service.impl;

import com.terraria.skills.config.MinioConnectionDetails;
import com.terraria.skills.service.WikiImageLocalizationService;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import io.minio.MinioClient;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@org.junit.jupiter.api.extension.ExtendWith(OutputCaptureExtension.class)
class MinioWikiImageLocalizationServiceImplTest {

    private static final String TEST_MINIO_ENDPOINT = "http://localhost:9000";

    private HttpServer imageServer;
    private HttpServer gateServer;
    private HttpServer minioServer;
    private AtomicInteger putObjectCount = new AtomicInteger();
    private AtomicInteger gateFetchCount = new AtomicInteger();
    private boolean failPutObject;

    @AfterEach
    void stopServers() {
        if (imageServer != null) {
            imageServer.stop(0);
        }
        if (gateServer != null) {
            gateServer.stop(0);
        }
        if (minioServer != null) {
            minioServer.stop(0);
        }
    }

    @Test
    void shouldDownloadWikiImageUploadToMinioAndReturnManagedUrl() throws Exception {
        String sourceUrl = startImageServer("/images/Sharp_Blade.png");
        String minioEndpoint = startMinioServer();

        String localized = service(minioEndpoint).localizeImageUrlOrFallback(sourceUrl, "api:data.imageUrl");

        assertTrue(localized.startsWith(minioEndpoint + "/terrapedia-images/items/api/wiki-images/"));
        assertFalse(localized.contains("wiki.gg"));
        assertEquals(1, putObjectCount.get());
    }

    @Test
    void shouldLogAndReturnWikiFallbackWhenUploadFails(CapturedOutput output) throws Exception {
        String sourceUrl = startImageServer("/images/Broken.png");
        failPutObject = true;
        String minioEndpoint = startMinioServer();

        String localized = service(minioEndpoint).localizeImageUrlOrFallback(sourceUrl, "api:data.imageUrl");

        assertEquals(sourceUrl, localized);
        assertTrue(output.getOut().contains("Wiki image localization failed"));
        assertTrue(output.getOut().contains("api:data.imageUrl"));
    }

    @Test
    void shouldWarnWhenReturningWikiFallbackFromRecentFailureCache(CapturedOutput output) throws Exception {
        String sourceUrl = startImageServer("/images/CachedFailure.png");
        failPutObject = true;
        String minioEndpoint = startMinioServer();
        MinioWikiImageLocalizationServiceImpl service = service(minioEndpoint);

        assertEquals(sourceUrl, service.localizeImageUrlOrFallback(sourceUrl, "api:first.imageUrl"));
        assertEquals(sourceUrl, service.localizeImageUrlOrFallback(sourceUrl, "api:second.imageUrl"));

        assertTrue(output.getOut().contains("Wiki image localization skipped by recent failure cache"));
        assertTrue(output.getOut().contains("api:second.imageUrl"));
    }

    @Test
    void shouldDeferApiResponseLocalizationWhenImageIsNotAlreadyCached(CapturedOutput output) throws Exception {
        String sourceUrl = startImageServer("/images/Deferred.png");
        String minioEndpoint = startMinioServer();

        String localized = service(minioEndpoint).localizeCachedImageUrlOrFallback(sourceUrl, "body.data[0].imageUrl");

        assertNull(localized);
        assertEquals(0, putObjectCount.get());
        assertTrue(output.getOut().contains("Wiki image suppressed in API response because cached MinIO copy is missing"));
        assertTrue(output.getOut().contains("body.data[0].imageUrl"));
    }

    @Test
    void shouldUseCachedUploadForApiResponseLocalization() throws Exception {
        String sourceUrl = startImageServer("/images/Already_Cached.png");
        String minioEndpoint = startMinioServer();
        MinioWikiImageLocalizationServiceImpl service = service(minioEndpoint);

        String mirrored = service.localizeImageUrlOrFallback(sourceUrl, "sync:imageUrl");
        String localized = service.localizeCachedImageUrlOrFallback(sourceUrl, "body.data[0].imageUrl");

        assertEquals(mirrored, localized);
        assertEquals(1, putObjectCount.get());
    }

    @Test
    void shouldFetchTerrariaWikiImagesThroughLocalGateServer() throws Exception {
        String minioEndpoint = startMinioServer();
        String gateUrl = startGateServer();
        MinioWikiImageLocalizationServiceImpl service = service(
            minioEndpoint,
            true,
            gateUrl
        );

        String localized = service.localizeImageUrlOrFallback(
            "https://terraria.wiki.gg/images/Gated.png",
            "sync:imageUrl"
        );

        assertTrue(localized.startsWith(minioEndpoint + "/terrapedia-images/items/api/wiki-images/"));
        assertEquals(1, gateFetchCount.get());
        assertEquals(1, putObjectCount.get());
    }

    @Test
    void shouldFetchTerrariaWikiFilePagesThroughLocalGateServer() throws Exception {
        String minioEndpoint = startMinioServer();
        String gateUrl = startGateServer();
        MinioWikiImageLocalizationServiceImpl service = service(
            minioEndpoint,
            true,
            gateUrl
        );

        String localized = service.localizeImageUrlOrFallback(
            "https://terraria.wiki.gg/wiki/File:Gated_File.png",
            "sync:filePage"
        );

        assertTrue(localized.startsWith(minioEndpoint + "/terrapedia-images/items/api/wiki-images/"));
        assertEquals(1, gateFetchCount.get());
        assertEquals(1, putObjectCount.get());
    }

    @Test
    void shouldOnlyTreatWikiImageUrlsAsWikiImages() {
        MinioWikiImageLocalizationServiceImpl service = service("http://localhost:9000");

        assertTrue(service.isWikiImageUrl("https://terraria.wiki.gg/images/Foo.png"));
        assertTrue(service.isWikiImageUrl("https://static.wikia.nocookie.net/terraria_gamepedia/images/Foo.png"));
        assertTrue(service.isWikiImageUrl("https://terraria.wiki.gg/wiki/File:Foo.png"));
        assertFalse(service.isWikiImageUrl("https://terraria.wiki.gg/wiki/Foo"));
        assertFalse(service.isWikiImageUrl("https://example.com/images/Foo.png"));
        assertFalse(service.isWikiImageUrl("https://example.com/proxy/terraria.wiki.gg/images/Foo.png"));
    }

    @Test
    void shouldNotTreatAllowedTestHostProxyPathAsWikiImage() {
        MinioWikiImageLocalizationServiceImpl service = service("http://localhost:9000");

        assertTrue(service.isWikiImageUrl("https://127.0.0.1/images/Foo.png"));
        assertFalse(service.isWikiImageUrl("https://127.0.0.1/proxy/terraria.wiki.gg/images/Foo.png"));
    }

    @Test
    void shouldInstantiateFromSpringContextWhenMinioIsEnabled() {
        new ApplicationContextRunner()
            .withPropertyValues("terraria.storage.minio.enabled=true")
            .withBean(MinioClient.class, () -> minioClient(TEST_MINIO_ENDPOINT))
            .withBean(MinioConnectionDetails.class, () -> connectionDetails(TEST_MINIO_ENDPOINT))
            .withUserConfiguration(MinioWikiImageLocalizationServiceImpl.class)
            .run(context -> {
                assertTrue(context.isRunning(), () -> String.valueOf(context.getStartupFailure()));
                assertTrue(context.getBean(WikiImageLocalizationService.class) instanceof MinioWikiImageLocalizationServiceImpl);
            });
    }

    private MinioWikiImageLocalizationServiceImpl service(String minioEndpoint) {
        return service(minioEndpoint, true, "http://127.0.0.1:18099/fetch-image");
    }

    private MinioWikiImageLocalizationServiceImpl service(
        String minioEndpoint,
        boolean imageFetchViaGate,
        String imageFetchGateUrl
    ) {
        return new MinioWikiImageLocalizationServiceImpl(
            minioClient(minioEndpoint),
            connectionDetails(minioEndpoint),
            Set.of("127.0.0.1"),
            imageFetchViaGate,
            imageFetchGateUrl,
            "TerraPedia/2.0 (+https://terraria.wiki.gg/api.php)"
        );
    }

    private MinioClient minioClient(String minioEndpoint) {
        return MinioClient.builder()
            .endpoint(minioEndpoint)
            .credentials("minio", "minio123")
            .build();
    }

    private MinioConnectionDetails connectionDetails(String minioEndpoint) {
        return new MinioConnectionDetails(
            minioEndpoint,
            minioEndpoint,
            "minio",
            "minio123",
            "terrapedia-images",
            "items",
            true,
            false,
            true,
            1024 * 1024
        );
    }

    private String startImageServer(String path) throws IOException {
        byte[] imageBytes = new byte[] {
            (byte) 0x89, 0x50, 0x4E, 0x47,
            0x0D, 0x0A, 0x1A, 0x0A
        };
        imageServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        imageServer.createContext(path, exchange -> writeImageResponse(exchange, imageBytes));
        imageServer.start();
        return "http://127.0.0.1:" + imageServer.getAddress().getPort() + path;
    }

    private String startMinioServer() throws IOException {
        minioServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        minioServer.createContext("/", this::writeMinioResponse);
        minioServer.start();
        return "http://127.0.0.1:" + minioServer.getAddress().getPort();
    }

    private String startGateServer() throws IOException {
        byte[] imageBytes = new byte[] {
            (byte) 0x89, 0x50, 0x4E, 0x47,
            0x0D, 0x0A, 0x1A, 0x0A
        };
        gateServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        gateServer.createContext("/fetch-image", exchange -> {
            gateFetchCount.incrementAndGet();
            String requestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            boolean expectedImage = requestBody.contains("https://terraria.wiki.gg/images/Gated.png");
            boolean expectedFilePage = requestBody.contains("https://terraria.wiki.gg/wiki/File:Gated_File.png");
            if (!"POST".equals(exchange.getRequestMethod()) || (!expectedImage && !expectedFilePage)) {
                exchange.sendResponseHeaders(400, -1);
                exchange.close();
                return;
            }
            exchange.getResponseHeaders().set("Content-Type", "image/png");
            exchange.getResponseHeaders().set(
                "X-TerraPedia-Source-Url",
                expectedFilePage ? "https://terraria.wiki.gg/images/Gated_File.png" : "https://terraria.wiki.gg/images/Gated.png"
            );
            exchange.sendResponseHeaders(200, imageBytes.length);
            try (OutputStream outputStream = exchange.getResponseBody()) {
                outputStream.write(imageBytes);
            }
        });
        gateServer.start();
        return "http://127.0.0.1:" + gateServer.getAddress().getPort() + "/fetch-image";
    }

    private void writeMinioResponse(HttpExchange exchange) throws IOException {
        String method = exchange.getRequestMethod();
        String path = exchange.getRequestURI().getPath();
        String query = exchange.getRequestURI().getQuery();
        if ("HEAD".equals(method) && "/terrapedia-images".equals(path)) {
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
            return;
        }
        if ("GET".equals(method) && "/terrapedia-images".equals(path) && query != null && query.contains("location")) {
            byte[] body = """
                <?xml version="1.0" encoding="UTF-8"?>
                <LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">us-east-1</LocationConstraint>
                """.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/xml");
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream outputStream = exchange.getResponseBody()) {
                outputStream.write(body);
            }
            return;
        }
        if ("PUT".equals(method)) {
            exchange.getRequestBody().readAllBytes();
            putObjectCount.incrementAndGet();
            if (failPutObject) {
                byte[] body = """
                    <?xml version="1.0" encoding="UTF-8"?>
                    <Error><Code>InternalError</Code><Message>minio offline</Message></Error>
                    """.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/xml");
                exchange.sendResponseHeaders(500, body.length);
                try (OutputStream outputStream = exchange.getResponseBody()) {
                    outputStream.write(body);
                }
                return;
            }
            exchange.getResponseHeaders().set("ETag", "\"test-etag\"");
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
            return;
        }
        exchange.sendResponseHeaders(404, -1);
        exchange.close();
    }

    private void writeImageResponse(HttpExchange exchange, byte[] imageBytes) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "image/png");
        exchange.sendResponseHeaders(200, imageBytes.length);
        try (OutputStream outputStream = exchange.getResponseBody()) {
            outputStream.write(imageBytes);
        }
    }
}

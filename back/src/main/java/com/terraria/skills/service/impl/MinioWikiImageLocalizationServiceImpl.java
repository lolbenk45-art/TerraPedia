package com.terraria.skills.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Ticker;
import com.terraria.skills.config.MinioConnectionDetails;
import com.terraria.skills.dto.FileUploadResultDTO;
import com.terraria.skills.dto.WikiImageLocalizationCacheMetricsDTO;
import com.terraria.skills.service.WikiImageLocalizationService;
import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.SetBucketPolicyArgs;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

@Slf4j
@Service
@ConditionalOnBean(MinioClient.class)
@ConditionalOnProperty(prefix = "terraria.storage.minio", name = "enabled", havingValue = "true")
public class MinioWikiImageLocalizationServiceImpl implements WikiImageLocalizationService {

    private static final List<String> DOMAIN_OBJECT_PREFIXES = List.of("items", "npcs", "projectiles", "buffs");

    private static final Duration FAILURE_CACHE_TTL = Duration.ofMinutes(10);
    private static final int FAILURE_CACHE_MAX_ENTRIES = 2048;
    private static final Duration UPLOAD_CACHE_TTL = Duration.ofHours(24);
    private static final int UPLOAD_CACHE_MAX_ENTRIES = 4096;

    private final MinioClient minioClient;
    private final MinioConnectionDetails connectionDetails;
    private final Set<String> extraAllowedWikiImageHosts;
    private final boolean imageFetchViaGate;
    private final String imageFetchGateUrl;
    private final String wikiUserAgent;
    private final AtomicBoolean bucketReady = new AtomicBoolean(false);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Cache<String, FileUploadResultDTO> uploadCache;
    private final Cache<String, Boolean> failureCache;
    private final HttpClient httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(15))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build();

    @Autowired
    public MinioWikiImageLocalizationServiceImpl(
        MinioClient minioClient,
        MinioConnectionDetails connectionDetails,
        @Value("${terraria.crawler.image-fetch-via-gate:true}") boolean imageFetchViaGate,
        @Value("${terraria.crawler.image-fetch-gate-url:http://127.0.0.1:18099/fetch-image}") String imageFetchGateUrl,
        @Value("${terraria.crawler.user-agent:TerraPedia/2.0 (+https://terraria.wiki.gg/api.php)}") String wikiUserAgent
    ) {
        this(minioClient, connectionDetails, Set.of(), imageFetchViaGate, imageFetchGateUrl, wikiUserAgent);
    }

    MinioWikiImageLocalizationServiceImpl(
        MinioClient minioClient,
        MinioConnectionDetails connectionDetails,
        Set<String> extraAllowedWikiImageHosts
    ) {
        this(
            minioClient,
            connectionDetails,
            extraAllowedWikiImageHosts,
            true,
            "http://127.0.0.1:18099/fetch-image",
            "TerraPedia/2.0 (+https://terraria.wiki.gg/api.php)"
        );
    }

    MinioWikiImageLocalizationServiceImpl(
        MinioClient minioClient,
        MinioConnectionDetails connectionDetails,
        Set<String> extraAllowedWikiImageHosts,
        boolean imageFetchViaGate,
        String imageFetchGateUrl,
        String wikiUserAgent
    ) {
        this.minioClient = minioClient;
        this.connectionDetails = connectionDetails;
        this.extraAllowedWikiImageHosts = extraAllowedWikiImageHosts == null ? Set.of() : extraAllowedWikiImageHosts;
        this.imageFetchViaGate = imageFetchViaGate;
        this.imageFetchGateUrl = firstNonBlank(imageFetchGateUrl, "http://127.0.0.1:18099/fetch-image");
        this.wikiUserAgent = firstNonBlank(wikiUserAgent, "TerraPedia/2.0 (+https://terraria.wiki.gg/api.php)");
        this.uploadCache = buildUploadCache(Ticker.systemTicker());
        this.failureCache = buildFailureCache(Ticker.systemTicker());
    }

    MinioWikiImageLocalizationServiceImpl(
        MinioClient minioClient,
        MinioConnectionDetails connectionDetails,
        Set<String> extraAllowedWikiImageHosts,
        boolean imageFetchViaGate,
        String imageFetchGateUrl,
        String wikiUserAgent,
        Ticker ticker
    ) {
        this.minioClient = minioClient;
        this.connectionDetails = connectionDetails;
        this.extraAllowedWikiImageHosts = extraAllowedWikiImageHosts == null ? Set.of() : extraAllowedWikiImageHosts;
        this.imageFetchViaGate = imageFetchViaGate;
        this.imageFetchGateUrl = firstNonBlank(imageFetchGateUrl, "http://127.0.0.1:18099/fetch-image");
        this.wikiUserAgent = firstNonBlank(wikiUserAgent, "TerraPedia/2.0 (+https://terraria.wiki.gg/api.php)");
        Ticker safeTicker = ticker == null ? Ticker.systemTicker() : ticker;
        this.uploadCache = buildUploadCache(safeTicker);
        this.failureCache = buildFailureCache(safeTicker);
    }

    @Override
    public boolean isWikiImageUrl(String value) {
        URI uri = parseHttpUri(value);
        if (uri == null || uri.getHost() == null) {
            return false;
        }
        String host = uri.getHost().toLowerCase(Locale.ROOT);
        String path = uri.getPath() == null ? "" : uri.getPath().toLowerCase(Locale.ROOT);

        if ("terraria.wiki.gg".equals(host)) {
            return path.startsWith("/images/") || path.startsWith("/wiki/file:");
        }
        if ("static.wikia.nocookie.net".equals(host) || "vignette.wikia.nocookie.net".equals(host)) {
            return true;
        }
        if (host.equals("fandom.com") || host.endsWith(".fandom.com")) {
            return path.contains("/images/");
        }
        if (extraAllowedWikiImageHosts.contains(host)) {
            return path.startsWith("/images/")
                || path.startsWith("/wiki/file:");
        }
        return false;
    }

    @Override
    public boolean isManagedImageUrl(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return false;
        }
        if (normalized.startsWith(getManagedUrlPrefix())) {
            return true;
        }
        URI uri = parseHttpUri(normalized);
        URI publicEndpoint = parseHttpUri(normalizePublicEndpoint(connectionDetails.publicEndpoint()));
        URI minioEndpoint = parseHttpUri(normalizePublicEndpoint(connectionDetails.endpoint()));
        return sameOrigin(uri, publicEndpoint) && hasBucketPath(uri)
            || sameOrigin(uri, minioEndpoint) && hasBucketPath(uri);
    }

    @Override
    public String localizeImageUrlOrFallback(String sourceUrl, String context) {
        if (!isWikiImageUrl(sourceUrl) || isManagedImageUrl(sourceUrl)) {
            return sourceUrl;
        }

        String cacheKey = firstNonBlank(normalizeFetchUrl(sourceUrl), sourceUrl);
        if (isFailureCached(cacheKey)) {
            log.warn("Wiki image localization skipped by recent failure cache context={} url={}", context, sourceUrl);
            return sourceUrl;
        }

        try {
            FileUploadResultDTO upload = mirrorWikiImage(
                sourceUrl,
                "api/wiki-images/" + hashPrefix(sourceUrl),
                buildStableId(sourceUrl, firstNonBlank(context, "api-image"))
            );
            failureCache.invalidate(cacheKey);
            return upload.getUrl();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            rememberFailure(cacheKey);
            log.warn("Wiki image localization failed context={} url={}", context, sourceUrl, exception);
            return sourceUrl;
        } catch (Exception exception) {
            rememberFailure(cacheKey);
            log.warn("Wiki image localization failed context={} url={}", context, sourceUrl, exception);
            return sourceUrl;
        }
    }

    @Override
    public String localizeCachedImageUrlOrFallback(String sourceUrl, String context) {
        if (!isWikiImageUrl(sourceUrl) || isManagedImageUrl(sourceUrl)) {
            return sourceUrl;
        }

        String normalizedSourceUrl = normalizeFetchUrl(sourceUrl);
        FileUploadResultDTO cached = uploadCache.getIfPresent(normalizedSourceUrl);
        if (cached == null) {
            cached = uploadCache.getIfPresent(sourceUrl);
        }
        if (cached != null && StringUtils.hasText(cached.getUrl())) {
            return cached.getUrl();
        }

        log.warn("Wiki image suppressed in API response because cached MinIO copy is missing context={} url={}", context, sourceUrl);
        return null;
    }

    @Override
    public FileUploadResultDTO mirrorWikiImage(String sourceUrl, String pathPrefix, String stableId)
        throws IOException, InterruptedException {
        String normalizedSourceUrl = normalizeFetchUrl(sourceUrl);
        if (!isWikiImageUrl(normalizedSourceUrl)) {
            throw new IllegalArgumentException("Not a supported wiki image URL");
        }

        FileUploadResultDTO cached = uploadCache.getIfPresent(normalizedSourceUrl);
        if (cached != null) {
            return cached;
        }

        FetchedWikiImage fetchedImage = fetchImageWithWikiFileFallback(normalizedSourceUrl);
        HttpResponse<byte[]> response = fetchedImage.response();
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("Unexpected HTTP status " + response.statusCode());
        }

        String effectiveSourceUrl = fetchedImage.sourceUrl();
        String originalFilename = extractFilename(effectiveSourceUrl);
        byte[] body = response.body();
        String contentType = normalizeContentType(response.headers().firstValue("content-type").orElse(null));
        if (!StringUtils.hasText(contentType)) {
            contentType = inferContentType(originalFilename);
        }
        validateImageContentType(contentType);
        validateImageSize(body.length);

        String objectKey = buildScopedObjectKey(pathPrefix, stableId, originalFilename, contentType);
        FileUploadResultDTO upload = uploadBytes(objectKey, originalFilename, contentType, body);
        upload.setSourceUrl(effectiveSourceUrl);
        uploadCache.put(normalizedSourceUrl, upload);
        uploadCache.put(effectiveSourceUrl, upload);
        return upload;
    }

    private FetchedWikiImage fetchImageWithWikiFileFallback(String sourceUrl) throws IOException, InterruptedException {
        if (shouldFetchViaGate(sourceUrl)) {
            try {
                HttpResponse<byte[]> response = fetchImageViaGate(sourceUrl);
                if (response.statusCode() >= 200 && response.statusCode() < 300 && hasImageContentType(response)) {
                    String effectiveSourceUrl = response.headers()
                        .firstValue("x-terrapedia-source-url")
                        .filter(StringUtils::hasText)
                        .orElse(sourceUrl);
                    return new FetchedWikiImage(normalizeFetchUrl(effectiveSourceUrl), response);
                }
                log.warn("Wiki image gate returned non-image response; falling back to direct fetch url={} status={}", sourceUrl, response.statusCode());
            } catch (IOException exception) {
                log.warn("Wiki image gate fetch failed; falling back to direct fetch url={} gate={}", sourceUrl, imageFetchGateUrl, exception);
            }
        }

        HttpResponse<byte[]> response = fetchImageDirect(sourceUrl);
        if (response.statusCode() >= 200 && response.statusCode() < 300 && hasImageContentType(response)) {
            return new FetchedWikiImage(sourceUrl, response);
        }

        return new FetchedWikiImage(sourceUrl, response);
    }

    private boolean hasImageContentType(HttpResponse<byte[]> response) {
        return response.headers()
            .firstValue("content-type")
            .map(this::normalizeContentType)
            .filter(StringUtils::hasText)
            .map(value -> value.startsWith("image/"))
            .orElse(false);
    }

    boolean isFailureCached(String cacheKey) {
        failureCache.cleanUp();
        return failureCache.getIfPresent(cacheKey) != null;
    }

    void rememberFailure(String cacheKey) {
        failureCache.put(cacheKey, Boolean.TRUE);
        failureCache.cleanUp();
    }

    @Override
    public WikiImageLocalizationCacheMetricsDTO cacheMetrics() {
        failureCache.cleanUp();
        uploadCache.cleanUp();
        WikiImageLocalizationCacheMetricsDTO metrics = new WikiImageLocalizationCacheMetricsDTO();
        metrics.setEnabled(true);
        metrics.setFailureCacheSize(failureCache.estimatedSize());
        metrics.setFailureCacheMaxEntries(FAILURE_CACHE_MAX_ENTRIES);
        metrics.setFailureCacheTtlSeconds(FAILURE_CACHE_TTL.toSeconds());
        metrics.setUploadCacheSize(uploadCache.estimatedSize());
        metrics.setUploadCacheMaxEntries(UPLOAD_CACHE_MAX_ENTRIES);
        metrics.setUploadCacheTtlSeconds(UPLOAD_CACHE_TTL.toSeconds());
        return metrics;
    }

    private Cache<String, FileUploadResultDTO> buildUploadCache(Ticker ticker) {
        return Caffeine.newBuilder()
            .maximumSize(UPLOAD_CACHE_MAX_ENTRIES)
            .expireAfterWrite(UPLOAD_CACHE_TTL)
            .ticker(ticker)
            .build();
    }

    private Cache<String, Boolean> buildFailureCache(Ticker ticker) {
        return Caffeine.newBuilder()
            .maximumSize(FAILURE_CACHE_MAX_ENTRIES)
            .expireAfterWrite(FAILURE_CACHE_TTL)
            .ticker(ticker)
            .build();
    }

    private URI parseHttpUri(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return null;
        }
        if (normalized.startsWith("//")) {
            normalized = "https:" + normalized;
        }
        try {
            URI uri = URI.create(normalized);
            String scheme = uri.getScheme();
            if (scheme == null) {
                return null;
            }
            String lowerScheme = scheme.toLowerCase(Locale.ROOT);
            return "http".equals(lowerScheme) || "https".equals(lowerScheme) ? uri : null;
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private HttpResponse<byte[]> fetchImage(String sourceUrl) throws IOException, InterruptedException {
        if (shouldFetchViaGate(sourceUrl)) {
            return fetchImageViaGate(sourceUrl);
        }
        return fetchImageDirect(sourceUrl);
    }

    private boolean shouldFetchViaGate(String sourceUrl) {
        URI uri = parseHttpUri(sourceUrl);
        return imageFetchViaGate
            && uri != null
            && uri.getHost() != null
            && (
                "terraria.wiki.gg".equals(uri.getHost().toLowerCase(Locale.ROOT))
                || extraAllowedWikiImageHosts.contains(uri.getHost().toLowerCase(Locale.ROOT))
            );
    }

    private HttpResponse<byte[]> fetchImageViaGate(String sourceUrl) throws IOException, InterruptedException {
        String requestBody = objectMapper.writeValueAsString(Map.of("url", sourceUrl));
        HttpRequest request = HttpRequest.newBuilder(URI.create(imageFetchGateUrl))
            .POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8))
            .timeout(Duration.ofSeconds(35))
            .header("User-Agent", wikiUserAgent)
            .header("Content-Type", "application/json")
            .build();
        return httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
    }

    @Deprecated
    private HttpResponse<byte[]> fetchImageDirect(String sourceUrl) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(URI.create(sourceUrl))
            .GET()
            .timeout(Duration.ofSeconds(30))
            .header("User-Agent", wikiUserAgent)
            .build();
        return httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
    }

    private FileUploadResultDTO uploadBytes(String objectKey, String originalFilename, String contentType, byte[] body) {
        ensureBucketReady();

        try (ByteArrayInputStream inputStream = new ByteArrayInputStream(body)) {
            minioClient.putObject(
                PutObjectArgs.builder()
                    .bucket(connectionDetails.bucket())
                    .object(objectKey)
                    .stream(inputStream, body.length, -1)
                    .contentType(contentType)
                    .build()
            );
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to upload image to MinIO: " + exception.getMessage(), exception);
        }

        FileUploadResultDTO result = new FileUploadResultDTO();
        result.setBucket(connectionDetails.bucket());
        result.setObjectKey(objectKey);
        result.setUrl(buildPublicObjectUrl(objectKey));
        result.setOriginalFilename(originalFilename);
        result.setContentType(contentType);
        result.setSize(body.length);
        return result;
    }

    private void validateImageContentType(String contentType) {
        if (!StringUtils.hasText(contentType) || !contentType.toLowerCase(Locale.ROOT).startsWith("image/")) {
            throw new IllegalArgumentException("Only image files are supported");
        }
    }

    private void validateImageSize(long size) {
        if (size > connectionDetails.maxFileSize()) {
            throw new IllegalArgumentException("Image file is too large. Current limit: " + (connectionDetails.maxFileSize() / 1024 / 1024) + " MB");
        }
    }

    private String normalizeFetchUrl(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return null;
        }
        if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
            return normalizeWikiImagePath(normalized);
        }
        if (normalized.startsWith("//")) {
            return "https:" + normalized;
        }
        if (normalized.startsWith("localhost:") || normalized.startsWith("127.0.0.1:")) {
            return "http://" + normalized;
        }
        return null;
    }

    private String normalizeWikiImagePath(String value) {
        if (value == null) {
            return null;
        }
        String lowerCase = value.toLowerCase(Locale.ROOT);
        if (!lowerCase.contains("terraria.wiki.gg/images/")) {
            return value;
        }
        return value.replaceAll("(?i)%20", "_").replace(" ", "_");
    }

    private void ensureBucketReady() {
        if (bucketReady.get()) {
            return;
        }

        synchronized (bucketReady) {
            if (bucketReady.get()) {
                return;
            }

            try {
                if (!connectionDetails.autoCreateBucket()) {
                    bucketReady.set(true);
                    return;
                }
                boolean exists = minioClient.bucketExists(
                    BucketExistsArgs.builder().bucket(connectionDetails.bucket()).build()
                );
                if (!exists) {
                    minioClient.makeBucket(
                        MakeBucketArgs.builder().bucket(connectionDetails.bucket()).build()
                    );
                }

                if (connectionDetails.publicRead()) {
                    minioClient.setBucketPolicy(
                        SetBucketPolicyArgs.builder()
                            .bucket(connectionDetails.bucket())
                            .config(buildPublicReadPolicy(connectionDetails.bucket()))
                            .build()
                    );
                }

                bucketReady.set(true);
            } catch (Exception exception) {
                throw new IllegalStateException("Failed to initialize MinIO bucket: " + exception.getMessage(), exception);
            }
        }
    }

    private String buildScopedObjectKey(String pathPrefix, String stableId, String originalFilename, String contentType) {
        String safePathPrefix = trimObjectPath(pathPrefix);
        String prefix = resolveObjectPrefix(safePathPrefix);
        String scopedPath = stripLeadingObjectPrefix(safePathPrefix, prefix);
        String safeStableId = trimObjectPath(stableId);
        String extension = resolveExtension(originalFilename, contentType);
        if (!StringUtils.hasText(scopedPath)) {
            return prefix + "/" + safeStableId + extension;
        }
        return prefix + "/" + scopedPath + "/" + safeStableId + extension;
    }

    private String resolveObjectPrefix(String safePathPrefix) {
        String explicitPrefix = firstPathSegment(safePathPrefix);
        if (explicitPrefix != null && DOMAIN_OBJECT_PREFIXES.contains(explicitPrefix)) {
            return explicitPrefix;
        }
        return StringUtils.hasText(connectionDetails.objectPrefix())
            ? connectionDetails.objectPrefix().replaceAll("^/+|/+$", "")
            : "items";
    }

    private String stripLeadingObjectPrefix(String safePathPrefix, String prefix) {
        if (!StringUtils.hasText(safePathPrefix) || !StringUtils.hasText(prefix)) {
            return safePathPrefix;
        }
        if (safePathPrefix.equals(prefix)) {
            return null;
        }
        String expectedPrefix = prefix + "/";
        return safePathPrefix.startsWith(expectedPrefix)
            ? safePathPrefix.substring(expectedPrefix.length())
            : safePathPrefix;
    }

    private String firstPathSegment(String value) {
        String normalized = trimObjectPath(value);
        if (!StringUtils.hasText(normalized)) {
            return null;
        }
        int slashIndex = normalized.indexOf('/');
        return slashIndex >= 0 ? normalized.substring(0, slashIndex) : normalized;
    }

    private String resolveExtension(String originalFilename, String contentType) {
        if (StringUtils.hasText(originalFilename) && originalFilename.contains(".")) {
            return originalFilename.substring(originalFilename.lastIndexOf('.')).toLowerCase(Locale.ROOT);
        }

        String normalizedContentType = normalizeContentType(contentType);
        if (normalizedContentType == null) {
            return ".bin";
        }

        return switch (normalizedContentType) {
            case "image/jpeg" -> ".jpg";
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            case "image/gif" -> ".gif";
            case "image/svg+xml" -> ".svg";
            case "image/x-icon", "image/vnd.microsoft.icon" -> ".ico";
            case "image/bmp" -> ".bmp";
            case "image/avif" -> ".avif";
            default -> ".bin";
        };
    }

    private String buildPublicReadPolicy(String bucket) {
        return """
            {
              "Version":"2012-10-17",
              "Statement":[
                {
                  "Effect":"Allow",
                  "Principal":{"AWS":["*"]},
                  "Action":["s3:GetObject"],
                  "Resource":["arn:aws:s3:::%s/*"]
                }
              ]
            }
            """.formatted(bucket);
    }

    private String buildPublicObjectUrl(String objectKey) {
        return normalizePublicEndpoint(connectionDetails.publicEndpoint()) + "/" + connectionDetails.bucket() + "/" + objectKey;
    }

    private String getManagedUrlPrefix() {
        return buildPublicObjectUrl("").replaceAll("/+$", "") + "/";
    }

    private String normalizePublicEndpoint(String endpoint) {
        String value = trimToNull(endpoint);
        if (value == null) {
            throw new IllegalStateException("MinIO public endpoint is not configured");
        }

        if (value.startsWith("http://") || value.startsWith("https://")) {
            return trimTrailingSlash(value);
        }

        if (value.startsWith("//")) {
            return "https:" + trimTrailingSlash(value);
        }

        return "http://" + trimTrailingSlash(value);
    }

    private boolean hasBucketPath(URI uri) {
        if (uri == null || uri.getPath() == null) {
            return false;
        }
        return uri.getPath().startsWith("/" + connectionDetails.bucket() + "/");
    }

    private boolean sameOrigin(URI left, URI right) {
        if (left == null || right == null || left.getHost() == null || right.getHost() == null) {
            return false;
        }
        return left.getHost().equalsIgnoreCase(right.getHost())
            && normalizePort(left) == normalizePort(right)
            && Objects.equals(normalizeScheme(left), normalizeScheme(right));
    }

    private int normalizePort(URI uri) {
        if (uri.getPort() >= 0) {
            return uri.getPort();
        }
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private String normalizeScheme(URI uri) {
        return uri.getScheme() == null ? null : uri.getScheme().toLowerCase(Locale.ROOT);
    }

    private String buildStableId(String sourceUrl, String hint) {
        return sha1Hex(sourceUrl) + "-" + slugify(hint);
    }

    private String hashPrefix(String sourceUrl) {
        return sha1Hex(sourceUrl).substring(0, 2);
    }

    private String sha1Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(hash.length * 2);
            for (byte item : hash) {
                builder.append(String.format("%02x", item));
            }
            return builder.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-1 algorithm is not available", exception);
        }
    }

    private String slugify(String value) {
        String normalized = value == null ? "" : value.toLowerCase(Locale.ROOT);
        String slug = normalized
            .replaceAll("[^a-z0-9]+", "-")
            .replaceAll("^-+", "")
            .replaceAll("-+$", "");
        if (slug.isBlank()) {
            return "image";
        }
        return slug.length() > 48 ? slug.substring(0, 48) : slug;
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value.trim();
            }
        }
        return "image";
    }

    private String extractFilename(String sourceUrl) {
        String path = URI.create(sourceUrl).getPath();
        if (!StringUtils.hasText(path)) {
            return "image";
        }
        int index = path.lastIndexOf('/');
        if (index < 0 || index == path.length() - 1) {
            return "image";
        }
        return path.substring(index + 1);
    }

    private String normalizeContentType(String contentType) {
        String value = trimToNull(contentType);
        if (value == null) {
            return null;
        }
        int separatorIndex = value.indexOf(';');
        String normalized = separatorIndex >= 0 ? value.substring(0, separatorIndex) : value;
        return normalized.trim().toLowerCase(Locale.ROOT);
    }

    private String inferContentType(String originalFilename) {
        if (!StringUtils.hasText(originalFilename) || !originalFilename.contains(".")) {
            return null;
        }
        String extension = originalFilename.substring(originalFilename.lastIndexOf('.')).toLowerCase(Locale.ROOT);
        return switch (extension) {
            case ".jpg", ".jpeg" -> "image/jpeg";
            case ".png" -> "image/png";
            case ".webp" -> "image/webp";
            case ".gif" -> "image/gif";
            case ".svg" -> "image/svg+xml";
            case ".ico" -> "image/x-icon";
            case ".bmp" -> "image/bmp";
            case ".avif" -> "image/avif";
            default -> null;
        };
    }

    private String trimObjectPath(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return "image";
        }
        return normalized.replace('\\', '/').replaceAll("^/+", "").replaceAll("/+$", "");
    }

    private String trimTrailingSlash(String value) {
        String normalized = value;
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private record FetchedWikiImage(String sourceUrl, HttpResponse<byte[]> response) {
    }
}

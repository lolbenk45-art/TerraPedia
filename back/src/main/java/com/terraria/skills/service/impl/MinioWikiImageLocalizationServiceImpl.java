package com.terraria.skills.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.config.MinioConnectionDetails;
import com.terraria.skills.dto.FileUploadResultDTO;
import com.terraria.skills.service.WikiImageLocalizationService;
import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.SetBucketPolicyArgs;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

@Slf4j
@Service
@ConditionalOnBean(MinioClient.class)
@ConditionalOnProperty(prefix = "terraria.storage.minio", name = "enabled", havingValue = "true")
public class MinioWikiImageLocalizationServiceImpl implements WikiImageLocalizationService {

    private static final Duration FAILURE_CACHE_TTL = Duration.ofMinutes(10);
    private static final int FAILURE_CACHE_MAX_ENTRIES = 2048;

    private final MinioClient minioClient;
    private final MinioConnectionDetails connectionDetails;
    private final Set<String> extraAllowedWikiImageHosts;
    private final AtomicBoolean bucketReady = new AtomicBoolean(false);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Map<String, FileUploadResultDTO> uploadCache = new ConcurrentHashMap<>();
    private final Map<String, String> wikiFileUrlCache = new ConcurrentHashMap<>();
    private final Map<String, Instant> failureCache = new ConcurrentHashMap<>();
    private final HttpClient httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(15))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build();

    @Autowired
    public MinioWikiImageLocalizationServiceImpl(MinioClient minioClient, MinioConnectionDetails connectionDetails) {
        this(minioClient, connectionDetails, Set.of());
    }

    MinioWikiImageLocalizationServiceImpl(
        MinioClient minioClient,
        MinioConnectionDetails connectionDetails,
        Set<String> extraAllowedWikiImageHosts
    ) {
        this.minioClient = minioClient;
        this.connectionDetails = connectionDetails;
        this.extraAllowedWikiImageHosts = extraAllowedWikiImageHosts == null ? Set.of() : extraAllowedWikiImageHosts;
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
            failureCache.remove(cacheKey);
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
        FileUploadResultDTO cached = uploadCache.get(normalizedSourceUrl);
        if (cached == null) {
            cached = uploadCache.get(sourceUrl);
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

        FileUploadResultDTO cached = uploadCache.get(normalizedSourceUrl);
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
        if (isWikiFilePageUrl(sourceUrl)) {
            String resolvedUrl = resolveWikiFileImageUrl(sourceUrl);
            if (StringUtils.hasText(resolvedUrl)) {
                HttpResponse<byte[]> resolvedResponse = fetchImage(resolvedUrl);
                return new FetchedWikiImage(resolvedUrl, resolvedResponse);
            }
        }

        HttpResponse<byte[]> response = fetchImage(sourceUrl);
        if (response.statusCode() >= 200 && response.statusCode() < 300 && hasImageContentType(response)) {
            return new FetchedWikiImage(sourceUrl, response);
        }

        String resolvedUrl = resolveWikiFileImageUrl(sourceUrl);
        if (!StringUtils.hasText(resolvedUrl) || Objects.equals(normalizeFetchUrl(resolvedUrl), normalizeFetchUrl(sourceUrl))) {
            return new FetchedWikiImage(sourceUrl, response);
        }

        String normalizedResolvedUrl = normalizeFetchUrl(resolvedUrl);
        HttpResponse<byte[]> resolvedResponse = fetchImage(normalizedResolvedUrl);
        return new FetchedWikiImage(normalizedResolvedUrl, resolvedResponse);
    }

    private boolean hasImageContentType(HttpResponse<byte[]> response) {
        return response.headers()
            .firstValue("content-type")
            .map(this::normalizeContentType)
            .filter(StringUtils::hasText)
            .map(value -> value.startsWith("image/"))
            .orElse(false);
    }

    private boolean isFailureCached(String cacheKey) {
        Instant failedAt = failureCache.get(cacheKey);
        if (failedAt == null) {
            return false;
        }
        if (failedAt.plus(FAILURE_CACHE_TTL).isAfter(Instant.now())) {
            return true;
        }
        failureCache.remove(cacheKey);
        return false;
    }

    private void rememberFailure(String cacheKey) {
        if (failureCache.size() >= FAILURE_CACHE_MAX_ENTRIES) {
            failureCache.clear();
        }
        failureCache.put(cacheKey, Instant.now());
    }

    private String resolveWikiFileImageUrl(String sourceUrl) {
        String normalized = normalizeFetchUrl(sourceUrl);
        if (!isWikiImageUrl(normalized)) {
            return null;
        }
        return wikiFileUrlCache.computeIfAbsent(normalized, this::loadWikiFileImageUrl);
    }

    private String loadWikiFileImageUrl(String sourceUrl) {
        String fileTitle = extractWikiFileTitle(sourceUrl);
        if (!StringUtils.hasText(fileTitle)) {
            return null;
        }
        try {
            String encodedTitle = URLEncoder.encode("File:" + fileTitle, StandardCharsets.UTF_8).replace("+", "%20");
            URI uri = URI.create("https://terraria.wiki.gg/api.php?action=query&redirects=1&prop=imageinfo&iiprop=url%7Cmime&format=json&titles=" + encodedTitle);
            HttpRequest request = HttpRequest.newBuilder(uri)
                .GET()
                .timeout(Duration.ofSeconds(20))
                .header("User-Agent", "TerraPediaBot/1.0 (+https://local.terrapedia)")
                .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return null;
            }
            JsonNode pages = objectMapper.readTree(response.body()).path("query").path("pages");
            if (!pages.isObject()) {
                return null;
            }
            for (JsonNode page : pages) {
                JsonNode imageInfo = page.path("imageinfo");
                if (imageInfo.isArray() && imageInfo.size() > 0) {
                    String url = trimToNull(imageInfo.get(0).path("url").asText(null));
                    if (isWikiImageUrl(url)) {
                        return normalizeFetchUrl(url);
                    }
                }
            }
            return null;
        } catch (Exception exception) {
            log.debug("Failed to resolve wiki file image url for {}", sourceUrl, exception);
            return null;
        }
    }

    private String extractWikiFileTitle(String sourceUrl) {
        String normalized = trimToNull(sourceUrl);
        if (normalized == null) {
            return null;
        }
        String lowerCase = normalized.toLowerCase(Locale.ROOT);
        int filePageIndex = lowerCase.indexOf("/wiki/file:");
        if (filePageIndex >= 0) {
            String pathPart = normalized.substring(filePageIndex + "/wiki/file:".length());
            return cleanWikiFilename(pathPart);
        }

        int markerIndex = lowerCase.indexOf("/images/");
        if (markerIndex < 0) {
            return null;
        }
        String pathPart = normalized.substring(markerIndex + "/images/".length());
        int slashIndex = pathPart.lastIndexOf('/');
        if (slashIndex >= 0) {
            pathPart = pathPart.substring(slashIndex + 1);
        }
        return cleanWikiFilename(pathPart);
    }

    private String cleanWikiFilename(String pathPart) {
        int queryIndex = pathPart.indexOf('?');
        if (queryIndex >= 0) {
            pathPart = pathPart.substring(0, queryIndex);
        }
        int hashIndex = pathPart.indexOf('#');
        if (hashIndex >= 0) {
            pathPart = pathPart.substring(0, hashIndex);
        }
        if (!StringUtils.hasText(pathPart)) {
            return null;
        }
        return URLDecoder.decode(pathPart, StandardCharsets.UTF_8).replace('_', ' ');
    }

    private boolean isWikiFilePageUrl(String sourceUrl) {
        URI uri = parseHttpUri(sourceUrl);
        if (uri == null || uri.getHost() == null || uri.getPath() == null) {
            return false;
        }
        return "terraria.wiki.gg".equals(uri.getHost().toLowerCase(Locale.ROOT))
            && uri.getPath().toLowerCase(Locale.ROOT).startsWith("/wiki/file:");
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
        HttpRequest request = HttpRequest.newBuilder(URI.create(sourceUrl))
            .GET()
            .timeout(Duration.ofSeconds(30))
            .header("User-Agent", "TerraPediaBot/1.0 (+https://local.terrapedia)")
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
        String prefix = StringUtils.hasText(connectionDetails.objectPrefix())
            ? connectionDetails.objectPrefix().replaceAll("^/+|/+$", "")
            : "items";
        String safePathPrefix = trimObjectPath(pathPrefix);
        String safeStableId = trimObjectPath(stableId);
        String extension = resolveExtension(originalFilename, contentType);
        return prefix + "/" + safePathPrefix + "/" + safeStableId + extension;
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

package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.terraria.skills.config.MinioConnectionDetails;
import com.terraria.skills.dto.AdminWikiImageSyncRequestDTO;
import com.terraria.skills.dto.AdminWikiImageSyncResultDTO;
import com.terraria.skills.dto.AdminWikiImageSyncScopeResultDTO;
import com.terraria.skills.dto.FileUploadResultDTO;
import com.terraria.skills.entity.Biome;
import com.terraria.skills.entity.Buff;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.ItemImage;
import com.terraria.skills.mapper.BiomeMapper;
import com.terraria.skills.mapper.BuffMapper;
import com.terraria.skills.mapper.ItemImageMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.WikiImageSyncService;
import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.SetBucketPolicyArgs;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

@Slf4j
@Service
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "terraria.storage.minio", name = "enabled", havingValue = "true", matchIfMissing = true)
public class WikiImageSyncServiceImpl implements WikiImageSyncService {

    private final ItemImageMapper itemImageMapper;
    private final ItemMapper itemMapper;
    private final BuffMapper buffMapper;
    private final BiomeMapper biomeMapper;
    private final MinioClient minioClient;
    private final MinioConnectionDetails connectionDetails;
    private final AtomicBoolean bucketReady = new AtomicBoolean(false);
    private final HttpClient httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(15))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build();

    @Override
    public AdminWikiImageSyncResultDTO syncWikiImages(AdminWikiImageSyncRequestDTO request) {
        AdminWikiImageSyncRequestDTO safeRequest = request == null ? new AdminWikiImageSyncRequestDTO() : request;
        Integer limit = sanitizeLimit(safeRequest.getLimit());
        boolean force = Boolean.TRUE.equals(safeRequest.getForce());
        boolean includeItemImages = safeRequest.getIncludeItemImages() == null || safeRequest.getIncludeItemImages();
        boolean includeBuffs = safeRequest.getIncludeBuffs() == null || safeRequest.getIncludeBuffs();
        boolean includeBiomes = safeRequest.getIncludeBiomes() == null || safeRequest.getIncludeBiomes();

        AdminWikiImageSyncResultDTO result = new AdminWikiImageSyncResultDTO();
        result.setBucket(connectionDetails.bucket());
        result.setManagedUrlPrefix(getManagedUrlPrefix());
        result.setStartedAt(LocalDateTime.now());

        Map<String, FileUploadResultDTO> uploadCache = new HashMap<>();

        if (includeItemImages) {
            runScopeSafely(result.getItemImages(), () -> syncItemImages(result.getItemImages(), limit, force, uploadCache));
            result.accumulate(result.getItemImages());
        }
        if (includeBuffs) {
            runScopeSafely(result.getBuffs(), () -> syncBuffImages(result.getBuffs(), limit, uploadCache));
            result.accumulate(result.getBuffs());
        }
        if (includeBiomes) {
            runScopeSafely(result.getBiomes(), () -> syncBiomeIcons(result.getBiomes(), limit, uploadCache));
            result.accumulate(result.getBiomes());
        }

        LocalDateTime finishedAt = LocalDateTime.now();
        result.setFinishedAt(finishedAt);
        result.setDurationMs(Duration.between(result.getStartedAt(), finishedAt).toMillis());
        return result;
    }

    private void runScopeSafely(AdminWikiImageSyncScopeResultDTO scope, ThrowingRunnable action) {
        try {
            action.run();
        } catch (Exception exception) {
            log.warn("Wiki image sync scope failed: {}", scope.getScope(), exception);
            scope.setFailedCount(scope.getFailedCount() + 1);
            scope.addSampleError(trimErrorMessage(exception));
        }
    }

    private void syncItemImages(
        AdminWikiImageSyncScopeResultDTO scope,
        Integer limit,
        boolean force,
        Map<String, FileUploadResultDTO> uploadCache
    ) {
        List<ItemImage> images = itemImageMapper.selectList(new LambdaQueryWrapper<ItemImage>()
            .eq(ItemImage::getStatus, 1)
            .eq(ItemImage::getProvider, "wiki_gg")
            .orderByAsc(ItemImage::getId));

        for (ItemImage image : images) {
            String sourceUrl = resolveSourceUrl(image.getOriginalUrl(), image.getCachedUrl());
            if (!shouldConsiderWikiSource(sourceUrl, image.getCachedUrl())) {
                continue;
            }
            if (limitReached(scope, limit)) {
                break;
            }
            scope.setCandidateCount(scope.getCandidateCount() + 1);

            if (!force && isManagedUrl(image.getCachedUrl())) {
                scope.setSkippedCount(scope.getSkippedCount() + 1);
                continue;
            }

            if (!isWikiUrl(sourceUrl)) {
                scope.setFailedCount(scope.getFailedCount() + 1);
                scope.addSampleError("item_images#" + image.getId() + " missing wiki source url");
                continue;
            }

            try {
                FileUploadResultDTO upload = uploadFromWikiSource(
                    uploadCache,
                    sourceUrl,
                    "wiki/item-images/" + hashPrefix(sourceUrl),
                    buildStableId(sourceUrl, firstNonBlank(image.getSourceFileTitle(), image.getSourcePage(), image.getRole(), "item-image"))
                );
                image.setCachedUrl(upload.getUrl());
                image.setContentType(upload.getContentType());
                image.setLastVerifiedAt(LocalDateTime.now());
                itemImageMapper.updateById(image);
                scope.setSyncedCount(scope.getSyncedCount() + 1);
                scope.addSampleUrl(upload.getUrl());
            } catch (Exception exception) {
                log.warn("Failed to sync item image id={} url={}", image.getId(), sourceUrl, exception);
                scope.setFailedCount(scope.getFailedCount() + 1);
                scope.addSampleError("item_images#" + image.getId() + ": " + trimErrorMessage(exception));
            }
        }

        syncLegacyItemImages(scope, limit, force, uploadCache);
    }

    private void syncLegacyItemImages(
        AdminWikiImageSyncScopeResultDTO scope,
        Integer limit,
        boolean force,
        Map<String, FileUploadResultDTO> uploadCache
    ) {
        List<Item> items = itemMapper.selectList(new LambdaQueryWrapper<Item>()
            .isNotNull(Item::getImage)
            .orderByAsc(Item::getId));

        for (Item item : items) {
            String sourceUrl = normalizeFetchUrl(item.getImage());
            if (!StringUtils.hasText(sourceUrl) || isManagedUrl(item.getImage())) {
                continue;
            }
            if (limitReached(scope, limit)) {
                break;
            }

            scope.setCandidateCount(scope.getCandidateCount() + 1);

            if (!force && isManagedUrl(item.getImage())) {
                scope.setSkippedCount(scope.getSkippedCount() + 1);
                continue;
            }

            try {
                FileUploadResultDTO upload = uploadFromWikiSource(
                    uploadCache,
                    sourceUrl,
                    "legacy/items/" + hashPrefix(sourceUrl),
                    buildStableId(sourceUrl, firstNonBlank(item.getInternalName(), item.getNameZh(), item.getName(), "item"))
                );
                item.setImage(upload.getUrl());
                itemMapper.updateById(item);
                scope.setSyncedCount(scope.getSyncedCount() + 1);
                scope.addSampleUrl(upload.getUrl());
            } catch (Exception exception) {
                log.warn("Failed to sync legacy item image id={} url={}", item.getId(), sourceUrl, exception);
                scope.setFailedCount(scope.getFailedCount() + 1);
                scope.addSampleError("items#" + item.getId() + ": " + trimErrorMessage(exception));
            }
        }
    }

    private void syncBuffImages(
        AdminWikiImageSyncScopeResultDTO scope,
        Integer limit,
        Map<String, FileUploadResultDTO> uploadCache
    ) {
        List<Buff> buffs = buffMapper.selectList(new LambdaQueryWrapper<Buff>()
            .isNotNull(Buff::getImage)
            .orderByAsc(Buff::getId));

        for (Buff buff : buffs) {
            String currentUrl = trimToNull(buff.getImage());
            if (!shouldConsiderWikiSource(currentUrl, currentUrl)) {
                continue;
            }
            if (limitReached(scope, limit)) {
                break;
            }
            scope.setCandidateCount(scope.getCandidateCount() + 1);

            if (isManagedUrl(currentUrl)) {
                scope.setSkippedCount(scope.getSkippedCount() + 1);
                continue;
            }

            if (!isWikiUrl(currentUrl)) {
                scope.setFailedCount(scope.getFailedCount() + 1);
                scope.addSampleError("buffs#" + buff.getId() + " missing wiki source url");
                continue;
            }

            try {
                FileUploadResultDTO upload = uploadFromWikiSource(
                    uploadCache,
                    currentUrl,
                    "wiki/buffs/" + hashPrefix(currentUrl),
                    buildStableId(currentUrl, firstNonBlank(buff.getInternalName(), buff.getEnglishName(), buff.getNameZh(), "buff"))
                );
                buff.setImage(upload.getUrl());
                buffMapper.updateById(buff);
                scope.setSyncedCount(scope.getSyncedCount() + 1);
                scope.addSampleUrl(upload.getUrl());
            } catch (Exception exception) {
                log.warn("Failed to sync buff image id={} url={}", buff.getId(), currentUrl, exception);
                scope.setFailedCount(scope.getFailedCount() + 1);
                scope.addSampleError("buffs#" + buff.getId() + ": " + trimErrorMessage(exception));
            }
        }
    }

    private void syncBiomeIcons(
        AdminWikiImageSyncScopeResultDTO scope,
        Integer limit,
        Map<String, FileUploadResultDTO> uploadCache
    ) {
        List<Biome> biomes = biomeMapper.selectList(new LambdaQueryWrapper<Biome>()
            .isNotNull(Biome::getIconUrl)
            .orderByAsc(Biome::getId));

        for (Biome biome : biomes) {
            String currentUrl = trimToNull(biome.getIconUrl());
            if (!shouldConsiderWikiSource(currentUrl, currentUrl)) {
                continue;
            }
            if (limitReached(scope, limit)) {
                break;
            }
            scope.setCandidateCount(scope.getCandidateCount() + 1);

            if (isManagedUrl(currentUrl)) {
                scope.setSkippedCount(scope.getSkippedCount() + 1);
                continue;
            }

            if (!isWikiUrl(currentUrl)) {
                scope.setFailedCount(scope.getFailedCount() + 1);
                scope.addSampleError("biomes#" + biome.getId() + " missing wiki source url");
                continue;
            }

            try {
                FileUploadResultDTO upload = uploadFromWikiSource(
                    uploadCache,
                    currentUrl,
                    "wiki/biomes/" + hashPrefix(currentUrl),
                    buildStableId(currentUrl, firstNonBlank(biome.getCode(), biome.getNameEn(), biome.getNameZh(), "biome"))
                );
                biome.setIconUrl(upload.getUrl());
                biomeMapper.updateById(biome);
                scope.setSyncedCount(scope.getSyncedCount() + 1);
                scope.addSampleUrl(upload.getUrl());
            } catch (Exception exception) {
                log.warn("Failed to sync biome icon id={} url={}", biome.getId(), currentUrl, exception);
                scope.setFailedCount(scope.getFailedCount() + 1);
                scope.addSampleError("biomes#" + biome.getId() + ": " + trimErrorMessage(exception));
            }
        }
    }

    private FileUploadResultDTO uploadFromWikiSource(
        Map<String, FileUploadResultDTO> uploadCache,
        String sourceUrl,
        String pathPrefix,
        String stableId
    ) throws IOException, InterruptedException {
        FileUploadResultDTO cached = uploadCache.get(sourceUrl);
        if (cached != null) {
            return cached;
        }

        HttpResponse<byte[]> response = fetchImage(sourceUrl);
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("Unexpected HTTP status " + response.statusCode());
        }

        String originalFilename = extractFilename(sourceUrl);
        byte[] body = response.body();
        String contentType = normalizeContentType(response.headers().firstValue("content-type").orElse(null));
        if (!StringUtils.hasText(contentType)) {
            contentType = inferContentType(originalFilename);
        }
        validateImageContentType(contentType);
        validateImageSize(body.length);

        String objectKey = buildScopedObjectKey(pathPrefix, stableId, originalFilename, contentType);
        FileUploadResultDTO upload = uploadBytes(objectKey, originalFilename, contentType, body);
        uploadCache.put(sourceUrl, upload);
        return upload;
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

    private boolean shouldConsiderWikiSource(String sourceUrl, String currentValue) {
        return isWikiUrl(sourceUrl) || isManagedUrl(currentValue);
    }

    private boolean isWikiUrl(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return false;
        }
        String lowerCase = normalized.toLowerCase(Locale.ROOT);
        return (lowerCase.startsWith("http://") || lowerCase.startsWith("https://")) && lowerCase.contains("wiki.gg");
    }

    private boolean isManagedUrl(String value) {
        String normalized = trimToNull(value);
        return normalized != null && normalized.startsWith(getManagedUrlPrefix());
    }

    private String resolveSourceUrl(String originalUrl, String cachedUrl) {
        String original = normalizeFetchUrl(originalUrl);
        String cached = normalizeFetchUrl(cachedUrl);
        if (isWikiUrl(original)) {
            return original;
        }
        if (isWikiUrl(cached)) {
            return cached;
        }
        return original != null ? original : cached;
    }

    private String normalizeFetchUrl(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return null;
        }
        if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
            return normalized;
        }
        if (normalized.startsWith("//")) {
            return "http:" + normalized;
        }
        if (normalized.startsWith("localhost:") || normalized.startsWith("127.0.0.1:")) {
            return "http://" + normalized;
        }
        return null;
    }

    private Integer sanitizeLimit(Integer limit) {
        if (limit == null || limit <= 0) {
            return null;
        }
        return limit;
    }

    private boolean limitReached(AdminWikiImageSyncScopeResultDTO scope, Integer limit) {
        return limit != null && scope.getCandidateCount() >= limit;
    }

    private String buildStableId(String sourceUrl, String hint) {
        return sha1Hex(sourceUrl) + "-" + slugify(hint);
    }

    private String hashPrefix(String sourceUrl) {
        return sha1Hex(sourceUrl).substring(0, 2);
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

    private String trimErrorMessage(Exception exception) {
        String message = exception.getMessage();
        return message == null || message.isBlank() ? exception.getClass().getSimpleName() : message;
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

    private void ensureBucketReady() {
        if (bucketReady.get()) {
            return;
        }

        synchronized (bucketReady) {
            if (bucketReady.get()) {
                return;
            }

            try {
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

    private String sha1Hex(String value) {
        try {
            MessageDigest messageDigest = MessageDigest.getInstance("SHA-1");
            byte[] digest = messageDigest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(digest.length * 2);
            for (byte entry : digest) {
                builder.append(String.format("%02x", entry));
            }
            return builder.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-1 algorithm is not available", exception);
        }
    }

    @FunctionalInterface
    private interface ThrowingRunnable {
        void run() throws Exception;
    }
}

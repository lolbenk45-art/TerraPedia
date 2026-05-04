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
import com.terraria.skills.service.WikiImageLocalizationService;
import com.terraria.skills.service.WikiImageSyncService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

@Slf4j
@Service
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "terraria.storage.minio", name = "enabled", havingValue = "true", matchIfMissing = true)
public class WikiImageSyncServiceImpl implements WikiImageSyncService {

    private static final List<String> WIKI_IMAGE_PROVIDERS = List.of("wiki_gg", "terraria.wiki.gg");

    private final ItemImageMapper itemImageMapper;
    private final ItemMapper itemMapper;
    private final BuffMapper buffMapper;
    private final BiomeMapper biomeMapper;
    private final MinioConnectionDetails connectionDetails;
    private final WikiImageLocalizationService wikiImageLocalizationService;

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
            runScopeSafely(result.getBuffs(), () -> syncBuffImages(result.getBuffs(), limit, force, uploadCache));
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
            .in(ItemImage::getProvider, WIKI_IMAGE_PROVIDERS)
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
                image.setOriginalUrl(upload.getSourceUrl());
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

        syncLegacyItemImages(scope, limit, force, uploadCache, new ArrayList<>(images));
    }

    private void syncLegacyItemImages(
        AdminWikiImageSyncScopeResultDTO scope,
        Integer limit,
        boolean force,
        Map<String, FileUploadResultDTO> uploadCache,
        List<ItemImage> existingImages
    ) {
        List<Item> items = itemMapper.selectList(new LambdaQueryWrapper<Item>()
            .isNotNull(Item::getImage)
            .orderByAsc(Item::getId));

        for (Item item : items) {
            String sourceUrl = normalizeFetchUrl(item.getImage());
            if (!shouldConsiderWikiSource(sourceUrl, item.getImage()) || isManagedUrl(item.getImage())) {
                continue;
            }
            if (limitReached(scope, limit)) {
                break;
            }

            scope.setCandidateCount(scope.getCandidateCount() + 1);

            ItemImage existingImage = findMatchingLegacyItemImage(existingImages, item, sourceUrl);
            if (!force && existingImage != null && isManagedUrl(existingImage.getCachedUrl())) {
                if (!isWikiUrl(existingImage.getOriginalUrl())) {
                    existingImage.setOriginalUrl(sourceUrl);
                    existingImage.setLastVerifiedAt(LocalDateTime.now());
                    itemImageMapper.updateById(existingImage);
                }
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
                if (existingImage == null) {
                    existingImage = buildLegacyItemImage(item, sourceUrl);
                    existingImage.setCachedUrl(upload.getUrl());
                    existingImage.setContentType(upload.getContentType());
                    existingImage.setLastVerifiedAt(LocalDateTime.now());
                    itemImageMapper.insert(existingImage);
                    existingImages.add(existingImage);
                } else {
                    existingImage.setOriginalUrl(upload.getSourceUrl());
                    existingImage.setCachedUrl(upload.getUrl());
                    existingImage.setContentType(upload.getContentType());
                    existingImage.setLastVerifiedAt(LocalDateTime.now());
                    itemImageMapper.updateById(existingImage);
                }
                scope.setSyncedCount(scope.getSyncedCount() + 1);
                scope.addSampleUrl(upload.getUrl());
            } catch (Exception exception) {
                log.warn("Failed to sync legacy item image id={} url={}", item.getId(), sourceUrl, exception);
                scope.setFailedCount(scope.getFailedCount() + 1);
                scope.addSampleError("items#" + item.getId() + ": " + trimErrorMessage(exception));
            }
        }
    }

    private ItemImage buildLegacyItemImage(Item item, String sourceUrl) {
        ItemImage image = new ItemImage();
        image.setItemId(item.getId());
        image.setRole("icon");
        image.setProvider("wiki_gg");
        image.setSourceFileTitle(firstNonBlank(item.getInternalName(), item.getName(), item.getNameZh(), "item"));
        image.setSourcePage("items.image");
        image.setOriginalUrl(sourceUrl);
        image.setIsPrimary(Boolean.TRUE);
        image.setSortOrder(0);
        image.setStatus(1);
        image.setDeleted(0);
        return image;
    }

    private ItemImage findMatchingLegacyItemImage(List<ItemImage> images, Item item, String sourceUrl) {
        if (item.getId() == null || !StringUtils.hasText(sourceUrl)) {
            return null;
        }
        ItemImage primaryCandidate = null;
        for (ItemImage image : images) {
            if (!Objects.equals(image.getItemId(), item.getId())) {
                continue;
            }
            if (Objects.equals(normalizeFetchUrl(image.getOriginalUrl()), sourceUrl)
                || Objects.equals(normalizeFetchUrl(image.getCachedUrl()), sourceUrl)) {
                return image;
            }
            if (primaryCandidate == null && isLegacyPrimaryImageCandidate(image)) {
                primaryCandidate = image;
            }
        }
        return primaryCandidate;
    }

    private boolean isLegacyPrimaryImageCandidate(ItemImage image) {
        if (image == null) {
            return false;
        }
        if (image.getStatus() != null && image.getStatus() != 1) {
            return false;
        }
        if (image.getDeleted() != null && image.getDeleted() != 0) {
            return false;
        }
        String provider = trimToNull(image.getProvider());
        if (provider != null && !WIKI_IMAGE_PROVIDERS.contains(provider)) {
            return false;
        }
        String role = trimToNull(image.getRole());
        return role == null || "icon".equals(role) || Boolean.TRUE.equals(image.getIsPrimary());
    }

    private void syncBuffImages(
        AdminWikiImageSyncScopeResultDTO scope,
        Integer limit,
        boolean force,
        Map<String, FileUploadResultDTO> uploadCache
    ) {
        List<Buff> buffs = buffMapper.selectList(new LambdaQueryWrapper<Buff>()
            .and(wrapper -> wrapper
                .isNotNull(Buff::getImage)
                .or()
                .isNotNull(Buff::getImageOriginalUrl)
                .or()
                .isNotNull(Buff::getImageCachedUrl))
            .orderByAsc(Buff::getId));

        for (Buff buff : buffs) {
            String sourceUrl = resolveSourceUrl(buff.getImageOriginalUrl(), buff.getImage());
            String cachedUrl = firstNonBlank(
                trimToNull(buff.getImageCachedUrl()),
                isManagedUrl(buff.getImage()) ? trimToNull(buff.getImage()) : null
            );
            if (!shouldConsiderWikiSource(sourceUrl, cachedUrl)) {
                continue;
            }
            if (limitReached(scope, limit)) {
                break;
            }
            scope.setCandidateCount(scope.getCandidateCount() + 1);

            if (!force && isManagedUrl(cachedUrl)) {
                if (isWikiUrl(sourceUrl) && shouldBackfillBuffImageFallback(buff, sourceUrl)) {
                    buff.setImage(sourceUrl);
                    buff.setImageOriginalUrl(sourceUrl);
                    buff.setImageLastVerifiedAt(LocalDateTime.now());
                    buffMapper.updateById(buff);
                }
                scope.setSkippedCount(scope.getSkippedCount() + 1);
                continue;
            }

            if (!isWikiUrl(sourceUrl)) {
                scope.setFailedCount(scope.getFailedCount() + 1);
                scope.addSampleError("buffs#" + buff.getId() + " missing wiki source url");
                continue;
            }

            try {
                FileUploadResultDTO upload = uploadFromWikiSource(
                    uploadCache,
                    sourceUrl,
                    "wiki/buffs/" + hashPrefix(sourceUrl),
                    buildStableId(sourceUrl, firstNonBlank(buff.getInternalName(), buff.getEnglishName(), buff.getNameZh(), "buff"))
                );
                buff.setImage(upload.getSourceUrl());
                buff.setImageOriginalUrl(upload.getSourceUrl());
                buff.setImageCachedUrl(upload.getUrl());
                buff.setImageContentType(upload.getContentType());
                buff.setImageLastVerifiedAt(LocalDateTime.now());
                buffMapper.updateById(buff);
                scope.setSyncedCount(scope.getSyncedCount() + 1);
                scope.addSampleUrl(upload.getUrl());
            } catch (Exception exception) {
                log.warn("Failed to sync buff image id={} url={}", buff.getId(), sourceUrl, exception);
                scope.setFailedCount(scope.getFailedCount() + 1);
                scope.addSampleError("buffs#" + buff.getId() + ": " + trimErrorMessage(exception));
            }
        }
    }

    private boolean shouldBackfillBuffImageFallback(Buff buff, String sourceUrl) {
        return !Objects.equals(normalizeFetchUrl(buff.getImage()), sourceUrl)
            || !Objects.equals(normalizeFetchUrl(buff.getImageOriginalUrl()), sourceUrl);
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

        FileUploadResultDTO upload = wikiImageLocalizationService.mirrorWikiImage(sourceUrl, pathPrefix, stableId);
        uploadCache.put(sourceUrl, upload);
        if (StringUtils.hasText(upload.getSourceUrl())) {
            uploadCache.put(upload.getSourceUrl(), upload);
        }
        return upload;
    }

    private boolean shouldConsiderWikiSource(String sourceUrl, String currentValue) {
        return isWikiUrl(sourceUrl) || isManagedUrl(currentValue);
    }

    private boolean isWikiUrl(String value) {
        return wikiImageLocalizationService.isWikiImageUrl(value);
    }

    private boolean isManagedUrl(String value) {
        return wikiImageLocalizationService.isManagedImageUrl(value);
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
            return normalizeWikiImagePath(normalized);
        }
        if (normalized.startsWith("//")) {
            return "http:" + normalized;
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

    private String trimErrorMessage(Exception exception) {
        String message = exception.getMessage();
        return message == null || message.isBlank() ? exception.getClass().getSimpleName() : message;
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

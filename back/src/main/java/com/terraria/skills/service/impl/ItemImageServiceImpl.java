package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.terraria.skills.dto.ItemImageDTO;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.ItemImage;
import com.terraria.skills.mapper.ItemImageMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.ItemImageService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class ItemImageServiceImpl implements ItemImageService {

    private static final String MANAGED_IMAGE_PATH_SEGMENT = "/terrapedia-images/";
    private static final String WIKI_IMAGE_HOST = "terraria.wiki.gg";

    private final ItemImageMapper itemImageMapper;
    private final ItemMapper itemMapper;

    @Override
    public List<ItemImageDTO> getImagesByItemId(Long itemId) {
        List<ItemImage> images = itemImageMapper.selectList(new LambdaQueryWrapper<ItemImage>()
            .eq(ItemImage::getItemId, itemId)
            .eq(ItemImage::getStatus, 1)
            .orderByAsc(ItemImage::getSortOrder, ItemImage::getId));

        if (images != null && !images.isEmpty()) {
            List<ItemImageDTO> mappedImages = new ArrayList<>(images.stream()
                .map(this::toDto)
                .filter(Objects::nonNull)
                .toList());
            mappedImages.sort(Comparator
                .comparing(ItemImageServiceImpl::isPrimaryImage, Comparator.reverseOrder())
                .thenComparing(ItemImageServiceImpl::safeSortOrder)
                .thenComparing(ItemImageDTO::getId, Comparator.nullsLast(Long::compareTo)));
            if (!mappedImages.isEmpty()) {
                return mappedImages;
            }
        }

        Item item = itemMapper.selectById(itemId);
        String legacyImage = item == null ? null : trimToNull(item.getImage());
        ItemImageDTO fallback = buildLegacyFallback(itemId, legacyImage);
        return fallback == null ? Collections.emptyList() : List.of(fallback);
    }

    private ItemImageDTO buildLegacyFallback(Long itemId, String imageUrl) {
        String preferredUrl = preferredWikiItemIconUrl(imageUrl, imageUrl);
        if (preferredUrl == null) {
            return null;
        }

        ItemImageDTO fallback = new ItemImageDTO();
        fallback.setItemId(itemId);
        fallback.setRole("icon");
        fallback.setOriginalUrl(preferredUrl);
        fallback.setCachedUrl(preferredUrl);
        fallback.setIsPrimary(Boolean.TRUE);
        fallback.setSortOrder(1);
        fallback.setSourcePage("items.image");
        return fallback;
    }

    private ItemImageDTO toDto(ItemImage image) {
        ItemImageDTO dto = new ItemImageDTO();
        BeanUtils.copyProperties(image, dto);
        String preferredUrl = preferredWikiItemIconUrl(dto.getOriginalUrl(), dto.getCachedUrl());
        if (preferredUrl == null) {
            return null;
        }
        dto.setOriginalUrl(preferredUrl);
        dto.setCachedUrl(preferredUrl);
        return dto;
    }

    private static boolean isPrimaryImage(ItemImageDTO image) {
        return image != null && Boolean.TRUE.equals(image.getIsPrimary());
    }

    private static Integer safeSortOrder(ItemImageDTO image) {
        if (image == null || image.getSortOrder() == null) {
            return Integer.MAX_VALUE;
        }
        return image.getSortOrder();
    }

    private static String trimToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String preferredWikiItemIconUrl(String originalUrl, String cachedUrl) {
        String original = trimToNull(originalUrl);
        if (isAcceptableWikiItemIconUrl(original)) {
            return original;
        }
        String cached = trimToNull(cachedUrl);
        if (isAcceptableWikiItemIconUrl(cached)) {
            return cached;
        }
        return null;
    }

    private static boolean isAcceptableWikiItemIconUrl(String value) {
        String text = trimToNull(value);
        if (text == null) {
            return false;
        }
        String normalized = safeDecode(text).toLowerCase(Locale.ROOT);
        return (normalized.startsWith("https://") || normalized.startsWith("http://"))
            && normalized.contains(WIKI_IMAGE_HOST)
            && !normalized.contains(MANAGED_IMAGE_PATH_SEGMENT)
            && !normalized.contains("(demo)")
            && !normalized.contains("_demo")
            && !normalized.contains("(placed)")
            && !normalized.contains("_placed")
            && !normalized.contains("/placed_");
    }

    private static String safeDecode(String value) {
        try {
            return URLDecoder.decode(value, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException ignored) {
            return value;
        }
    }
}

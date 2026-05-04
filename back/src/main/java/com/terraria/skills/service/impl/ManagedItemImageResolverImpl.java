package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.ItemImage;
import com.terraria.skills.mapper.ItemImageMapper;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import com.terraria.skills.service.ManagedItemImageResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class ManagedItemImageResolverImpl implements ManagedItemImageResolver {

    private static final Pattern NON_ITEM_ICON_VARIANT_TOKEN =
        Pattern.compile("(^|[/_\\s-])(demo|placed)([._?&#/-]|$)");

    private final ItemImageMapper itemImageMapper;
    private final ManagedImageUrlPolicy managedImageUrlPolicy;

    @Override
    public Map<Long, String> resolveManagedImages(Collection<Item> items) {
        if (items == null || items.isEmpty()) {
            return Map.of();
        }

        Map<Long, Item> itemsById = new LinkedHashMap<>();
        for (Item item : items) {
            if (item != null && item.getId() != null) {
                itemsById.putIfAbsent(item.getId(), item);
            }
        }
        if (itemsById.isEmpty()) {
            return Map.of();
        }

        Map<Long, String> resolved = new LinkedHashMap<>();
        List<ItemImage> imageRows = itemImageMapper.selectList(new LambdaQueryWrapper<ItemImage>()
            .in(ItemImage::getItemId, itemsById.keySet())
            .eq(ItemImage::getStatus, 1)
            .eq(ItemImage::getDeleted, 0)
            .isNotNull(ItemImage::getCachedUrl)
            .orderByAsc(ItemImage::getItemId, ItemImage::getSortOrder, ItemImage::getId));

        imageRows.stream()
            .filter(Objects::nonNull)
            .filter(image -> image.getItemId() != null)
            .filter(image -> isUsableManagedImage(image.getCachedUrl()))
            .sorted(Comparator
                .comparing(ItemImage::getItemId, Comparator.nullsLast(Long::compareTo))
                .thenComparing(ManagedItemImageResolverImpl::isPrimaryImage, Comparator.reverseOrder())
                .thenComparing(ManagedItemImageResolverImpl::safeSortOrder)
                .thenComparing(ItemImage::getId, Comparator.nullsLast(Long::compareTo)))
            .forEach(image -> resolved.putIfAbsent(image.getItemId(), image.getCachedUrl().trim()));

        for (Item item : itemsById.values()) {
            if (!resolved.containsKey(item.getId()) && isUsableManagedImage(item.getImage())) {
                resolved.put(item.getId(), item.getImage().trim());
            }
        }
        return resolved;
    }

    @Override
    public String resolveManagedImage(Item item, Map<Long, String> managedImagesByItemId) {
        if (item == null || item.getId() == null) {
            return null;
        }
        String resolved = managedImagesByItemId == null ? null : managedImagesByItemId.get(item.getId());
        if (isUsableManagedImage(resolved)) {
            return resolved.trim();
        }
        if (isUsableManagedImage(item.getImage())) {
            return item.getImage().trim();
        }
        return null;
    }

    private boolean isUsableManagedImage(String value) {
        String text = trimToNull(value);
        return text != null
            && managedImageUrlPolicy.isManagedImageUrl(text)
            && !isNonItemIconVariant(text);
    }

    private static boolean isPrimaryImage(ItemImage image) {
        return image != null && Boolean.TRUE.equals(image.getIsPrimary());
    }

    private static Integer safeSortOrder(ItemImage image) {
        if (image == null || image.getSortOrder() == null) {
            return Integer.MAX_VALUE;
        }
        return image.getSortOrder();
    }

    private static boolean isNonItemIconVariant(String value) {
        String text = trimToNull(value);
        if (text == null) {
            return false;
        }
        String normalized = safeDecode(text).toLowerCase();
        return normalized.contains("(demo)")
            || normalized.contains("(placed)")
            || normalized.contains("%28demo%29")
            || normalized.contains("%28placed%29")
            || NON_ITEM_ICON_VARIANT_TOKEN.matcher(normalized).find();
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String safeDecode(String value) {
        try {
            return URLDecoder.decode(value, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException ignored) {
            return value;
        }
    }
}

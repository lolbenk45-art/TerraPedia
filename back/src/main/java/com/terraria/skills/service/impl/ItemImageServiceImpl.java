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

import java.util.ArrayList;
import java.util.Comparator;
import java.util.Collections;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ItemImageServiceImpl implements ItemImageService {

    private static final String MANAGED_IMAGE_PATH_SEGMENT = "/terrapedia-images/";

    private final ItemImageMapper itemImageMapper;
    private final ItemMapper itemMapper;

    @Override
    public List<ItemImageDTO> getImagesByItemId(Long itemId) {
        List<ItemImage> images = itemImageMapper.selectList(new LambdaQueryWrapper<ItemImage>()
            .eq(ItemImage::getItemId, itemId)
            .eq(ItemImage::getStatus, 1)
            .orderByAsc(ItemImage::getSortOrder, ItemImage::getId));

        if (images != null && !images.isEmpty()) {
            List<ItemImageDTO> mappedImages = new ArrayList<>(images.stream().map(this::toDto).toList());
            String legacyImage = null;
            if (mappedImages.stream().noneMatch(ItemImageServiceImpl::isManagedImage)) {
                Item item = itemMapper.selectById(itemId);
                legacyImage = item == null ? null : trimToNull(item.getImage());
            }
            String managedLegacyImage = legacyImage;
            if (isManagedUrl(managedLegacyImage) && mappedImages.stream().noneMatch(image -> sameUrl(image.getCachedUrl(), managedLegacyImage))) {
                ItemImageDTO fallback = buildLegacyFallback(itemId, managedLegacyImage);
                if (fallback != null) {
                    mappedImages.add(fallback);
                }
            }
            mappedImages.sort(Comparator
                .comparing(ItemImageServiceImpl::isManagedImage, Comparator.reverseOrder())
                .thenComparing(ItemImageServiceImpl::isPrimaryImage, Comparator.reverseOrder())
                .thenComparing(ItemImageServiceImpl::safeSortOrder)
                .thenComparing(ItemImageDTO::getId, Comparator.nullsLast(Long::compareTo)));
            return mappedImages;
        }

        Item item = itemMapper.selectById(itemId);
        String legacyImage = item == null ? null : trimToNull(item.getImage());
        ItemImageDTO fallback = buildLegacyFallback(itemId, legacyImage);
        return fallback == null ? Collections.emptyList() : List.of(fallback);
    }

    private ItemImageDTO buildLegacyFallback(Long itemId, String imageUrl) {
        if (!StringUtils.hasText(imageUrl)) {
            return null;
        }

        ItemImageDTO fallback = new ItemImageDTO();
        fallback.setItemId(itemId);
        fallback.setRole("icon");
        fallback.setCachedUrl(imageUrl);
        fallback.setIsPrimary(Boolean.TRUE);
        fallback.setSortOrder(1);
        fallback.setSourcePage("items.image");
        return fallback;
    }

    private ItemImageDTO toDto(ItemImage image) {
        ItemImageDTO dto = new ItemImageDTO();
        BeanUtils.copyProperties(image, dto);
        return dto;
    }

    private static boolean isManagedImage(ItemImageDTO image) {
        return image != null && isManagedUrl(image.getCachedUrl());
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

    private static boolean isManagedUrl(String value) {
        return trimToNull(value) != null && value.contains(MANAGED_IMAGE_PATH_SEGMENT);
    }

    private static String trimToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static boolean sameUrl(String left, String right) {
        String normalizedLeft = trimToNull(left);
        String normalizedRight = trimToNull(right);
        if (normalizedLeft == null || normalizedRight == null) {
            return false;
        }
        return normalizedLeft.equalsIgnoreCase(normalizedRight);
    }
}

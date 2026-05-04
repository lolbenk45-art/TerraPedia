package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.ItemImageDTO;
import com.terraria.skills.dto.ItemSourceDTO;
import com.terraria.skills.dto.PublicItemImageDTO;
import com.terraria.skills.dto.PublicItemSourceDTO;
import com.terraria.skills.service.ItemImageService;
import com.terraria.skills.service.ItemSourceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

@RestController
@RequestMapping("/public/items")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Public Item Relations", description = "Public lightweight item relation APIs")
public class PublicItemRelationController {

    private static final String MANAGED_IMAGE_SEGMENT = "/terrapedia-images/";

    private final ItemImageService itemImageService;
    private final ItemSourceService itemSourceService;

    @GetMapping("/{id}/images")
    @Operation(summary = "Get public managed images for the item")
    public ResponseEntity<ApiResponse<List<PublicItemImageDTO>>> getItemImages(@PathVariable("id") Long itemId) {
        List<PublicItemImageDTO> images = itemImageService.getImagesByItemId(itemId).stream()
            .map(source -> toPublicImage(itemId, source))
            .filter(Objects::nonNull)
            .sorted(Comparator
                .comparing(PublicItemRelationController::isPrimaryImage, Comparator.reverseOrder())
                .thenComparing(PublicItemRelationController::safeSortOrder)
                .thenComparing(PublicItemImageDTO::getId, Comparator.nullsLast(Long::compareTo)))
            .toList();
        return ResponseEntity.ok(ApiResponse.success(images));
    }

    @GetMapping("/{id}/sources")
    @Operation(summary = "Get public acquisition sources for the item")
    public ResponseEntity<ApiResponse<List<PublicItemSourceDTO>>> getItemSources(@PathVariable("id") Long itemId) {
        List<PublicItemSourceDTO> sources = itemSourceService.getSourcesByItemId(itemId).stream()
            .map(source -> toPublicSource(itemId, source))
            .toList();
        return ResponseEntity.ok(ApiResponse.success(sources));
    }

    private PublicItemImageDTO toPublicImage(Long itemId, ItemImageDTO source) {
        String imageUrl = managedImageUrl(source == null ? null : source.getImageUrl());
        if (imageUrl == null) {
            imageUrl = managedImageUrl(source == null ? null : source.getCachedUrl());
        }
        if (imageUrl == null && source != null && (hasText(source.getImageUrl()) || hasText(source.getCachedUrl()))) {
            log.warn("public item image dropped non-managed url itemId={} imageId={} role={} sourceFileTitle={}",
                itemId, source.getId(), source.getRole(), source.getSourceFileTitle());
        }
        if (imageUrl == null) {
            return null;
        }

        PublicItemImageDTO target = new PublicItemImageDTO();
        target.setId(source.getId());
        target.setItemId(source.getItemId());
        target.setRole(source.getRole());
        target.setImageUrl(imageUrl);
        target.setWidth(source.getWidth());
        target.setHeight(source.getHeight());
        target.setIsPrimary(source.getIsPrimary());
        target.setSortOrder(source.getSortOrder());
        return target;
    }

    private PublicItemSourceDTO toPublicSource(Long itemId, ItemSourceDTO source) {
        PublicItemSourceDTO target = new PublicItemSourceDTO();
        BeanUtils.copyProperties(source, target);
        target.setConditions(publicText(itemId, source, "conditions", target.getConditions()));
        target.setNotes(publicText(itemId, source, "notes", target.getNotes()));
        return target;
    }

    private static boolean isPrimaryImage(PublicItemImageDTO image) {
        return image != null && Boolean.TRUE.equals(image.getIsPrimary());
    }

    private static Integer safeSortOrder(PublicItemImageDTO image) {
        return image == null || image.getSortOrder() == null ? Integer.MAX_VALUE : image.getSortOrder();
    }

    private String managedImageUrl(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim();
        String lower = trimmed.toLowerCase(Locale.ROOT);
        return (lower.startsWith("http://") || lower.startsWith("https://")) && lower.contains(MANAGED_IMAGE_SEGMENT)
            ? trimmed
            : null;
    }

    private String publicText(Long itemId, ItemSourceDTO source, String fieldName, String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim();
        String lower = trimmed.toLowerCase(Locale.ROOT);
        if (lower.contains("terraria.wiki.gg") || lower.contains("static.wikia.nocookie.net")) {
            log.warn("public item source dropped wiki reference itemId={} sourceId={} sourceType={} field={}",
                itemId, source.getId(), source.getSourceType(), fieldName);
            return null;
        }
        return trimmed;
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}

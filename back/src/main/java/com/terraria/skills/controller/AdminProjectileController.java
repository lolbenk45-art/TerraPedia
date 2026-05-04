package com.terraria.skills.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.entity.Projectile;
import com.terraria.skills.mapper.ProjectileMapper;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/admin/projectiles")
@RequiredArgsConstructor
@Tag(name = "AdminProjectiles", description = "Admin projectile management")
@SecurityRequirement(name = "bearerAuth")
public class AdminProjectileController {

    private final ProjectileMapper projectileMapper;
    private final ObjectMapper objectMapper;
    private final ManagedImageUrlPolicy managedImageUrlPolicy;

    @GetMapping
    @Operation(summary = "Get projectiles")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getProjectiles(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String search
    ) {
        int safePage = PaginationParams.resolvePage(page);
        int safeLimit = PaginationParams.resolveLimit(limit, size, 20, 100);
        LambdaQueryWrapper<Projectile> wrapper = new LambdaQueryWrapper<Projectile>()
            .orderByAsc(Projectile::getId);
        if (search != null && !search.isBlank()) {
            String keyword = search.trim();
            wrapper.and(w -> w.like(Projectile::getInternalName, keyword)
                .or().like(Projectile::getNameZh, keyword)
                .or().like(Projectile::getName, keyword));
        }
        Page<Projectile> mpPage = projectileMapper.selectPage(new Page<>(safePage, safeLimit), wrapper);
        Pagination pagination = new Pagination(mpPage.getTotal(), (int) mpPage.getCurrent(), (int) mpPage.getSize());
        ApiResponse<List<Map<String, Object>>> response = ApiResponse.success(mpPage.getRecords().stream().map(this::toPayload).toList());
        response.setPagination(pagination);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get projectile detail")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getProjectileById(@PathVariable Long id) {
        Projectile projectile = projectileMapper.selectById(id);
        if (projectile == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Projectile not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(toPayload(projectile)));
    }

    @PostMapping
    @Operation(summary = "Create projectile")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createProjectile(@RequestBody Projectile request) {
        if (request == null || request.getSourceId() == null || request.getInternalName() == null || request.getInternalName().isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "sourceId and internalName are required"));
        }
        Long duplicate = projectileMapper.selectCount(new LambdaQueryWrapper<Projectile>().eq(Projectile::getSourceId, request.getSourceId()));
        if (duplicate != null && duplicate > 0) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "sourceId already exists"));
        }

        request.setId(null);
        if (request.getStatus() == null) request.setStatus(1);
        projectileMapper.insert(request);
        Projectile created = projectileMapper.selectById(request.getId());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(created == null ? null : toPayload(created), "Projectile created"));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update projectile")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateProjectile(@PathVariable Long id, @RequestBody Projectile request) {
        Projectile existing = projectileMapper.selectById(id);
        if (existing == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Projectile not found"));
        }
        if (request.getSourceId() != null) {
            Long duplicate = projectileMapper.selectCount(
                new LambdaQueryWrapper<Projectile>()
                    .eq(Projectile::getSourceId, request.getSourceId())
                    .ne(Projectile::getId, id)
            );
            if (duplicate != null && duplicate > 0) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "sourceId already exists"));
            }
            existing.setSourceId(request.getSourceId());
        }

        if (request.getInternalName() != null && !request.getInternalName().isBlank()) existing.setInternalName(request.getInternalName().trim());
        if (request.getName() != null) existing.setName(request.getName());
        if (request.getNameZh() != null) existing.setNameZh(request.getNameZh());
        if (request.getImageUrl() != null) existing.setImageUrl(request.getImageUrl());
        if (request.getAiStyle() != null) existing.setAiStyle(request.getAiStyle());
        if (request.getDamage() != null) existing.setDamage(request.getDamage());
        if (request.getKnockBack() != null) existing.setKnockBack(request.getKnockBack());
        if (request.getPenetrate() != null) existing.setPenetrate(request.getPenetrate());
        if (request.getTimeLeft() != null) existing.setTimeLeft(request.getTimeLeft());
        if (request.getWidth() != null) existing.setWidth(request.getWidth());
        if (request.getHeight() != null) existing.setHeight(request.getHeight());
        if (request.getScale() != null) existing.setScale(request.getScale());
        if (request.getFriendly() != null) existing.setFriendly(request.getFriendly());
        if (request.getHostile() != null) existing.setHostile(request.getHostile());
        if (request.getTileCollide() != null) existing.setTileCollide(request.getTileCollide());
        if (request.getRawJson() != null) existing.setRawJson(request.getRawJson());
        if (request.getSourceItemsJson() != null) existing.setSourceItemsJson(request.getSourceItemsJson());
        if (request.getSourceNpcsJson() != null) existing.setSourceNpcsJson(request.getSourceNpcsJson());
        if (request.getStatus() != null) existing.setStatus(request.getStatus());
        projectileMapper.updateById(existing);
        return ResponseEntity.ok(ApiResponse.success(toPayload(projectileMapper.selectById(id)), "Projectile updated"));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete projectile")
    public ResponseEntity<ApiResponse<Void>> deleteProjectile(@PathVariable Long id) {
        Projectile existing = projectileMapper.selectById(id);
        if (existing == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Projectile not found"));
        }
        projectileMapper.deleteById(id);
        return ResponseEntity.ok(ApiResponse.success(null, "Projectile deleted"));
    }

    private Map<String, Object> toPayload(Projectile projectile) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", projectile.getId());
        payload.put("sourceId", projectile.getSourceId());
        payload.put("internalName", projectile.getInternalName());
        payload.put("name", projectile.getName());
        payload.put("nameZh", projectile.getNameZh());
        payload.put("nameEn", projectile.getName());
        payload.put("aiStyle", projectile.getAiStyle());
        payload.put("damage", projectile.getDamage());
        payload.put("knockBack", projectile.getKnockBack());
        payload.put("penetrate", projectile.getPenetrate());
        payload.put("timeLeft", projectile.getTimeLeft());
        payload.put("width", projectile.getWidth());
        payload.put("height", projectile.getHeight());
        payload.put("scale", projectile.getScale());
        payload.put("friendly", projectile.getFriendly());
        payload.put("hostile", projectile.getHostile());
        payload.put("tileCollide", projectile.getTileCollide());
        payload.put("rawJson", projectile.getRawJson());
        payload.put("sourceItemsJson", projectile.getSourceItemsJson());
        payload.put("sourceNpcsJson", projectile.getSourceNpcsJson());
        payload.put("sourceItems", parseJsonArray(projectile.getSourceItemsJson()));
        payload.put("sourceNpcs", parseJsonArray(projectile.getSourceNpcsJson()));
        payload.put("status", projectile.getStatus());
        payload.put("deleted", projectile.getDeleted());
        payload.put("createdAt", projectile.getCreatedAt());
        payload.put("updatedAt", projectile.getUpdatedAt());
        payload.put("imageUrl", firstNonBlank(
            managedImageOrNull(projectile.getImageUrl(), "admin projectile image_url"),
            managedImageOrNull(extractImageUrl(projectile.getRawJson()), "admin projectile rawJson imageUrl")
        ));
        return payload;
    }

    private String managedImageOrNull(String value, String context) {
        String text = trimToNull(value);
        if (text == null) {
            return null;
        }
        if (managedImageUrlPolicy.isManagedImageUrl(text)) {
            return text;
        }
        log.warn("admin projectile display image suppressed non-managed url context={}", context);
        return null;
    }

    private String trimToNull(Object value) {
        if (value == null) return null;
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }

    private String firstNonBlank(String... values) {
        if (values == null) return null;
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return null;
    }

    private List<?> parseJsonArray(String rawJson) {
        if (rawJson == null || rawJson.isBlank()) return List.of();
        try {
            Object parsed = objectMapper.readValue(rawJson, Object.class);
            return parsed instanceof List<?> list ? list : List.of();
        } catch (Exception ignored) {
            return List.of();
        }
    }

    private String extractImageUrl(String rawJson) {
        if (rawJson == null || rawJson.isBlank()) return null;
        try {
            Object parsed = objectMapper.readValue(rawJson, Object.class);
            if (parsed instanceof Map<?, ?> map) {
                Object imageUrl = map.get("imageUrl");
                return imageUrl == null ? null : String.valueOf(imageUrl);
            }
        } catch (Exception ignored) {
        }
        return null;
    }
}

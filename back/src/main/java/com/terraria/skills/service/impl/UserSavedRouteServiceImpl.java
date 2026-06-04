package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.UserSavedRouteDTO;
import com.terraria.skills.dto.UserSavedRouteRequestDTO;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.UserSavedRoute;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.mapper.UserSavedRouteMapper;
import com.terraria.skills.service.SecurityAuditService;
import com.terraria.skills.service.UserSavedRouteService;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class UserSavedRouteServiceImpl implements UserSavedRouteService {

    private static final String TARGET_CRAFTING_ITEM = "CRAFTING_ITEM";
    private static final String DEFAULT_ROUTE_MODE = "crafting";
    private static final int DEFAULT_MAX_DEPTH = 5;

    private final UserSavedRouteMapper userSavedRouteMapper;
    private final ItemMapper itemMapper;
    private final SecurityAuditService securityAuditService;
    private final ObjectMapper objectMapper;

    @Override
    public UserSavedRouteDTO saveRoute(Long userId, UserSavedRouteRequestDTO request, String ipAddress) {
        Long normalizedUserId = requireUserId(userId);
        String targetType = normalizeTargetType(request.getTargetType());
        Long targetId = requirePositive(request.getTargetId(), "targetId");
        requireActiveItem(targetId);
        String routeMode = normalizeRouteMode(request.getRouteMode());

        UserSavedRoute route = new UserSavedRoute();
        route.setUserId(normalizedUserId);
        route.setTargetType(targetType);
        route.setTargetId(targetId);
        route.setRouteMode(routeMode);
        route.setTitle(requireText(request.getTitle(), 255, "title"));
        route.setNote(trimToMax(request.getNote(), 600));
        route.setUrl(requireSafeRouteUrl(request.getUrl(), targetId));
        route.setSelectedVariant(trimToMax(request.getSelectedVariant(), 120));
        route.setSelectedRecipeKey(trimToMax(request.getSelectedRecipeKey(), 120));
        route.setMaxDepth(normalizeMaxDepth(request.getMaxDepth()));
        route.setSnapshotJson(normalizeSnapshotJson(request.getSnapshotJson()));
        route.setDeleted(0);

        UserSavedRoute existing = userSavedRouteMapper.selectByUserAndTargetIncludeDeleted(normalizedUserId, targetType, targetId, routeMode);
        if (existing == null) {
            try {
                userSavedRouteMapper.insert(route);
            } catch (DuplicateKeyException exception) {
                existing = userSavedRouteMapper.selectByUserAndTargetIncludeDeleted(normalizedUserId, targetType, targetId, routeMode);
                if (existing == null) {
                    throw exception;
                }
                route.setId(existing.getId());
                userSavedRouteMapper.updateExisting(route);
            }
        } else {
            route.setId(existing.getId());
            userSavedRouteMapper.updateExisting(route);
        }

        securityAuditService.log("USER_SAVED_ROUTE_UPSERTED", "USER", normalizedUserId, null, ipAddress, "targetType=" + targetType + ",targetId=" + targetId);
        return resolveRoute(normalizedUserId, route.getId());
    }

    @Override
    public Page<UserSavedRouteDTO> getRoutes(Long userId, int page, int limit) {
        Long normalizedUserId = requireUserId(userId);
        long current = Math.max(1, page);
        long size = Math.max(1, Math.min(limit, 100));
        long offset = (current - 1) * size;
        Page<UserSavedRouteDTO> result = new Page<>(current, size, userSavedRouteMapper.countActiveByUser(normalizedUserId));
        result.setRecords(userSavedRouteMapper.selectActiveRoutesPage(normalizedUserId, size, offset));
        return result;
    }

    @Override
    public UserSavedRouteDTO removeRoute(Long userId, Long id, String ipAddress) {
        Long normalizedUserId = requireUserId(userId);
        Long normalizedId = requirePositive(id, "id");
        UserSavedRouteDTO existing = userSavedRouteMapper.selectActiveRouteById(normalizedUserId, normalizedId);
        if (existing == null) {
            throw new IllegalArgumentException("Saved route not found");
        }
        userSavedRouteMapper.softDelete(normalizedUserId, normalizedId);
        securityAuditService.log("USER_SAVED_ROUTE_REMOVED", "USER", normalizedUserId, null, ipAddress, "routeId=" + normalizedId);
        return existing;
    }

    private UserSavedRouteDTO resolveRoute(Long userId, Long id) {
        UserSavedRouteDTO route = userSavedRouteMapper.selectActiveRouteById(userId, id);
        if (route == null) {
            throw new IllegalStateException("Saved route was not recoverable");
        }
        return route;
    }

    private void requireActiveItem(Long itemId) {
        Item item = itemMapper.selectById(itemId);
        if (item == null || item.getDeleted() != null && item.getDeleted() == 1) {
            throw new IllegalArgumentException("Target item not found");
        }
        if (item.getStatus() != null && item.getStatus() != 1) {
            throw new IllegalArgumentException("Target item is unavailable");
        }
    }

    private String normalizeSnapshotJson(String snapshotJson) {
        String normalized = trimToMax(snapshotJson, 4000);
        if (normalized == null) {
            return null;
        }
        try {
            objectMapper.readTree(normalized);
            return normalized;
        } catch (Exception exception) {
            throw new IllegalArgumentException("snapshotJson must be valid JSON");
        }
    }

    private String requireSafeRouteUrl(String url, Long targetId) {
        String normalized = requireText(url, 500, "url");
        if (!normalized.startsWith("/crafting")) {
            throw new IllegalArgumentException("Only crafting route URLs are supported");
        }
        if (!normalized.contains("itemId=" + targetId)) {
            throw new IllegalArgumentException("Route URL must point to the saved target item");
        }
        return normalized;
    }

    private String normalizeTargetType(String targetType) {
        String normalized = String.valueOf(targetType == null ? "" : targetType).trim().toUpperCase();
        if (!TARGET_CRAFTING_ITEM.equals(normalized)) {
            throw new IllegalArgumentException("Unsupported saved route target type");
        }
        return normalized;
    }

    private String normalizeRouteMode(String routeMode) {
        String normalized = routeMode == null || routeMode.isBlank() ? DEFAULT_ROUTE_MODE : routeMode.trim();
        if (!DEFAULT_ROUTE_MODE.equals(normalized)) {
            throw new IllegalArgumentException("Unsupported route mode");
        }
        return normalized;
    }

    private int normalizeMaxDepth(Integer value) {
        if (value == null) return DEFAULT_MAX_DEPTH;
        return Math.max(1, Math.min(value, DEFAULT_MAX_DEPTH));
    }

    private Long requireUserId(Long userId) {
        return requirePositive(userId, "userId");
    }

    private Long requirePositive(Long value, String label) {
        if (value == null || value <= 0) {
            throw new IllegalArgumentException("Invalid " + label);
        }
        return value;
    }

    private String requireText(String value, int max, String label) {
        String normalized = trimToMax(value, max);
        if (normalized == null) {
            throw new IllegalArgumentException(label + " is required");
        }
        return normalized;
    }

    private String trimToMax(String value, int max) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim();
        if (normalized.length() > max) {
            throw new IllegalArgumentException("Value is too long");
        }
        return normalized;
    }
}

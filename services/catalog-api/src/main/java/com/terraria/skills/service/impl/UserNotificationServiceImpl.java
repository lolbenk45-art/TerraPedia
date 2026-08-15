package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.UserNotificationDTO;
import com.terraria.skills.entity.UserNotification;
import com.terraria.skills.mapper.UserNotificationMapper;
import com.terraria.skills.service.SecurityAuditService;
import com.terraria.skills.service.UserNotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class UserNotificationServiceImpl implements UserNotificationService {

    private final UserNotificationMapper userNotificationMapper;
    private final SecurityAuditService securityAuditService;

    @Override
    public UserNotificationDTO createNotification(Long userId, String type, String title, String body, String targetUrl) {
        Long normalizedUserId = requireUserId(userId);
        String normalizedType = requireText(type, 60, "type");
        String normalizedTitle = requireText(title, 255, "title");

        UserNotification notification = new UserNotification();
        notification.setUserId(normalizedUserId);
        notification.setType(normalizedType);
        notification.setTitle(normalizedTitle);
        notification.setBody(trimToMax(body, 1000));
        notification.setTargetUrl(trimToMax(targetUrl, 500));
        notification.setRead(0);
        notification.setDeleted(0);
        userNotificationMapper.insert(notification);
        return toDto(notification);
    }

    @Override
    public Page<UserNotificationDTO> getNotifications(Long userId, boolean unreadOnly, int page, int limit) {
        Long normalizedUserId = requireUserId(userId);
        long current = Math.max(1, page);
        long size = Math.max(1, Math.min(limit, 100));
        long offset = (current - 1) * size;
        Page<UserNotificationDTO> result = new Page<>(current, size, userNotificationMapper.countActiveNotifications(normalizedUserId, unreadOnly));
        result.setRecords(userNotificationMapper.selectActiveNotificationsPage(normalizedUserId, unreadOnly, size, offset));
        return result;
    }

    @Override
    public long countUnread(Long userId) {
        return userNotificationMapper.countUnreadByUser(requireUserId(userId));
    }

    @Override
    public UserNotificationDTO markRead(Long userId, Long id, String ipAddress) {
        Long normalizedUserId = requireUserId(userId);
        Long normalizedId = requirePositive(id, "id");
        UserNotificationDTO existing = userNotificationMapper.selectActiveNotificationById(normalizedUserId, normalizedId);
        if (existing == null) {
            throw new IllegalArgumentException("Notification not found");
        }
        userNotificationMapper.markRead(normalizedUserId, normalizedId);
        securityAuditService.log("USER_NOTIFICATION_MARK_READ", "USER", normalizedUserId, null, ipAddress, "notificationId=" + normalizedId);
        UserNotificationDTO updated = userNotificationMapper.selectActiveNotificationById(normalizedUserId, normalizedId);
        return updated == null ? existing : updated;
    }

    @Override
    public int markAllRead(Long userId, String ipAddress) {
        Long normalizedUserId = requireUserId(userId);
        int updated = userNotificationMapper.markAllRead(normalizedUserId);
        securityAuditService.log("USER_NOTIFICATION_MARK_ALL_READ", "USER", normalizedUserId, null, ipAddress, "updated=" + updated);
        return updated;
    }

    private UserNotificationDTO toDto(UserNotification notification) {
        return UserNotificationDTO.builder()
            .id(notification.getId())
            .type(notification.getType())
            .title(notification.getTitle())
            .body(notification.getBody())
            .targetUrl(notification.getTargetUrl())
            .read(notification.getRead() != null && notification.getRead() == 1)
            .readAt(notification.getReadAt())
            .createdAt(notification.getCreatedAt())
            .build();
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

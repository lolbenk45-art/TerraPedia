package com.terraria.skills.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.UserNotificationDTO;

public interface UserNotificationService {

    UserNotificationDTO createNotification(Long userId, String type, String title, String body, String targetUrl);

    Page<UserNotificationDTO> getNotifications(Long userId, boolean unreadOnly, int page, int limit);

    long countUnread(Long userId);

    UserNotificationDTO markRead(Long userId, Long id, String ipAddress);

    int markAllRead(Long userId, String ipAddress);
}

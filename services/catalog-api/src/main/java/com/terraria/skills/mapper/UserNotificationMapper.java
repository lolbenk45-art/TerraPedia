package com.terraria.skills.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.terraria.skills.dto.UserNotificationDTO;
import com.terraria.skills.entity.UserNotification;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface UserNotificationMapper extends BaseMapper<UserNotification> {

    long countActiveNotifications(@Param("userId") Long userId, @Param("unreadOnly") boolean unreadOnly);

    long countUnreadByUser(@Param("userId") Long userId);

    List<UserNotificationDTO> selectActiveNotificationsPage(
        @Param("userId") Long userId,
        @Param("unreadOnly") boolean unreadOnly,
        @Param("limit") long limit,
        @Param("offset") long offset
    );

    UserNotificationDTO selectActiveNotificationById(@Param("userId") Long userId, @Param("id") Long id);

    int markRead(@Param("userId") Long userId, @Param("id") Long id);

    int markAllRead(@Param("userId") Long userId);
}

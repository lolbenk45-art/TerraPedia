package com.terraria.skills.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.UserReadingHistoryDTO;

public interface UserReadingHistoryService {

    UserReadingHistoryDTO record(Long userId, String targetType, Long targetId, String ipAddress);

    Page<UserReadingHistoryDTO> getHistory(Long userId, String type, int page, int limit);

    UserReadingHistoryDTO remove(Long userId, String targetType, Long targetId, String ipAddress);
}

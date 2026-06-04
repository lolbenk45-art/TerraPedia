package com.terraria.skills.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.UserSavedRouteDTO;
import com.terraria.skills.dto.UserSavedRouteRequestDTO;

public interface UserSavedRouteService {

    UserSavedRouteDTO saveRoute(Long userId, UserSavedRouteRequestDTO request, String ipAddress);

    Page<UserSavedRouteDTO> getRoutes(Long userId, int page, int limit);

    UserSavedRouteDTO removeRoute(Long userId, Long id, String ipAddress);
}

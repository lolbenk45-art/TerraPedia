package com.terraria.skills.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.AdminUserCreateRequestDTO;
import com.terraria.skills.dto.AdminUserListItemDTO;
import com.terraria.skills.dto.AdminUserResetPasswordResponseDTO;

public interface UserManagementService {

    Page<AdminUserListItemDTO> getUsers(int page, int limit, String email, Integer status);

    AdminUserListItemDTO createUser(AdminUserCreateRequestDTO request);

    void updateStatus(Long userId, Integer status);

    AdminUserResetPasswordResponseDTO resetPassword(Long userId, String newPassword);
}

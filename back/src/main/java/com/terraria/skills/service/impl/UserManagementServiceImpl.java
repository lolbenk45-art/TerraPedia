package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.AdminUserCreateRequestDTO;
import com.terraria.skills.dto.AdminUserListItemDTO;
import com.terraria.skills.dto.AdminUserResetPasswordResponseDTO;
import com.terraria.skills.entity.User;
import com.terraria.skills.mapper.UserMapper;
import com.terraria.skills.service.SecurityAuditService;
import com.terraria.skills.service.UserAuthService;
import com.terraria.skills.service.UserManagementService;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Locale;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class UserManagementServiceImpl implements UserManagementService {

    private static final Integer STATUS_ACTIVE = 1;
    private static final Integer STATUS_DISABLED = 0;
    private static final Pattern PASSWORD_POLICY = Pattern.compile("^(?=.*[A-Za-z])(?=.*\\d).{10,64}$");

    private final UserMapper userMapper;
    private final UserAuthService userAuthService;
    private final SecurityAuditService securityAuditService;

    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder(12);

    @Override
    public Page<AdminUserListItemDTO> getUsers(int page, int limit, String email, Integer status) {
        int safePage = Math.max(1, page);
        int safeLimit = Math.max(1, Math.min(limit, 100));
        Page<AdminUserListItemDTO> mpPage = new Page<>(safePage, safeLimit);
        return userMapper.selectAdminUsersPage(mpPage, email == null ? null : email.trim(), status);
    }

    @Override
    public AdminUserListItemDTO createUser(AdminUserCreateRequestDTO request) {
        if (request == null) {
            throw new IllegalArgumentException("Request body is required");
        }

        String normalizedEmail = normalizeEmail(request.getEmail());
        String displayName = resolveDisplayName(request.getDisplayName(), normalizedEmail);
        String password = request.getPassword();
        Integer status = request.getStatus() == null ? STATUS_ACTIVE : request.getStatus();

        if (!STATUS_ACTIVE.equals(status) && !STATUS_DISABLED.equals(status)) {
            throw new IllegalArgumentException("status must be 0 or 1");
        }
        if (password == null || !PASSWORD_POLICY.matcher(password).matches()) {
            throw new IllegalArgumentException("Password must be 10-64 chars and include letters and numbers");
        }

        User existing = userMapper.selectByEmailIncludeDeleted(normalizedEmail);
        String passwordHash = passwordEncoder.encode(password);
        LocalDateTime now = LocalDateTime.now();

        if (existing != null && (existing.getDeleted() == null || existing.getDeleted() == 0)) {
            throw new IllegalArgumentException("Email already exists");
        }

        try {
            if (existing != null) {
                userMapper.reactivateDeletedUser(
                    existing.getId(),
                    passwordHash,
                    displayName,
                    status,
                    null
                );

                User reactivated = userMapper.selectById(existing.getId());
                if (reactivated == null) {
                    throw new IllegalStateException("Failed to reactivate deleted user");
                }
                securityAuditService.log(
                    "ADMIN_USER_REACTIVATED",
                    "ADMIN",
                    reactivated.getId(),
                    reactivated.getEmail(),
                    null,
                    "status=" + status
                );
                return toListItem(reactivated);
            }

            User user = new User();
            user.setEmail(normalizedEmail);
            user.setPasswordHash(passwordHash);
            user.setDisplayName(displayName);
            user.setStatus(status);
            user.setDeleted(0);
            user.setLastLoginAt(null);
            user.setCreatedAt(now);
            user.setUpdatedAt(now);
            userMapper.insert(user);

            securityAuditService.log(
                "ADMIN_USER_CREATED",
                "ADMIN",
                user.getId(),
                user.getEmail(),
                null,
                "status=" + status
            );
            return toListItem(user);
        } catch (DuplicateKeyException exception) {
            throw new IllegalArgumentException("Email already exists");
        }
    }

    @Override
    public void updateStatus(Long userId, Integer status) {
        if (userId == null || userId <= 0) {
            throw new IllegalArgumentException("Invalid user id");
        }
        if (!STATUS_ACTIVE.equals(status) && !STATUS_DISABLED.equals(status)) {
            throw new IllegalArgumentException("status must be 0 or 1");
        }

        User user = userMapper.selectById(userId);
        if (user == null || user.getDeleted() != null && user.getDeleted() == 1) {
            throw new IllegalArgumentException("User not found");
        }

        user.setStatus(status);
        userMapper.updateById(user);

        if (STATUS_DISABLED.equals(status)) {
            userAuthService.revokeAllRefreshTokens(userId);
        }

        securityAuditService.log(
            "ADMIN_USER_STATUS_UPDATE",
            "ADMIN",
            userId,
            user.getEmail(),
            null,
            "status=" + status
        );
    }

    @Override
    public AdminUserResetPasswordResponseDTO resetPassword(Long userId, String newPassword) {
        if (userId == null || userId <= 0) {
            throw new IllegalArgumentException("Invalid user id");
        }

        if (newPassword == null || !PASSWORD_POLICY.matcher(newPassword).matches()) {
            throw new IllegalArgumentException("Password must be 10-64 chars and include letters and numbers");
        }

        User user = userMapper.selectById(userId);
        if (user == null || user.getDeleted() != null && user.getDeleted() == 1) {
            throw new IllegalArgumentException("User not found");
        }

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userMapper.updateById(user);

        userAuthService.revokeAllRefreshTokens(userId);

        securityAuditService.log(
            "ADMIN_USER_RESET_PASSWORD",
            "ADMIN",
            userId,
            user.getEmail(),
            null,
            null
        );

        return AdminUserResetPasswordResponseDTO.builder()
            .userId(userId)
            .email(user.getEmail())
            .temporaryPassword(newPassword)
            .build();
    }

    private String normalizeEmail(String email) {
        if (email == null || email.isBlank()) {
            throw new IllegalArgumentException("Email is required");
        }
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private String resolveDisplayName(String displayName, String email) {
        String normalized = displayName == null ? "" : displayName.trim();
        if (normalized.isBlank()) {
            int atIndex = email.indexOf('@');
            normalized = atIndex > 0 ? email.substring(0, atIndex) : email;
        }
        if (normalized.length() < 2 || normalized.length() > 120) {
            throw new IllegalArgumentException("Display name length must be between 2 and 120");
        }
        return normalized;
    }

    private AdminUserListItemDTO toListItem(User user) {
        AdminUserListItemDTO dto = new AdminUserListItemDTO();
        dto.setId(user.getId());
        dto.setEmail(user.getEmail());
        dto.setDisplayName(user.getDisplayName());
        dto.setStatus(user.getStatus());
        dto.setLastLoginAt(user.getLastLoginAt());
        dto.setCreatedAt(user.getCreatedAt());
        return dto;
    }
}

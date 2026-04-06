package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.terraria.skills.auth.LoginRateLimitService;
import com.terraria.skills.auth.RegisterVerificationService;
import com.terraria.skills.auth.UserAuthProperties;
import com.terraria.skills.auth.UserJwtService;
import com.terraria.skills.auth.UserRefreshTokenStoreService;
import com.terraria.skills.auth.UserTokenClaims;
import com.terraria.skills.dto.UserProfileDTO;
import com.terraria.skills.dto.UserRegisterCodeResponseDTO;
import com.terraria.skills.dto.UserSessionDTO;
import com.terraria.skills.entity.User;
import com.terraria.skills.mapper.UserMapper;
import com.terraria.skills.service.SecurityAuditService;
import com.terraria.skills.service.UserAuthService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserAuthServiceImpl implements UserAuthService {

    private static final Integer STATUS_ACTIVE = 1;
    private static final Integer STATUS_DISABLED = 0;
    private static final Pattern PASSWORD_POLICY = Pattern.compile("^(?=.*[A-Za-z])(?=.*\\d).{10,64}$");

    private final UserMapper userMapper;
    private final UserJwtService userJwtService;
    private final UserRefreshTokenStoreService userRefreshTokenStoreService;
    private final UserAuthProperties userAuthProperties;
    private final LoginRateLimitService loginRateLimitService;
    private final RegisterVerificationService registerVerificationService;
    private final SecurityAuditService securityAuditService;

    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder(12);
    private final SecureRandom secureRandom = new SecureRandom();

    @Override
    public UserRegisterCodeResponseDTO sendRegisterVerificationCode(String email, String ipAddress) {
        String normalizedEmail = normalizeEmail(email);
        RegisterVerificationService.SendCodeResult result = registerVerificationService.sendCode(normalizedEmail, ipAddress);
        securityAuditService.log("REGISTER_CODE_SENT", "USER", null, normalizedEmail, ipAddress, null);
        return UserRegisterCodeResponseDTO.builder()
            .expiresInSeconds(result.expiresInSeconds())
            .cooldownSeconds(result.cooldownSeconds())
            .debugVerificationCode(result.debugVerificationCode())
            .build();
    }

    @Override
    public UserRegisterCodeResponseDTO sendPasswordResetVerificationCode(String email, String ipAddress) {
        String normalizedEmail = normalizeEmail(email);
        User user = userMapper.selectByEmail(normalizedEmail);
        if (user == null || user.getDeleted() != null && user.getDeleted() == 1) {
            securityAuditService.log("PASSWORD_RESET_CODE_FAILED", "USER", null, normalizedEmail, ipAddress, "email not registered");
            throw new IllegalArgumentException("Email is not registered");
        }
        if (!STATUS_ACTIVE.equals(user.getStatus())) {
            securityAuditService.log("PASSWORD_RESET_CODE_FAILED", "USER", user.getId(), normalizedEmail, ipAddress, "disabled account");
            throw new IllegalArgumentException("Account is disabled");
        }

        RegisterVerificationService.SendCodeResult result = registerVerificationService.sendPasswordResetCode(normalizedEmail, ipAddress);
        securityAuditService.log("PASSWORD_RESET_CODE_SENT", "USER", user.getId(), normalizedEmail, ipAddress, null);
        return UserRegisterCodeResponseDTO.builder()
            .expiresInSeconds(result.expiresInSeconds())
            .cooldownSeconds(result.cooldownSeconds())
            .debugVerificationCode(result.debugVerificationCode())
            .build();
    }

    @Override
    public UserSessionDTO register(String email, String password, String displayName, String verificationCode, String ipAddress) {
        String normalizedEmail = normalizeEmail(email);
        User activeUser = userMapper.selectByEmail(normalizedEmail);
        if (activeUser != null) {
            securityAuditService.log("REGISTER_DUPLICATED", "USER", activeUser.getId(), normalizedEmail, ipAddress, "duplicated email");
            throw new IllegalArgumentException("Email is already registered");
        }

        registerVerificationService.verifyCode(normalizedEmail, verificationCode, ipAddress);

        String passwordHash = passwordEncoder.encode(password);
        String normalizedDisplayName = resolveDisplayName(displayName, normalizedEmail);
        LocalDateTime now = LocalDateTime.now();

        User deletedUser = userMapper.selectByEmailIncludeDeleted(normalizedEmail);
        User user;
        if (deletedUser != null && deletedUser.getDeleted() != null && deletedUser.getDeleted() == 1) {
            userMapper.reactivateDeletedUser(
                deletedUser.getId(),
                passwordHash,
                normalizedDisplayName,
                STATUS_ACTIVE,
                now
            );
            user = userMapper.selectById(deletedUser.getId());
            if (user == null) {
                throw new IllegalStateException("Failed to reactivate deleted user");
            }
            securityAuditService.log("REGISTER_REACTIVATED", "USER", user.getId(), normalizedEmail, ipAddress, null);
        } else {
            user = new User();
            user.setEmail(normalizedEmail);
            user.setPasswordHash(passwordHash);
            user.setDisplayName(normalizedDisplayName);
            user.setStatus(STATUS_ACTIVE);
            user.setLastLoginAt(now);
            userMapper.insert(user);
        }

        UserSessionDTO session = createSession(user);
        securityAuditService.log("REGISTER_SUCCESS", "USER", user.getId(), normalizedEmail, ipAddress, null);
        return session;
    }

    @Override
    public UserSessionDTO login(String email, String password, String ipAddress) {
        String normalizedEmail = normalizeEmail(email);

        if (loginRateLimitService.isLocked(normalizedEmail, ipAddress)) {
            securityAuditService.log("LOGIN_LOCKED", "USER", null, normalizedEmail, ipAddress, "rate limited");
            throw new IllegalArgumentException("Too many failed attempts. Try again later");
        }

        User user = userMapper.selectByEmail(normalizedEmail);
        if (user == null || !passwordEncoder.matches(password, user.getPasswordHash())) {
            loginRateLimitService.recordFailure(normalizedEmail, ipAddress);
            securityAuditService.log("LOGIN_FAILED", "USER", user == null ? null : user.getId(), normalizedEmail, ipAddress, "invalid credentials");
            throw new IllegalArgumentException("Invalid email or password");
        }

        if (!STATUS_ACTIVE.equals(user.getStatus())) {
            securityAuditService.log("LOGIN_DISABLED", "USER", user.getId(), normalizedEmail, ipAddress, "disabled account");
            throw new IllegalArgumentException("Account is disabled");
        }

        loginRateLimitService.recordSuccess(normalizedEmail, ipAddress);

        user.setLastLoginAt(LocalDateTime.now());
        userMapper.updateById(user);

        UserSessionDTO session = createSession(user);
        securityAuditService.log("LOGIN_SUCCESS", "USER", user.getId(), normalizedEmail, ipAddress, null);
        return session;
    }

    @Override
    public void logout(Long userId, String refreshToken, String ipAddress) {
        if (userId == null || userId <= 0) {
            return;
        }

        userRefreshTokenStoreService.revokeToken(userId, refreshToken);

        securityAuditService.log("LOGOUT", "USER", userId, null, ipAddress, null);
    }

    @Override
    public UserSessionDTO buildSessionFromClaims(UserTokenClaims claims) {
        if (claims == null || claims.getUserId() == null) {
            throw new IllegalArgumentException("Invalid login session");
        }

        User user = userMapper.selectById(claims.getUserId());
        if (user == null || !STATUS_ACTIVE.equals(user.getStatus())) {
            throw new IllegalArgumentException("Invalid login session");
        }

        return UserSessionDTO.builder()
            .user(toProfile(user))
            .accessToken(null)
            .refreshToken(null)
            .expiresAt(userJwtService.getExpiresAtMillis(claims))
            .build();
    }

    @Override
    public void revokeAllRefreshTokens(Long userId) {
        if (userId == null || userId <= 0) {
            return;
        }

        userRefreshTokenStoreService.revokeAllTokens(userId);
    }

    @Override
    public UserProfileDTO updateProfile(Long userId, String displayName, String ipAddress) {
        User user = requireActiveUser(userId);
        String normalizedDisplayName = normalizeDisplayName(displayName);
        user.setDisplayName(normalizedDisplayName);
        userMapper.updateById(user);

        securityAuditService.log("USER_PROFILE_UPDATED", "USER", userId, user.getEmail(), ipAddress, null);
        return toProfile(user);
    }

    @Override
    public void changePassword(Long userId, String currentPassword, String newPassword, String ipAddress) {
        User user = requireActiveUser(userId);
        if (currentPassword == null || currentPassword.isBlank()) {
            throw new IllegalArgumentException("Current password is required");
        }
        if (newPassword == null || !PASSWORD_POLICY.matcher(newPassword).matches()) {
            throw new IllegalArgumentException("Password must be 10-64 chars and include letters and numbers");
        }
        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            securityAuditService.log("USER_CHANGE_PASSWORD_FAILED", "USER", userId, user.getEmail(), ipAddress, "invalid current password");
            throw new IllegalArgumentException("Current password is incorrect");
        }

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userMapper.updateById(user);
        revokeAllRefreshTokens(userId);
        securityAuditService.log("USER_PASSWORD_CHANGED", "USER", userId, user.getEmail(), ipAddress, null);
    }

    @Override
    public void resetPasswordByVerificationCode(String email, String verificationCode, String newPassword, String ipAddress) {
        String normalizedEmail = normalizeEmail(email);
        if (newPassword == null || !PASSWORD_POLICY.matcher(newPassword).matches()) {
            throw new IllegalArgumentException("Password must be 10-64 chars and include letters and numbers");
        }

        User user = userMapper.selectByEmail(normalizedEmail);
        if (user == null || user.getDeleted() != null && user.getDeleted() == 1) {
            securityAuditService.log("USER_PASSWORD_RESET_FAILED", "USER", null, normalizedEmail, ipAddress, "email not registered");
            throw new IllegalArgumentException("Email is not registered");
        }
        if (!STATUS_ACTIVE.equals(user.getStatus())) {
            securityAuditService.log("USER_PASSWORD_RESET_FAILED", "USER", user.getId(), normalizedEmail, ipAddress, "disabled account");
            throw new IllegalArgumentException("Account is disabled");
        }

        try {
            registerVerificationService.verifyPasswordResetCode(normalizedEmail, verificationCode, ipAddress);
        } catch (IllegalArgumentException exception) {
            securityAuditService.log("USER_PASSWORD_RESET_FAILED", "USER", user.getId(), normalizedEmail, ipAddress, "invalid verification code");
            throw exception;
        }

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userMapper.updateById(user);
        revokeAllRefreshTokens(user.getId());
        securityAuditService.log("USER_PASSWORD_RESET_SUCCESS", "USER", user.getId(), normalizedEmail, ipAddress, null);
    }

    @Override
    public void deleteOwnAccount(Long userId, String currentPassword, String ipAddress) {
        User user = requireActiveUser(userId);
        if (currentPassword == null || currentPassword.isBlank()) {
            throw new IllegalArgumentException("Current password is required");
        }
        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            securityAuditService.log("USER_DELETE_ACCOUNT_FAILED", "USER", userId, user.getEmail(), ipAddress, "invalid current password");
            throw new IllegalArgumentException("Current password is incorrect");
        }

        userMapper.update(
            null,
            new LambdaUpdateWrapper<User>()
                .eq(User::getId, userId)
                .eq(User::getDeleted, 0)
                .set(User::getStatus, STATUS_DISABLED)
                .set(User::getDeleted, 1)
                .set(User::getUpdatedAt, LocalDateTime.now())
        );
        revokeAllRefreshTokens(userId);
        securityAuditService.log("USER_ACCOUNT_DELETED", "USER", userId, user.getEmail(), ipAddress, null);
    }

    private UserSessionDTO createSession(User user) {
        UserTokenClaims claims = userJwtService.issueToken(user);
        String accessToken = userJwtService.createToken(claims);
        String refreshToken = generateToken();

        userRefreshTokenStoreService.saveToken(
            user.getId(),
            refreshToken,
            userAuthProperties.getRefreshTokenTtlSeconds()
        );

        return UserSessionDTO.builder()
            .user(toProfile(user))
            .accessToken(accessToken)
            .refreshToken(refreshToken)
            .expiresAt(userJwtService.getExpiresAtMillis(claims))
            .build();
    }

    private UserProfileDTO toProfile(User user) {
        return UserProfileDTO.builder()
            .id(user.getId())
            .email(user.getEmail())
            .displayName(user.getDisplayName())
            .status(user.getStatus())
            .build();
    }

    private String normalizeEmail(String email) {
        if (email == null) {
            throw new IllegalArgumentException("Email is required");
        }
        return email.trim().toLowerCase();
    }

    private String normalizeDisplayName(String displayName) {
        if (displayName == null || displayName.isBlank()) {
            throw new IllegalArgumentException("Display name is required");
        }

        String normalized = displayName.trim();
        if (normalized.length() < 2 || normalized.length() > 120) {
            throw new IllegalArgumentException("Display name length must be between 2 and 120");
        }
        return normalized;
    }

    private User requireActiveUser(Long userId) {
        if (userId == null || userId <= 0) {
            throw new IllegalArgumentException("Invalid user id");
        }

        User user = userMapper.selectById(userId);
        if (user == null || user.getDeleted() != null && user.getDeleted() == 1) {
            throw new IllegalArgumentException("User not found");
        }
        if (!STATUS_ACTIVE.equals(user.getStatus())) {
            throw new IllegalArgumentException("Account is disabled");
        }
        return user;
    }

    private String resolveDisplayName(String displayName, String email) {
        if (displayName != null && !displayName.isBlank()) {
            return displayName.trim();
        }

        int atIndex = email.indexOf('@');
        if (atIndex > 0) {
            return email.substring(0, atIndex);
        }
        return email;
    }

    private String generateToken() {
        byte[] bytes = new byte[48];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}

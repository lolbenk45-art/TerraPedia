package com.terraria.skills.service;

import com.terraria.skills.auth.UserTokenClaims;
import com.terraria.skills.dto.UserProfileDTO;
import com.terraria.skills.dto.UserRegisterCodeResponseDTO;
import com.terraria.skills.dto.UserSessionDTO;

public interface UserAuthService {

    UserRegisterCodeResponseDTO sendRegisterVerificationCode(String email, String ipAddress);

    UserRegisterCodeResponseDTO sendPasswordResetVerificationCode(String email, String ipAddress);

    UserSessionDTO register(String email, String password, String displayName, String verificationCode, String ipAddress);

    UserSessionDTO login(String email, String password, String ipAddress);

    void logout(Long userId, String refreshToken, String ipAddress);

    UserSessionDTO buildSessionFromClaims(UserTokenClaims claims);

    UserProfileDTO updateProfile(Long userId, String displayName, String ipAddress);

    void changePassword(Long userId, String currentPassword, String newPassword, String ipAddress);

    void resetPasswordByVerificationCode(String email, String verificationCode, String newPassword, String ipAddress);

    void deleteOwnAccount(Long userId, String currentPassword, String ipAddress);

    void revokeAllRefreshTokens(Long userId);
}

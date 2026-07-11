package com.terraria.skills.controller;

import com.terraria.skills.auth.UserAuthProperties;
import com.terraria.skills.auth.UserAuthenticationInterceptor;
import com.terraria.skills.auth.UserTokenClaims;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.UserAuthResponseDTO;
import com.terraria.skills.dto.UserChangePasswordRequestDTO;
import com.terraria.skills.dto.UserDeleteAccountRequestDTO;
import com.terraria.skills.dto.UserLoginRequestDTO;
import com.terraria.skills.dto.UserPasswordResetCodeRequestDTO;
import com.terraria.skills.dto.UserPasswordResetRequestDTO;
import com.terraria.skills.dto.UserProfileDTO;
import com.terraria.skills.dto.UserRegisterCodeRequestDTO;
import com.terraria.skills.dto.UserRegisterCodeResponseDTO;
import com.terraria.skills.dto.UserRegisterRequestDTO;
import com.terraria.skills.dto.UserSessionDTO;
import com.terraria.skills.dto.UserUpdateProfileRequestDTO;
import com.terraria.skills.security.ClientIpResolver;
import com.terraria.skills.service.UserAuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.MediaType;
import org.springframework.web.multipart.MultipartFile;

import java.time.Duration;

@RestController
@RequestMapping("/user-auth")
@RequiredArgsConstructor
@Tag(name = "UserAuth", description = "Front-end user login and registration")
public class UserAuthController {

    private final UserAuthService userAuthService;
    private final UserAuthProperties userAuthProperties;
    private final ClientIpResolver clientIpResolver;

    @PostMapping("/register/code")
    @Operation(summary = "Send registration verification code")
    public ResponseEntity<ApiResponse<UserRegisterCodeResponseDTO>> sendRegisterCode(
        @Valid @RequestBody UserRegisterCodeRequestDTO request,
        HttpServletRequest httpRequest
    ) {
        UserRegisterCodeResponseDTO response = userAuthService.sendRegisterVerificationCode(
            request.getEmail(),
            clientIpResolver.resolve(httpRequest)
        );
        return ResponseEntity.ok(ApiResponse.success(response, "Verification code sent"));
    }

    @PostMapping("/password/reset/code")
    @Operation(summary = "Send password reset verification code")
    public ResponseEntity<ApiResponse<UserRegisterCodeResponseDTO>> sendPasswordResetCode(
        @Valid @RequestBody UserPasswordResetCodeRequestDTO request,
        HttpServletRequest httpRequest
    ) {
        UserRegisterCodeResponseDTO response = userAuthService.sendPasswordResetVerificationCode(
            request.getEmail(),
            clientIpResolver.resolve(httpRequest)
        );
        return ResponseEntity.ok(ApiResponse.success(response, "Verification code sent"));
    }

    @PostMapping("/register")
    @Operation(summary = "User registration")
    public ResponseEntity<ApiResponse<UserAuthResponseDTO>> register(
        @Valid @RequestBody UserRegisterRequestDTO request,
        HttpServletRequest httpRequest,
        HttpServletResponse httpResponse
    ) {
        UserSessionDTO session = userAuthService.register(
            request.getEmail(),
            request.getPassword(),
            request.getDisplayName(),
            request.getVerificationCode(),
            clientIpResolver.resolve(httpRequest)
        );

        writeAuthCookies(httpResponse, session);

        UserAuthResponseDTO response = UserAuthResponseDTO.builder()
            .user(session.getUser())
            .tokenType("Bearer")
            .expiresAt(session.getExpiresAt())
            .build();

        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response, "Register success"));
    }

    @PostMapping("/login")
    @Operation(summary = "User login")
    public ResponseEntity<ApiResponse<UserAuthResponseDTO>> login(
        @Valid @RequestBody UserLoginRequestDTO request,
        HttpServletRequest httpRequest,
        HttpServletResponse httpResponse
    ) {
        UserSessionDTO session = userAuthService.login(
            request.getEmail(),
            request.getPassword(),
            clientIpResolver.resolve(httpRequest)
        );

        writeAuthCookies(httpResponse, session);

        UserAuthResponseDTO response = UserAuthResponseDTO.builder()
            .user(session.getUser())
            .tokenType("Bearer")
            .expiresAt(session.getExpiresAt())
            .build();

        return ResponseEntity.ok(ApiResponse.success(response, "Login success"));
    }

    @PostMapping("/refresh")
    @Operation(summary = "Refresh current user session")
    public ResponseEntity<ApiResponse<UserAuthResponseDTO>> refresh(
        HttpServletRequest httpRequest,
        HttpServletResponse httpResponse
    ) {
        String refreshToken = readCookie(httpRequest, userAuthProperties.getRefreshCookieName());
        if (refreshToken == null || refreshToken.isBlank()) {
            clearAuthCookies(httpResponse);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ApiResponse.error(HttpStatus.UNAUTHORIZED.value(), "Refresh session is missing"));
        }

        try {
            UserSessionDTO session = userAuthService.refreshSession(refreshToken, clientIpResolver.resolve(httpRequest));
            writeAuthCookies(httpResponse, session);
            UserAuthResponseDTO response = UserAuthResponseDTO.builder()
                .user(session.getUser())
                .tokenType("Bearer")
                .expiresAt(session.getExpiresAt())
                .build();
            return ResponseEntity.ok(ApiResponse.success(response, "Session refreshed"));
        } catch (IllegalArgumentException exception) {
            clearAuthCookies(httpResponse);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ApiResponse.error(HttpStatus.UNAUTHORIZED.value(), "Refresh session is invalid"));
        }
    }

    @GetMapping("/me")
    @Operation(summary = "Get current user")
    public ResponseEntity<ApiResponse<UserProfileDTO>> me(HttpServletRequest request) {
        UserTokenClaims claims = getRequiredClaims(request);
        UserSessionDTO session = userAuthService.buildSessionFromClaims(claims);
        return ResponseEntity.ok(ApiResponse.success(session.getUser()));
    }

    @PatchMapping("/profile")
    @Operation(summary = "Update current user profile")
    public ResponseEntity<ApiResponse<UserProfileDTO>> updateProfile(
        @Valid @RequestBody UserUpdateProfileRequestDTO request,
        HttpServletRequest httpRequest
    ) {
        UserTokenClaims claims = getRequiredClaims(httpRequest);
        UserProfileDTO profile = userAuthService.updateProfile(
            claims.getUserId(),
            request.getDisplayName(),
            clientIpResolver.resolve(httpRequest)
        );
        return ResponseEntity.ok(ApiResponse.success(profile, "Profile updated"));
    }

    @PostMapping(value = "/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Upload current user avatar")
    public ResponseEntity<ApiResponse<UserProfileDTO>> uploadAvatar(
        @RequestPart("file") MultipartFile file,
        HttpServletRequest httpRequest
    ) {
        UserTokenClaims claims = getRequiredClaims(httpRequest);
        UserProfileDTO profile = userAuthService.uploadAvatar(
            claims.getUserId(),
            file,
            clientIpResolver.resolve(httpRequest)
        );
        return ResponseEntity.ok(ApiResponse.success(profile, "Avatar updated"));
    }

    @DeleteMapping("/avatar")
    @Operation(summary = "Remove current user avatar")
    public ResponseEntity<ApiResponse<UserProfileDTO>> deleteAvatar(HttpServletRequest httpRequest) {
        UserTokenClaims claims = getRequiredClaims(httpRequest);
        UserProfileDTO profile = userAuthService.deleteAvatar(
            claims.getUserId(),
            clientIpResolver.resolve(httpRequest)
        );
        return ResponseEntity.ok(ApiResponse.success(profile, "Avatar removed"));
    }

    @PatchMapping("/password")
    @Operation(summary = "Change current user password")
    public ResponseEntity<ApiResponse<Void>> changePassword(
        @Valid @RequestBody UserChangePasswordRequestDTO request,
        HttpServletRequest httpRequest,
        HttpServletResponse httpResponse
    ) {
        UserTokenClaims claims = getRequiredClaims(httpRequest);
        userAuthService.changePassword(
            claims.getUserId(),
            request.getCurrentPassword(),
            request.getNewPassword(),
            clientIpResolver.resolve(httpRequest)
        );
        clearAuthCookies(httpResponse);
        return ResponseEntity.ok(ApiResponse.success(null, "Password changed successfully"));
    }

    @PostMapping("/password/reset")
    @Operation(summary = "Reset password by email verification code")
    public ResponseEntity<ApiResponse<Void>> resetPassword(
        @Valid @RequestBody UserPasswordResetRequestDTO request,
        HttpServletRequest httpRequest
    ) {
        userAuthService.resetPasswordByVerificationCode(
            request.getEmail(),
            request.getVerificationCode(),
            request.getNewPassword(),
            clientIpResolver.resolve(httpRequest)
        );
        return ResponseEntity.ok(ApiResponse.success(null, "Password reset successfully"));
    }

    @DeleteMapping("/account")
    @Operation(summary = "Delete current user account")
    public ResponseEntity<ApiResponse<Void>> deleteAccount(
        @Valid @RequestBody UserDeleteAccountRequestDTO request,
        HttpServletRequest httpRequest,
        HttpServletResponse httpResponse
    ) {
        UserTokenClaims claims = getRequiredClaims(httpRequest);
        userAuthService.deleteOwnAccount(
            claims.getUserId(),
            request.getCurrentPassword(),
            clientIpResolver.resolve(httpRequest)
        );
        clearAuthCookies(httpResponse);
        return ResponseEntity.ok(ApiResponse.success(null, "Account deleted"));
    }

    @PostMapping("/logout")
    @Operation(summary = "Logout")
    public ResponseEntity<ApiResponse<Void>> logout(HttpServletRequest request, HttpServletResponse response) {
        UserTokenClaims claims = getRequiredClaims(request);
        String refreshToken = readCookie(request, userAuthProperties.getRefreshCookieName());

        userAuthService.logout(claims.getUserId(), refreshToken, clientIpResolver.resolve(request));
        clearAuthCookies(response);
        return ResponseEntity.ok(ApiResponse.success(null, "Logout success"));
    }

    private void writeAuthCookies(HttpServletResponse response, UserSessionDTO session) {
        long accessMaxAge = Math.max(userAuthProperties.getAccessTokenTtlSeconds(), 60L);
        long refreshMaxAge = Math.max(userAuthProperties.getRefreshTokenTtlSeconds(), 60L);

        ResponseCookie accessCookie = ResponseCookie.from(userAuthProperties.getAccessCookieName(), session.getAccessToken())
            .httpOnly(true)
            .secure(userAuthProperties.isCookieSecure())
            .sameSite(userAuthProperties.getCookieSameSite())
            .path("/")
            .maxAge(Duration.ofSeconds(accessMaxAge))
            .build();

        ResponseCookie refreshCookie = ResponseCookie.from(userAuthProperties.getRefreshCookieName(), session.getRefreshToken())
            .httpOnly(true)
            .secure(userAuthProperties.isCookieSecure())
            .sameSite(userAuthProperties.getCookieSameSite())
            .path("/")
            .maxAge(Duration.ofSeconds(refreshMaxAge))
            .build();

        response.addHeader("Set-Cookie", accessCookie.toString());
        response.addHeader("Set-Cookie", refreshCookie.toString());
    }

    private void clearAuthCookies(HttpServletResponse response) {
        ResponseCookie accessCookie = ResponseCookie.from(userAuthProperties.getAccessCookieName(), "")
            .httpOnly(true)
            .secure(userAuthProperties.isCookieSecure())
            .sameSite(userAuthProperties.getCookieSameSite())
            .path("/")
            .maxAge(Duration.ZERO)
            .build();

        ResponseCookie refreshCookie = ResponseCookie.from(userAuthProperties.getRefreshCookieName(), "")
            .httpOnly(true)
            .secure(userAuthProperties.isCookieSecure())
            .sameSite(userAuthProperties.getCookieSameSite())
            .path("/")
            .maxAge(Duration.ZERO)
            .build();

        response.addHeader("Set-Cookie", accessCookie.toString());
        response.addHeader("Set-Cookie", refreshCookie.toString());
    }

    private String readCookie(HttpServletRequest request, String cookieName) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }

        for (Cookie cookie : cookies) {
            if (cookieName.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }

        return null;
    }

    private UserTokenClaims getRequiredClaims(HttpServletRequest request) {
        return (UserTokenClaims) request.getAttribute(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE);
    }
}

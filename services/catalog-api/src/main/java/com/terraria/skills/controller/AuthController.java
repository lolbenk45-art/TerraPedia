package com.terraria.skills.controller;

import com.terraria.skills.auth.AdminAuthProperties;
import com.terraria.skills.auth.AdminAuthenticationInterceptor;
import com.terraria.skills.auth.AdminJwtService;
import com.terraria.skills.auth.AdminLoginRateLimitService;
import com.terraria.skills.auth.AdminTokenClaims;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.AdminProfileDTO;
import com.terraria.skills.dto.AuthLoginRequestDTO;
import com.terraria.skills.dto.AuthLoginResponseDTO;
import com.terraria.skills.security.ClientIpResolver;
import com.terraria.skills.service.SecurityAuditService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
@Tag(name = "Auth", description = "管理端登录与当前用户信息")
public class AuthController {

    private final AdminAuthProperties adminAuthProperties;
    private final AdminJwtService adminJwtService;
    private final AdminLoginRateLimitService adminLoginRateLimitService;
    private final SecurityAuditService securityAuditService;
    private final ClientIpResolver clientIpResolver;

    @PostMapping("/login")
    @Operation(summary = "管理员登录", description = "使用配置中的管理员用户名和密码换取 JWT")
    public ResponseEntity<ApiResponse<AuthLoginResponseDTO>> login(
        @Valid @RequestBody AuthLoginRequestDTO request,
        HttpServletRequest httpRequest
    ) {
        String username = request.getUsername().trim();
        String ipAddress = clientIpResolver.resolve(httpRequest);
        if (adminLoginRateLimitService.isLocked(username, ipAddress)) {
            securityAuditService.log("ADMIN_LOGIN_LOCKED", "ADMIN", null, null, ipAddress, "username=" + username);
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body(ApiResponse.error(HttpStatus.TOO_MANY_REQUESTS.value(), "管理员登录失败次数过多，请稍后再试"));
        }
        if (!constantTimeEquals(adminAuthProperties.getUsername(), username)
            || !constantTimeEquals(adminAuthProperties.getPassword(), request.getPassword())) {
            adminLoginRateLimitService.recordFailure(username, ipAddress);
            securityAuditService.log("ADMIN_LOGIN_FAILED", "ADMIN", null, null, ipAddress, "username=" + username);
            log.warn("管理员登录失败 username={}", username);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ApiResponse.error(HttpStatus.UNAUTHORIZED.value(), "用户名或密码错误"));
        }

        adminLoginRateLimitService.recordSuccess(username, ipAddress);
        AdminTokenClaims claims = adminJwtService.issueToken();
        AuthLoginResponseDTO response = AuthLoginResponseDTO.builder()
            .token(adminJwtService.createToken(claims))
            .tokenType("Bearer")
            .expiresAt(adminJwtService.getExpiresAtMillis(claims))
            .user(toProfile(claims))
            .build();

        securityAuditService.log("ADMIN_LOGIN_SUCCESS", "ADMIN", null, null, ipAddress, "username=" + username);
        log.info("管理员登录成功 username={}", username);
        return ResponseEntity.ok(ApiResponse.success(response, "登录成功"));
    }

    @GetMapping("/me")
    @Operation(summary = "获取当前管理员信息")
    @SecurityRequirement(name = "bearerAuth")
    public ResponseEntity<ApiResponse<AdminProfileDTO>> me(HttpServletRequest request) {
        AdminTokenClaims claims = (AdminTokenClaims) request.getAttribute(AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE);
        return ResponseEntity.ok(ApiResponse.success(toProfile(claims)));
    }

    private AdminProfileDTO toProfile(AdminTokenClaims claims) {
        return AdminProfileDTO.builder()
            .username(claims.getUsername())
            .displayName(claims.getDisplayName())
            .role(claims.getRole())
            .build();
    }

    /** 凭据比对必须恒时；朴素 equals 的短路时序可被用来逐字符探测密码。 */
    private static boolean constantTimeEquals(String expected, String provided) {
        byte[] expectedBytes = expected == null
            ? new byte[0]
            : expected.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        byte[] providedBytes = provided == null
            ? new byte[0]
            : provided.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        return java.security.MessageDigest.isEqual(expectedBytes, providedBytes);
    }
}

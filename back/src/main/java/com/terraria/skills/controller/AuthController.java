package com.terraria.skills.controller;

import com.terraria.skills.auth.AdminAuthProperties;
import com.terraria.skills.auth.AdminAuthenticationInterceptor;
import com.terraria.skills.auth.AdminJwtService;
import com.terraria.skills.auth.AdminTokenClaims;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.AdminProfileDTO;
import com.terraria.skills.dto.AuthLoginRequestDTO;
import com.terraria.skills.dto.AuthLoginResponseDTO;
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

    @PostMapping("/login")
    @Operation(summary = "管理员登录", description = "使用配置中的管理员用户名和密码换取 JWT")
    public ResponseEntity<ApiResponse<AuthLoginResponseDTO>> login(@Valid @RequestBody AuthLoginRequestDTO request) {
        String username = request.getUsername().trim();
        if (!adminAuthProperties.getUsername().equals(username)
            || !adminAuthProperties.getPassword().equals(request.getPassword())) {
            log.warn("管理员登录失败 username={}", username);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ApiResponse.error(HttpStatus.UNAUTHORIZED.value(), "用户名或密码错误"));
        }

        AdminTokenClaims claims = adminJwtService.issueToken();
        AuthLoginResponseDTO response = AuthLoginResponseDTO.builder()
            .token(adminJwtService.createToken(claims))
            .tokenType("Bearer")
            .expiresAt(adminJwtService.getExpiresAtMillis(claims))
            .user(toProfile(claims))
            .build();

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
}

package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.auth.UnauthenticatedException;
import com.terraria.skills.auth.UserAuthenticationInterceptor;
import com.terraria.skills.auth.UserTokenClaims;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.dto.UserSavedRouteDTO;
import com.terraria.skills.dto.UserSavedRouteRequestDTO;
import com.terraria.skills.service.UserSavedRouteService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/user/saved-routes")
@RequiredArgsConstructor
@Tag(name = "UserSavedRoute", description = "Authenticated user saved route APIs")
public class UserSavedRouteController {

    private final UserSavedRouteService userSavedRouteService;

    @PostMapping
    @Operation(summary = "Save current user's crafting route")
    public ResponseEntity<ApiResponse<UserSavedRouteDTO>> saveRoute(
        @Valid @RequestBody UserSavedRouteRequestDTO request,
        HttpServletRequest httpRequest
    ) {
        UserTokenClaims claims = getRequiredClaims(httpRequest);
        UserSavedRouteDTO route = userSavedRouteService.saveRoute(claims.getUserId(), request, getClientIp(httpRequest));
        return ResponseEntity.ok(ApiResponse.success(route, "Saved route updated"));
    }

    @GetMapping
    @Operation(summary = "Get current user's saved routes")
    public ResponseEntity<ApiResponse<List<UserSavedRouteDTO>>> getRoutes(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        HttpServletRequest httpRequest
    ) {
        UserTokenClaims claims = getRequiredClaims(httpRequest);
        int resolvedPage = PaginationParams.resolvePage(page);
        int resolvedLimit = PaginationParams.resolveLimit(limit, size, 20, 100);
        Page<UserSavedRouteDTO> routePage = userSavedRouteService.getRoutes(claims.getUserId(), resolvedPage, resolvedLimit);
        ApiResponse<List<UserSavedRouteDTO>> response = ApiResponse.success(routePage.getRecords());
        response.setPagination(new Pagination(routePage.getTotal(), (int) routePage.getCurrent(), (int) routePage.getSize()));
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Remove current user's saved route")
    public ResponseEntity<ApiResponse<UserSavedRouteDTO>> removeRoute(@PathVariable Long id, HttpServletRequest httpRequest) {
        UserTokenClaims claims = getRequiredClaims(httpRequest);
        UserSavedRouteDTO route = userSavedRouteService.removeRoute(claims.getUserId(), id, getClientIp(httpRequest));
        return ResponseEntity.ok(ApiResponse.success(route, "Saved route removed"));
    }

    private UserTokenClaims getRequiredClaims(HttpServletRequest request) {
        Object claims = request.getAttribute(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE);
        if (!(claims instanceof UserTokenClaims userTokenClaims) || userTokenClaims.getUserId() == null) {
            throw new UnauthenticatedException("未登录或登录状态已失效");
        }
        return userTokenClaims;
    }

    private String getClientIp(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}

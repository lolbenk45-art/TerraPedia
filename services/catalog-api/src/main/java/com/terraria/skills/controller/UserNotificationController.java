package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.auth.UnauthenticatedException;
import com.terraria.skills.auth.UserAuthenticationInterceptor;
import com.terraria.skills.auth.UserTokenClaims;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.dto.UserNotificationDTO;
import com.terraria.skills.security.ClientIpResolver;
import com.terraria.skills.service.UserNotificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/user/notifications")
@RequiredArgsConstructor
@Tag(name = "UserNotification", description = "Authenticated user notification APIs")
public class UserNotificationController {

    private final UserNotificationService userNotificationService;
    private final ClientIpResolver clientIpResolver;

    @GetMapping
    @Operation(summary = "Get current user's notifications")
    public ResponseEntity<ApiResponse<List<UserNotificationDTO>>> getNotifications(
        @RequestParam(defaultValue = "false") boolean unreadOnly,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        HttpServletRequest request
    ) {
        UserTokenClaims claims = getRequiredClaims(request);
        int resolvedPage = PaginationParams.resolvePage(page);
        int resolvedLimit = PaginationParams.resolveLimit(limit, size, 20, 100);
        Page<UserNotificationDTO> notificationPage = userNotificationService.getNotifications(claims.getUserId(), unreadOnly, resolvedPage, resolvedLimit);
        ApiResponse<List<UserNotificationDTO>> response = ApiResponse.success(notificationPage.getRecords());
        response.setPagination(new Pagination(notificationPage.getTotal(), (int) notificationPage.getCurrent(), (int) notificationPage.getSize()));
        return ResponseEntity.ok(response);
    }

    @GetMapping("/unread-count")
    @Operation(summary = "Get current user's unread notification count")
    public ResponseEntity<ApiResponse<Map<String, Long>>> getUnreadCount(HttpServletRequest request) {
        UserTokenClaims claims = getRequiredClaims(request);
        return ResponseEntity.ok(ApiResponse.success(Map.of("unreadCount", userNotificationService.countUnread(claims.getUserId()))));
    }

    @PatchMapping("/{id}/read")
    @Operation(summary = "Mark current user's notification read")
    public ResponseEntity<ApiResponse<UserNotificationDTO>> markRead(@PathVariable Long id, HttpServletRequest request) {
        UserTokenClaims claims = getRequiredClaims(request);
        UserNotificationDTO notification = userNotificationService.markRead(claims.getUserId(), id, clientIpResolver.resolve(request));
        return ResponseEntity.ok(ApiResponse.success(notification, "Notification marked read"));
    }

    @PatchMapping("/read-all")
    @Operation(summary = "Mark all current user's notifications read")
    public ResponseEntity<ApiResponse<Map<String, Integer>>> markAllRead(HttpServletRequest request) {
        UserTokenClaims claims = getRequiredClaims(request);
        int updated = userNotificationService.markAllRead(claims.getUserId(), clientIpResolver.resolve(request));
        return ResponseEntity.ok(ApiResponse.success(Map.of("updated", updated), "Notifications marked read"));
    }

    private UserTokenClaims getRequiredClaims(HttpServletRequest request) {
        Object claims = request.getAttribute(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE);
        if (!(claims instanceof UserTokenClaims userTokenClaims) || userTokenClaims.getUserId() == null) {
            throw new UnauthenticatedException("未登录或登录状态已失效");
        }
        return userTokenClaims;
    }

}

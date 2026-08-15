package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.auth.UnauthenticatedException;
import com.terraria.skills.auth.UserAuthenticationInterceptor;
import com.terraria.skills.auth.UserTokenClaims;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.dto.UserReadingHistoryDTO;
import com.terraria.skills.security.ClientIpResolver;
import com.terraria.skills.service.UserReadingHistoryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/user/history")
@RequiredArgsConstructor
@Tag(name = "UserReadingHistory", description = "Authenticated user reading history APIs")
public class UserReadingHistoryController {

    private final UserReadingHistoryService userReadingHistoryService;
    private final ClientIpResolver clientIpResolver;

    @PostMapping("/{targetType}/{targetId}")
    @Operation(summary = "Record current user's reading history")
    public ResponseEntity<ApiResponse<UserReadingHistoryDTO>> recordHistory(
        @PathVariable String targetType,
        @PathVariable Long targetId,
        HttpServletRequest request
    ) {
        UserTokenClaims claims = getRequiredClaims(request);
        UserReadingHistoryDTO history = userReadingHistoryService.record(claims.getUserId(), targetType, targetId, clientIpResolver.resolve(request));
        return ResponseEntity.ok(ApiResponse.success(history, "Reading history recorded"));
    }

    @GetMapping
    @Operation(summary = "Get current user's reading history")
    public ResponseEntity<ApiResponse<List<UserReadingHistoryDTO>>> getHistory(
        @RequestParam(defaultValue = "all") String type,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        HttpServletRequest request
    ) {
        UserTokenClaims claims = getRequiredClaims(request);
        int resolvedPage = PaginationParams.resolvePage(page);
        int resolvedLimit = PaginationParams.resolveLimit(limit, size, 20, 100);
        Page<UserReadingHistoryDTO> historyPage = userReadingHistoryService.getHistory(claims.getUserId(), type, resolvedPage, resolvedLimit);

        ApiResponse<List<UserReadingHistoryDTO>> response = ApiResponse.success(historyPage.getRecords());
        response.setPagination(new Pagination(historyPage.getTotal(), (int) historyPage.getCurrent(), (int) historyPage.getSize()));
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{targetType}/{targetId}")
    @Operation(summary = "Remove current user's reading history entry")
    public ResponseEntity<ApiResponse<UserReadingHistoryDTO>> removeHistory(
        @PathVariable String targetType,
        @PathVariable Long targetId,
        HttpServletRequest request
    ) {
        UserTokenClaims claims = getRequiredClaims(request);
        UserReadingHistoryDTO history = userReadingHistoryService.remove(claims.getUserId(), targetType, targetId, clientIpResolver.resolve(request));
        return ResponseEntity.ok(ApiResponse.success(history, "Reading history removed"));
    }

    private UserTokenClaims getRequiredClaims(HttpServletRequest request) {
        Object claims = request.getAttribute(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE);
        if (!(claims instanceof UserTokenClaims userTokenClaims) || userTokenClaims.getUserId() == null) {
            throw new UnauthenticatedException("未登录或登录状态已失效");
        }
        return userTokenClaims;
    }

}

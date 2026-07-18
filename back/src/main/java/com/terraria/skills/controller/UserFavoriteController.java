package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.auth.UnauthenticatedException;
import com.terraria.skills.auth.UserAuthenticationInterceptor;
import com.terraria.skills.auth.UserTokenClaims;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.dto.UserFavoriteDTO;
import com.terraria.skills.dto.UserFavoriteStatusDTO;
import com.terraria.skills.service.UserFavoriteService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/user/favorites")
@RequiredArgsConstructor
@Tag(name = "UserFavorites", description = "Authenticated user favorite APIs")
public class UserFavoriteController {

    private final UserFavoriteService userFavoriteService;

    @GetMapping
    @Operation(summary = "Get current user's favorites")
    public ResponseEntity<ApiResponse<List<UserFavoriteDTO>>> getFavorites(
        @RequestParam(defaultValue = "all") String type,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        HttpServletRequest request
    ) {
        UserTokenClaims claims = getRequiredClaims(request);
        int resolvedPage = PaginationParams.resolvePage(page);
        int resolvedLimit = PaginationParams.resolveLimit(limit, size, 20, 100);
        Page<UserFavoriteDTO> favoritePage = userFavoriteService.getFavorites(claims.getUserId(), type, resolvedPage, resolvedLimit);

        ApiResponse<List<UserFavoriteDTO>> response = ApiResponse.success(favoritePage.getRecords());
        response.setPagination(new Pagination(favoritePage.getTotal(), (int) favoritePage.getCurrent(), (int) favoritePage.getSize()));
        return ResponseEntity.ok(response);
    }

    @GetMapping("/items/status")
    @Operation(summary = "Get current user's item favorite statuses")
    public ResponseEntity<ApiResponse<Map<Long, UserFavoriteStatusDTO>>> getItemStatuses(
        @RequestParam List<Long> ids,
        HttpServletRequest request
    ) {
        UserTokenClaims claims = getRequiredClaims(request);
        return ResponseEntity.ok(ApiResponse.success(userFavoriteService.getItemStatuses(claims.getUserId(), ids)));
    }

    @GetMapping("/articles/status")
    @Operation(summary = "Get current user's article favorite statuses")
    public ResponseEntity<ApiResponse<Map<Long, UserFavoriteStatusDTO>>> getArticleStatuses(
        @RequestParam List<Long> ids,
        HttpServletRequest request
    ) {
        UserTokenClaims claims = getRequiredClaims(request);
        return ResponseEntity.ok(ApiResponse.success(userFavoriteService.getArticleStatuses(claims.getUserId(), ids)));
    }

    @PutMapping("/items/{itemId}")
    @Operation(summary = "Favorite an item")
    public ResponseEntity<ApiResponse<UserFavoriteStatusDTO>> favoriteItem(
        @PathVariable Long itemId,
        HttpServletRequest request
    ) {
        UserTokenClaims claims = getRequiredClaims(request);
        UserFavoriteStatusDTO status = userFavoriteService.favoriteItem(claims.getUserId(), itemId, getClientIp(request));
        return ResponseEntity.ok(ApiResponse.success(status, "Item favorited"));
    }

    @DeleteMapping("/items/{itemId}")
    @Operation(summary = "Unfavorite an item")
    public ResponseEntity<ApiResponse<UserFavoriteStatusDTO>> unfavoriteItem(
        @PathVariable Long itemId,
        HttpServletRequest request
    ) {
        UserTokenClaims claims = getRequiredClaims(request);
        UserFavoriteStatusDTO status = userFavoriteService.unfavoriteItem(claims.getUserId(), itemId, getClientIp(request));
        return ResponseEntity.ok(ApiResponse.success(status, "Item unfavorited"));
    }

    @PutMapping("/articles/{articleId}")
    @Operation(summary = "Favorite a published article")
    public ResponseEntity<ApiResponse<UserFavoriteStatusDTO>> favoriteArticle(
        @PathVariable Long articleId,
        HttpServletRequest request
    ) {
        UserTokenClaims claims = getRequiredClaims(request);
        UserFavoriteStatusDTO status = userFavoriteService.favoriteArticle(claims.getUserId(), articleId, getClientIp(request));
        return ResponseEntity.ok(ApiResponse.success(status, "Article favorited"));
    }

    @DeleteMapping("/articles/{articleId}")
    @Operation(summary = "Unfavorite an article")
    public ResponseEntity<ApiResponse<UserFavoriteStatusDTO>> unfavoriteArticle(
        @PathVariable Long articleId,
        HttpServletRequest request
    ) {
        UserTokenClaims claims = getRequiredClaims(request);
        UserFavoriteStatusDTO status = userFavoriteService.unfavoriteArticle(claims.getUserId(), articleId, getClientIp(request));
        return ResponseEntity.ok(ApiResponse.success(status, "Article unfavorited"));
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

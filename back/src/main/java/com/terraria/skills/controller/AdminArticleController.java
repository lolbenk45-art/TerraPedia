package com.terraria.skills.controller;

import com.terraria.skills.auth.AdminAuthenticationInterceptor;
import com.terraria.skills.auth.AdminTokenClaims;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.dto.ArticleDTO;
import com.terraria.skills.dto.ArticleReviewLogDTO;
import com.terraria.skills.dto.ArticleReviewRequestDTO;
import com.terraria.skills.dto.ArticleStatusUpdateRequestDTO;
import com.terraria.skills.dto.ArticleUpsertRequestDTO;
import com.terraria.skills.service.ArticleService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/admin/articles")
@RequiredArgsConstructor
@Tag(name = "AdminArticles", description = "Admin article management")
@SecurityRequirement(name = "bearerAuth")
public class AdminArticleController {

    private final ArticleService articleService;

    @GetMapping
    @Operation(summary = "Get admin articles")
    public ResponseEntity<ApiResponse<List<ArticleDTO>>> getArticles(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String keyword,
        @RequestParam(required = false) String status
    ) {
        int resolvedPage = PaginationParams.resolvePage(page);
        int resolvedLimit = PaginationParams.resolveLimit(limit, size, 20);
        Page<ArticleDTO> articlePage = articleService.getAdminArticles(resolvedPage, resolvedLimit, keyword, status);
        ApiResponse<List<ArticleDTO>> response = ApiResponse.success(articlePage.getRecords());
        response.setPagination(new Pagination(articlePage.getTotal(), (int) articlePage.getCurrent(), (int) articlePage.getSize()));
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get admin article detail")
    public ResponseEntity<ApiResponse<ArticleDTO>> getArticle(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(articleService.getAdminArticleById(id)));
    }

    @PostMapping
    @Operation(summary = "Create article")
    public ResponseEntity<ApiResponse<ArticleDTO>> createArticle(
        @Valid @RequestBody ArticleUpsertRequestDTO request,
        HttpServletRequest httpRequest
    ) {
        AdminTokenClaims claims = getRequiredClaims(httpRequest);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success(
                articleService.createArticle(request, claims.getUsername(), getClientIp(httpRequest)),
                "Article created"
            ));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update article")
    public ResponseEntity<ApiResponse<ArticleDTO>> updateArticle(
        @PathVariable Long id,
        @Valid @RequestBody ArticleUpsertRequestDTO request,
        HttpServletRequest httpRequest
    ) {
        AdminTokenClaims claims = getRequiredClaims(httpRequest);
        return ResponseEntity.ok(ApiResponse.success(
            articleService.updateArticle(id, request, claims.getUsername(), getClientIp(httpRequest)),
            "Article updated"
        ));
    }

    @PatchMapping("/{id}/status")
    @Operation(summary = "Update article status")
    public ResponseEntity<ApiResponse<ArticleDTO>> updateStatus(
        @PathVariable Long id,
        @Valid @RequestBody ArticleStatusUpdateRequestDTO request,
        HttpServletRequest httpRequest
    ) {
        AdminTokenClaims claims = getRequiredClaims(httpRequest);
        return ResponseEntity.ok(ApiResponse.success(
            articleService.updateStatus(id, request.getStatus(), claims.getUsername(), getClientIp(httpRequest)),
            "Article status updated"
        ));
    }

    @PostMapping("/{id}/submit-review")
    @Operation(summary = "Submit article for review")
    public ResponseEntity<ApiResponse<ArticleDTO>> submitReview(@PathVariable Long id, HttpServletRequest httpRequest) {
        AdminTokenClaims claims = getRequiredClaims(httpRequest);
        return ResponseEntity.ok(ApiResponse.success(
            articleService.submitReview(id, claims.getUsername(), getClientIp(httpRequest)),
            "Article submitted for review"
        ));
    }

    @PostMapping("/{id}/review")
    @Operation(summary = "Review article (approve/reject)")
    public ResponseEntity<ApiResponse<ArticleDTO>> reviewArticle(
        @PathVariable Long id,
        @Valid @RequestBody ArticleReviewRequestDTO request,
        HttpServletRequest httpRequest
    ) {
        AdminTokenClaims claims = getRequiredClaims(httpRequest);
        return ResponseEntity.ok(ApiResponse.success(
            articleService.reviewArticle(id, request.getAction(), request.getComment(), claims.getUsername(), getClientIp(httpRequest)),
            "Article reviewed"
        ));
    }

    @PostMapping("/{id}/publish")
    @Operation(summary = "Publish approved article")
    public ResponseEntity<ApiResponse<ArticleDTO>> publishArticle(@PathVariable Long id, HttpServletRequest httpRequest) {
        AdminTokenClaims claims = getRequiredClaims(httpRequest);
        return ResponseEntity.ok(ApiResponse.success(
            articleService.publishArticle(id, claims.getUsername(), getClientIp(httpRequest)),
            "Article published"
        ));
    }

    @PostMapping("/{id}/offline")
    @Operation(summary = "Take published article offline")
    public ResponseEntity<ApiResponse<ArticleDTO>> offlineArticle(@PathVariable Long id, HttpServletRequest httpRequest) {
        AdminTokenClaims claims = getRequiredClaims(httpRequest);
        return ResponseEntity.ok(ApiResponse.success(
            articleService.offlineArticle(id, claims.getUsername(), getClientIp(httpRequest)),
            "Article offline"
        ));
    }

    @GetMapping("/{id}/review-logs")
    @Operation(summary = "Get article review logs")
    public ResponseEntity<ApiResponse<List<ArticleReviewLogDTO>>> getReviewLogs(
        @PathVariable Long id,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size
    ) {
        int resolvedPage = PaginationParams.resolvePage(page);
        int resolvedLimit = PaginationParams.resolveLimit(limit, size, 20);
        Page<ArticleReviewLogDTO> reviewLogPage = articleService.getReviewLogs(id, resolvedPage, resolvedLimit);
        ApiResponse<List<ArticleReviewLogDTO>> response = ApiResponse.success(reviewLogPage.getRecords());
        response.setPagination(new Pagination(reviewLogPage.getTotal(), (int) reviewLogPage.getCurrent(), (int) reviewLogPage.getSize()));
        return ResponseEntity.ok(response);
    }

    private String getClientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private AdminTokenClaims getRequiredClaims(HttpServletRequest request) {
        return (AdminTokenClaims) request.getAttribute(AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE);
    }
}

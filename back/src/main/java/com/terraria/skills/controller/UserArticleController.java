package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.auth.UserAuthenticationInterceptor;
import com.terraria.skills.auth.UserTokenClaims;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.dto.ArticleDTO;
import com.terraria.skills.dto.UserArticleUpsertRequestDTO;
import com.terraria.skills.service.ArticleService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/user/articles")
@RequiredArgsConstructor
@Tag(name = "UserArticles", description = "User self article management")
public class UserArticleController {

    private final ArticleService articleService;

    @GetMapping
    @Operation(summary = "Get current user articles")
    public ResponseEntity<ApiResponse<List<ArticleDTO>>> getUserArticles(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String keyword,
        HttpServletRequest request
    ) {
        UserTokenClaims claims = getRequiredClaims(request);
        int resolvedPage = PaginationParams.resolvePage(page);
        int resolvedLimit = PaginationParams.resolveLimit(limit, size, 20);
        Page<ArticleDTO> articlePage = articleService.getUserArticles(claims.getUserId(), resolvedPage, resolvedLimit, keyword);
        ApiResponse<List<ArticleDTO>> response = ApiResponse.success(articlePage.getRecords());
        response.setPagination(new Pagination(articlePage.getTotal(), (int) articlePage.getCurrent(), (int) articlePage.getSize()));
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get current user article detail")
    public ResponseEntity<ApiResponse<ArticleDTO>> getUserArticle(
        @PathVariable Long id,
        HttpServletRequest request
    ) {
        UserTokenClaims claims = getRequiredClaims(request);
        return ResponseEntity.ok(ApiResponse.success(articleService.getUserArticleById(claims.getUserId(), id)));
    }

    @PostMapping
    @Operation(summary = "Create current user draft article")
    public ResponseEntity<ApiResponse<ArticleDTO>> createArticle(
        @Valid @RequestBody UserArticleUpsertRequestDTO request,
        HttpServletRequest httpRequest
    ) {
        UserTokenClaims claims = getRequiredClaims(httpRequest);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(
            articleService.createUserArticle(
                claims.getUserId(),
                request,
                claims.getDisplayName(),
                getClientIp(httpRequest)
            ),
            "Article created"
        ));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update current user article")
    public ResponseEntity<ApiResponse<ArticleDTO>> updateArticle(
        @PathVariable Long id,
        @Valid @RequestBody UserArticleUpsertRequestDTO request,
        HttpServletRequest httpRequest
    ) {
        UserTokenClaims claims = getRequiredClaims(httpRequest);
        return ResponseEntity.ok(ApiResponse.success(
            articleService.updateUserArticle(
                claims.getUserId(),
                id,
                request,
                claims.getDisplayName(),
                getClientIp(httpRequest)
            ),
            "Article updated"
        ));
    }

    @PostMapping("/{id}/submit-review")
    @Operation(summary = "Submit current user article for review")
    public ResponseEntity<ApiResponse<ArticleDTO>> submitReview(
        @PathVariable Long id,
        HttpServletRequest httpRequest
    ) {
        UserTokenClaims claims = getRequiredClaims(httpRequest);
        return ResponseEntity.ok(ApiResponse.success(
            articleService.submitUserArticleReview(
                claims.getUserId(),
                id,
                claims.getDisplayName(),
                getClientIp(httpRequest)
            ),
            "Article submitted for review"
        ));
    }

    private String getClientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private UserTokenClaims getRequiredClaims(HttpServletRequest request) {
        return (UserTokenClaims) request.getAttribute(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE);
    }
}

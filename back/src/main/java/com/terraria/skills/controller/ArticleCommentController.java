package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.auth.UnauthenticatedException;
import com.terraria.skills.auth.UserAuthenticationInterceptor;
import com.terraria.skills.auth.UserTokenClaims;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.dto.ArticleCommentCreateRequestDTO;
import com.terraria.skills.dto.ArticleCommentDTO;
import com.terraria.skills.dto.ArticleCommentReplyCreateRequestDTO;
import com.terraria.skills.service.ArticleCommentService;
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
@RequestMapping("/articles/{articleId}/comments")
@RequiredArgsConstructor
@Tag(name = "ArticleComments", description = "Public article comment APIs")
public class ArticleCommentController {

    private final ArticleCommentService articleCommentService;

    @GetMapping
    @Operation(summary = "Get published article comments")
    public ResponseEntity<ApiResponse<List<ArticleCommentDTO>>> getComments(
        @PathVariable Long articleId,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        HttpServletRequest httpRequest
    ) {
        int resolvedPage = PaginationParams.resolvePage(page);
        int resolvedLimit = PaginationParams.resolveLimit(limit, size, 10, 50);
        Page<ArticleCommentDTO> commentPage = articleCommentService.getPublishedArticleComments(articleId, getOptionalUserId(httpRequest), resolvedPage, resolvedLimit);
        ApiResponse<List<ArticleCommentDTO>> response = ApiResponse.success(commentPage.getRecords());
        response.setPagination(new Pagination(commentPage.getTotal(), (int) commentPage.getCurrent(), (int) commentPage.getSize()));
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{commentId}/replies")
    @Operation(summary = "Get published article comment replies")
    public ResponseEntity<ApiResponse<List<ArticleCommentDTO>>> getReplies(
        @PathVariable Long articleId,
        @PathVariable Long commentId,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        HttpServletRequest httpRequest
    ) {
        int resolvedPage = PaginationParams.resolvePage(page);
        int resolvedLimit = PaginationParams.resolveLimit(limit, size, 10, 50);
        Page<ArticleCommentDTO> replyPage = articleCommentService.getPublishedArticleReplies(articleId, commentId, getOptionalUserId(httpRequest), resolvedPage, resolvedLimit);
        ApiResponse<List<ArticleCommentDTO>> response = ApiResponse.success(replyPage.getRecords());
        response.setPagination(new Pagination(replyPage.getTotal(), (int) replyPage.getCurrent(), (int) replyPage.getSize()));
        return ResponseEntity.ok(response);
    }

    @PostMapping
    @Operation(summary = "Create current user's article comment")
    public ResponseEntity<ApiResponse<ArticleCommentDTO>> createComment(
        @PathVariable Long articleId,
        @Valid @RequestBody ArticleCommentCreateRequestDTO request,
        HttpServletRequest httpRequest
    ) {
        UserTokenClaims claims = getRequiredClaims(httpRequest);
        ArticleCommentDTO comment = articleCommentService.createComment(claims.getUserId(), articleId, request.getContent(), getClientIp(httpRequest));
        return ResponseEntity.ok(ApiResponse.success(comment, "Comment created"));
    }

    @PostMapping("/{commentId}/replies")
    @Operation(summary = "Create current user's article comment reply")
    public ResponseEntity<ApiResponse<ArticleCommentDTO>> createReply(
        @PathVariable Long articleId,
        @PathVariable Long commentId,
        @Valid @RequestBody ArticleCommentReplyCreateRequestDTO request,
        HttpServletRequest httpRequest
    ) {
        UserTokenClaims claims = getRequiredClaims(httpRequest);
        ArticleCommentDTO comment = articleCommentService.createReply(
            claims.getUserId(),
            articleId,
            commentId,
            request.getReplyToCommentId(),
            request.getContent(),
            getClientIp(httpRequest)
        );
        return ResponseEntity.ok(ApiResponse.success(comment, "Comment reply created"));
    }

    @DeleteMapping("/{commentId}")
    @Operation(summary = "Delete current user's own article comment")
    public ResponseEntity<ApiResponse<ArticleCommentDTO>> deleteComment(
        @PathVariable Long articleId,
        @PathVariable Long commentId,
        HttpServletRequest httpRequest
    ) {
        UserTokenClaims claims = getRequiredClaims(httpRequest);
        ArticleCommentDTO comment = articleCommentService.deleteOwnComment(claims.getUserId(), articleId, commentId, getClientIp(httpRequest));
        return ResponseEntity.ok(ApiResponse.success(comment, "Comment deleted"));
    }

    @PostMapping("/{commentId}/like")
    @Operation(summary = "Like current article comment")
    public ResponseEntity<ApiResponse<ArticleCommentDTO>> likeComment(
        @PathVariable Long articleId,
        @PathVariable Long commentId,
        HttpServletRequest httpRequest
    ) {
        UserTokenClaims claims = getRequiredClaims(httpRequest);
        ArticleCommentDTO comment = articleCommentService.likeComment(claims.getUserId(), articleId, commentId, getClientIp(httpRequest));
        return ResponseEntity.ok(ApiResponse.success(comment, "Comment liked"));
    }

    @DeleteMapping("/{commentId}/like")
    @Operation(summary = "Unlike current article comment")
    public ResponseEntity<ApiResponse<ArticleCommentDTO>> unlikeComment(
        @PathVariable Long articleId,
        @PathVariable Long commentId,
        HttpServletRequest httpRequest
    ) {
        UserTokenClaims claims = getRequiredClaims(httpRequest);
        ArticleCommentDTO comment = articleCommentService.unlikeComment(claims.getUserId(), articleId, commentId, getClientIp(httpRequest));
        return ResponseEntity.ok(ApiResponse.success(comment, "Comment unliked"));
    }

    private Long getOptionalUserId(HttpServletRequest request) {
        Object claims = request.getAttribute(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE);
        if (claims instanceof UserTokenClaims userTokenClaims) {
            return userTokenClaims.getUserId();
        }
        return null;
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

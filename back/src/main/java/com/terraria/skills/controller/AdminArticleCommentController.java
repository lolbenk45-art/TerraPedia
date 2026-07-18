package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.auth.AdminAuthenticationInterceptor;
import com.terraria.skills.auth.AdminTokenClaims;
import com.terraria.skills.auth.UnauthenticatedException;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.dto.AdminArticleCommentDTO;
import com.terraria.skills.dto.AdminArticleCommentStatusRequestDTO;
import com.terraria.skills.service.AdminArticleCommentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/admin/articles/{articleId}/comments")
@RequiredArgsConstructor
@Tag(name = "AdminArticleComments", description = "Admin article comment moderation")
@SecurityRequirement(name = "bearerAuth")
public class AdminArticleCommentController {

    private final AdminArticleCommentService adminArticleCommentService;

    @GetMapping
    @Operation(summary = "Get admin article comments")
    public ResponseEntity<ApiResponse<List<AdminArticleCommentDTO>>> getComments(
        @PathVariable Long articleId,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String keyword,
        @RequestParam(required = false) Long authorId,
        @RequestParam(required = false) String sortBy,
        @RequestParam(required = false) String sortOrder
    ) {
        int resolvedPage = PaginationParams.resolvePage(page);
        int resolvedLimit = PaginationParams.resolveLimit(limit, size, 20, 100);
        Page<AdminArticleCommentDTO> commentPage = adminArticleCommentService.getArticleComments(articleId, resolvedPage, resolvedLimit, status, keyword, authorId, sortBy, sortOrder);
        ApiResponse<List<AdminArticleCommentDTO>> response = ApiResponse.success(commentPage.getRecords());
        response.setPagination(new Pagination(commentPage.getTotal(), (int) commentPage.getCurrent(), (int) commentPage.getSize()));
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{commentId}/replies")
    @Operation(summary = "Get admin article comment replies")
    public ResponseEntity<ApiResponse<List<AdminArticleCommentDTO>>> getReplies(
        @PathVariable Long articleId,
        @PathVariable Long commentId,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String status
    ) {
        int resolvedPage = PaginationParams.resolvePage(page);
        int resolvedLimit = PaginationParams.resolveLimit(limit, size, 20, 100);
        Page<AdminArticleCommentDTO> replyPage = adminArticleCommentService.getArticleCommentReplies(articleId, commentId, resolvedPage, resolvedLimit, status);
        ApiResponse<List<AdminArticleCommentDTO>> response = ApiResponse.success(replyPage.getRecords());
        response.setPagination(new Pagination(replyPage.getTotal(), (int) replyPage.getCurrent(), (int) replyPage.getSize()));
        return ResponseEntity.ok(response);
    }

    @PatchMapping("/{commentId}/status")
    @Operation(summary = "Update admin article comment status")
    public ResponseEntity<ApiResponse<AdminArticleCommentDTO>> updateStatus(
        @PathVariable Long articleId,
        @PathVariable Long commentId,
        @Valid @RequestBody AdminArticleCommentStatusRequestDTO request,
        HttpServletRequest httpRequest
    ) {
        AdminTokenClaims claims = getRequiredClaims(httpRequest);
        AdminArticleCommentDTO comment = adminArticleCommentService.updateCommentStatus(
            articleId,
            commentId,
            request.getStatus(),
            request.getReason(),
            claims.getUsername(),
            getClientIp(httpRequest)
        );
        return ResponseEntity.ok(ApiResponse.success(comment, "Comment status updated"));
    }

    private AdminTokenClaims getRequiredClaims(HttpServletRequest request) {
        Object claims = request.getAttribute(AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE);
        if (!(claims instanceof AdminTokenClaims adminTokenClaims)) {
            throw new UnauthenticatedException("未登录或登录状态已失效");
        }
        return adminTokenClaims;
    }

    private String getClientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}

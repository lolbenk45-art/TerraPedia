package com.terraria.skills.service.impl;

import com.terraria.skills.common.AdminTextUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.AdminArticleCommentDTO;
import com.terraria.skills.entity.Article;
import com.terraria.skills.mapper.ArticleCommentMapper;
import com.terraria.skills.mapper.ArticleMapper;
import com.terraria.skills.service.AdminArticleCommentService;
import com.terraria.skills.service.SecurityAuditService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class AdminArticleCommentServiceImpl implements AdminArticleCommentService {

    private final ArticleCommentMapper articleCommentMapper;
    private final ArticleMapper articleMapper;
    private final SecurityAuditService securityAuditService;
    private final UserAvatarUrlResolver userAvatarUrlResolver;

    @Override
    public Page<AdminArticleCommentDTO> getArticleComments(Long articleId, int page, int limit, String status, String keyword, Long authorId, String sortBy, String sortOrder) {
        requireExistingArticle(articleId);
        int resolvedPage = Math.max(1, page);
        int resolvedLimit = Math.max(1, Math.min(limit, 100));
        long offset = (long) (resolvedPage - 1) * resolvedLimit;
        String normalizedStatus = normalizeOptionalStatus(status);
        String normalizedKeyword = AdminTextUtils.trimToNull(keyword);
        String normalizedSortBy = normalizeSortBy(sortBy);
        String normalizedSortOrder = normalizeSortOrder(sortOrder);

        Page<AdminArticleCommentDTO> result = new Page<>(resolvedPage, resolvedLimit);
        result.setTotal(articleCommentMapper.countAdminArticleComments(articleId, normalizedStatus, normalizedKeyword, authorId));
        List<AdminArticleCommentDTO> records = articleCommentMapper.selectAdminArticleCommentsPage(articleId, normalizedStatus, normalizedKeyword, authorId, normalizedSortBy, normalizedSortOrder, resolvedLimit, offset);
        records.forEach(this::normalizeComment);
        result.setRecords(records);
        return result;
    }

    @Override
    public Page<AdminArticleCommentDTO> getArticleCommentReplies(Long articleId, Long rootCommentId, int page, int limit, String status) {
        requireExistingArticle(articleId);
        requireCommentId(rootCommentId);
        AdminArticleCommentDTO root = articleCommentMapper.selectAdminCommentByArticleAndId(articleId, rootCommentId);
        if (root == null || root.getParentId() != null) {
            throw new IllegalArgumentException("Root comment not found");
        }
        int resolvedPage = Math.max(1, page);
        int resolvedLimit = Math.max(1, Math.min(limit, 100));
        long offset = (long) (resolvedPage - 1) * resolvedLimit;
        String normalizedStatus = normalizeOptionalStatus(status);

        Page<AdminArticleCommentDTO> result = new Page<>(resolvedPage, resolvedLimit);
        result.setTotal(articleCommentMapper.countAdminArticleCommentReplies(articleId, rootCommentId, normalizedStatus));
        List<AdminArticleCommentDTO> records = articleCommentMapper.selectAdminArticleCommentRepliesPage(articleId, rootCommentId, normalizedStatus, resolvedLimit, offset);
        records.forEach(this::normalizeComment);
        result.setRecords(records);
        return result;
    }

    @Override
    @Transactional
    public AdminArticleCommentDTO updateCommentStatus(Long articleId, Long commentId, String status, String reason, String operator, String ipAddress) {
        requireExistingArticle(articleId);
        requireCommentId(commentId);
        String normalizedStatus = normalizeRequiredStatus(status);
        String normalizedReason = AdminTextUtils.trimToNull(reason);
        String normalizedOperator = AdminTextUtils.trimToNull(operator);
        if (normalizedOperator == null) {
            normalizedOperator = "admin";
        }

        AdminArticleCommentDTO existing = articleCommentMapper.selectAdminCommentByArticleAndId(articleId, commentId);
        if (existing == null) {
            throw new IllegalArgumentException("Comment not found");
        }
        if (("HIDDEN".equals(normalizedStatus) || "DELETED".equals(normalizedStatus)) && normalizedReason == null) {
            throw new IllegalArgumentException("moderation reason is required");
        }
        if ("PUBLISHED".equals(normalizedStatus)
            && Boolean.TRUE.equals(existing.getDeleted())
            && !"ADMIN".equalsIgnoreCase(existing.getDeletedByType())) {
            throw new IllegalArgumentException("User deleted comment cannot be restored");
        }

        String eventType = switch (normalizedStatus) {
            case "PUBLISHED" -> "ADMIN_ARTICLE_COMMENT_RESTORED";
            case "HIDDEN" -> "ADMIN_ARTICLE_COMMENT_HIDDEN";
            case "DELETED" -> "ADMIN_ARTICLE_COMMENT_DELETED";
            default -> throw new IllegalArgumentException("Invalid comment status");
        };

        articleCommentMapper.updateAdminCommentStatus(articleId, commentId, normalizedStatus, normalizedReason, normalizedOperator);
        securityAuditService.log(
            eventType,
            "ADMIN",
            null,
            null,
            ipAddress,
            "articleId=" + articleId + ",commentId=" + commentId + ",operator=" + normalizedOperator + ",reason=" + (normalizedReason == null ? "" : normalizedReason)
        );
        return normalizeComment(articleCommentMapper.selectAdminCommentByArticleAndId(articleId, commentId));
    }

    private Article requireExistingArticle(Long articleId) {
        if (articleId == null || articleId <= 0) {
            throw new IllegalArgumentException("Article id is required");
        }
        Article article = articleMapper.selectOne(new LambdaQueryWrapper<Article>()
            .eq(Article::getId, articleId)
            .eq(Article::getDeleted, 0)
            .last("LIMIT 1"));
        if (article == null) {
            throw new IllegalArgumentException("Article not found");
        }
        return article;
    }

    private void requireCommentId(Long commentId) {
        if (commentId == null || commentId <= 0) {
            throw new IllegalArgumentException("Comment id is required");
        }
    }

    private String normalizeOptionalStatus(String status) {
        String normalized = AdminTextUtils.trimToNull(status);
        if (normalized == null) {
            return null;
        }
        return normalizeRequiredStatus(normalized);
    }

    private String normalizeRequiredStatus(String status) {
        String normalized = AdminTextUtils.trimToNull(status);
        if (normalized == null) {
            throw new IllegalArgumentException("comment status is required");
        }
        normalized = normalized.toUpperCase();
        if (!"PUBLISHED".equals(normalized) && !"HIDDEN".equals(normalized) && !"DELETED".equals(normalized)) {
            throw new IllegalArgumentException("Invalid comment status");
        }
        return normalized;
    }

    private String normalizeSortBy(String sortBy) {
        String normalized = AdminTextUtils.trimToNull(sortBy);
        if (normalized == null) {
            return "createdAt";
        }
        return switch (normalized) {
            case "createdAt", "replyCount", "likeCount", "id" -> normalized;
            default -> "createdAt";
        };
    }

    private String normalizeSortOrder(String sortOrder) {
        String normalized = AdminTextUtils.trimToNull(sortOrder);
        if ("asc".equalsIgnoreCase(normalized)) {
            return "asc";
        }
        return "desc";
    }

    private AdminArticleCommentDTO normalizeComment(AdminArticleCommentDTO comment) {
        if (comment == null) {
            return null;
        }
        comment.setAuthorAvatarUrl(userAvatarUrlResolver.resolveProfileAvatarUrl(
            comment.getAuthorAvatarUrl(),
            comment.getAuthorAvatarObjectKey()
        ));
        if (comment.getAuthorDisplayName() == null || comment.getAuthorDisplayName().isBlank()) {
            comment.setAuthorDisplayName("TerraPedia 用户");
        }
        if (comment.getLikeCount() == null) {
            comment.setLikeCount(0);
        }
        if (comment.getReplyCount() == null) {
            comment.setReplyCount(0);
        }
        if (comment.getDeleted() == null) {
            comment.setDeleted(false);
        }
        if (comment.getStatus() == null || comment.getStatus().isBlank()) {
            comment.setStatus("PUBLISHED");
        }
        return comment;
    }

}

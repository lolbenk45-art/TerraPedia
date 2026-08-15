package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.ArticleCommentDTO;
import com.terraria.skills.entity.Article;
import com.terraria.skills.entity.ArticleComment;
import com.terraria.skills.mapper.ArticleCommentMapper;
import com.terraria.skills.mapper.ArticleMapper;
import com.terraria.skills.service.ArticleCommentService;
import com.terraria.skills.service.SecurityAuditService;
import com.terraria.skills.service.UserNotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class ArticleCommentServiceImpl implements ArticleCommentService {

    private final ArticleCommentMapper articleCommentMapper;
    private final ArticleMapper articleMapper;
    private final SecurityAuditService securityAuditService;
    private final UserNotificationService userNotificationService;
    private final UserAvatarUrlResolver userAvatarUrlResolver;

    @Override
    public Page<ArticleCommentDTO> getPublishedArticleComments(Long articleId, Long currentUserId, int page, int limit) {
        requirePublishedArticle(articleId);
        int resolvedPage = Math.max(1, page);
        int resolvedLimit = Math.max(1, Math.min(limit, 50));
        long offset = (long) (resolvedPage - 1) * resolvedLimit;

        Page<ArticleCommentDTO> result = new Page<>(resolvedPage, resolvedLimit);
        result.setTotal(articleCommentMapper.countPublishedArticleComments(articleId));
        List<ArticleCommentDTO> records = articleCommentMapper.selectPublishedArticleCommentsPage(articleId, currentUserId, resolvedLimit, offset);
        records.forEach(comment -> {
            normalizeComment(comment);
            List<ArticleCommentDTO> replies = articleCommentMapper.selectPublishedArticleRepliesPage(articleId, comment.getId(), currentUserId, 2L, 0L);
            replies.forEach(this::normalizeComment);
            comment.setReplies(replies);
        });
        result.setRecords(records);
        return result;
    }

    @Override
    public Page<ArticleCommentDTO> getPublishedArticleReplies(Long articleId, Long rootCommentId, Long currentUserId, int page, int limit) {
        requirePublishedArticle(articleId);
        ArticleCommentDTO root = requireVisibleComment(articleId, rootCommentId);
        if (root.getParentId() != null) {
            throw new IllegalArgumentException("Root comment not found");
        }
        int resolvedPage = Math.max(1, page);
        int resolvedLimit = Math.max(1, Math.min(limit, 50));
        long offset = (long) (resolvedPage - 1) * resolvedLimit;

        Page<ArticleCommentDTO> result = new Page<>(resolvedPage, resolvedLimit);
        result.setTotal(articleCommentMapper.countPublishedArticleReplies(articleId, rootCommentId));
        List<ArticleCommentDTO> records = articleCommentMapper.selectPublishedArticleRepliesPage(articleId, rootCommentId, currentUserId, resolvedLimit, offset);
        records.forEach(this::normalizeComment);
        result.setRecords(records);
        return result;
    }

    @Override
    @Transactional
    public ArticleCommentDTO createComment(Long userId, Long articleId, String content, String ipAddress) {
        requireUserId(userId);
        Article article = requirePublishedArticle(articleId);
        String normalizedContent = normalizeContent(content);

        ArticleComment comment = new ArticleComment();
        comment.setArticleId(articleId);
        comment.setParentId(null);
        comment.setRootId(null);
        comment.setAuthorId(userId);
        comment.setContent(normalizedContent);
        comment.setLikeCount(0);
        comment.setReplyCount(0);
        comment.setStatus("PUBLISHED");
        comment.setDeleted(0);
        comment.setCreatedAt(LocalDateTime.now());
        comment.setUpdatedAt(comment.getCreatedAt());
        articleCommentMapper.insert(comment);
        if (comment.getId() == null) {
            throw new IllegalStateException("Comment id was not generated");
        }
        articleCommentMapper.updateRootId(comment.getId(), articleId, comment.getId());

        securityAuditService.log("ARTICLE_COMMENT_CREATED", "USER", userId, null, ipAddress, "articleId=" + articleId + ",commentId=" + comment.getId());
        notifyRootCommentCreated(article, comment.getId(), userId);
        return normalizeComment(articleCommentMapper.selectCommentByArticleAndId(articleId, comment.getId()));
    }

    @Override
    @Transactional
    public ArticleCommentDTO createReply(Long userId, Long articleId, Long rootCommentId, Long replyToCommentId, String content, String ipAddress) {
        requireUserId(userId);
        Article article = requirePublishedArticle(articleId);
        String normalizedContent = normalizeContent(content);
        ArticleCommentDTO root = requireVisibleComment(articleId, rootCommentId);
        if (root.getParentId() != null) {
            throw new IllegalArgumentException("Root comment not found");
        }

        ArticleCommentDTO replyTarget = root;
        if (replyToCommentId != null && !replyToCommentId.equals(rootCommentId)) {
            replyTarget = requireVisibleComment(articleId, replyToCommentId);
            Long targetRootId = replyTarget.getRootId() == null ? replyTarget.getId() : replyTarget.getRootId();
            if (!rootCommentId.equals(targetRootId)) {
                throw new IllegalArgumentException("Reply target not found");
            }
        }

        ArticleComment comment = new ArticleComment();
        comment.setArticleId(articleId);
        comment.setParentId(rootCommentId);
        comment.setRootId(rootCommentId);
        comment.setAuthorId(userId);
        comment.setReplyToUserId(replyTarget.getAuthorId());
        comment.setContent(normalizedContent);
        comment.setLikeCount(0);
        comment.setReplyCount(0);
        comment.setStatus("PUBLISHED");
        comment.setDeleted(0);
        comment.setCreatedAt(LocalDateTime.now());
        comment.setUpdatedAt(comment.getCreatedAt());
        articleCommentMapper.insert(comment);
        articleCommentMapper.incrementReplyCount(articleId, rootCommentId);

        securityAuditService.log("ARTICLE_COMMENT_REPLY_CREATED", "USER", userId, null, ipAddress,
            "articleId=" + articleId + ",commentId=" + comment.getId() + ",rootId=" + rootCommentId + ",parentId=" + rootCommentId);
        notifyReplyCreated(article, rootCommentId, comment.getId(), replyTarget, userId);
        return normalizeComment(articleCommentMapper.selectCommentByArticleAndId(articleId, comment.getId()));
    }

    @Override
    @Transactional
    public ArticleCommentDTO deleteOwnComment(Long userId, Long articleId, Long commentId, String ipAddress) {
        requireUserId(userId);
        requirePublishedArticle(articleId);
        requireCommentId(commentId);

        ArticleCommentDTO existing = articleCommentMapper.selectCommentByArticleAndId(articleId, commentId);
        if (existing == null || !articleId.equals(existing.getArticleId()) || !userId.equals(existing.getAuthorId()) || Boolean.TRUE.equals(existing.getDeleted())) {
            throw new IllegalArgumentException("Comment not found");
        }

        articleCommentMapper.softDeleteOwnComment(commentId, articleId, userId);
        if (existing.getParentId() != null && existing.getRootId() != null) {
            articleCommentMapper.decrementReplyCount(articleId, existing.getRootId());
        }
        securityAuditService.log("ARTICLE_COMMENT_DELETED", "USER", userId, null, ipAddress, "articleId=" + articleId + ",commentId=" + commentId);
        return normalizeComment(articleCommentMapper.selectCommentByArticleAndId(articleId, commentId));
    }

    @Override
    @Transactional
    public ArticleCommentDTO likeComment(Long userId, Long articleId, Long commentId, String ipAddress) {
        requireUserId(userId);
        requirePublishedArticle(articleId);
        requireVisibleComment(articleId, commentId);

        int changed = articleCommentMapper.insertLikeIgnore(commentId, articleId, userId);
        if (changed == 0) {
            changed = articleCommentMapper.reactivateLike(commentId, articleId, userId);
        }
        if (changed > 0) {
            articleCommentMapper.incrementLikeCount(articleId, commentId);
            securityAuditService.log("ARTICLE_COMMENT_LIKED", "USER", userId, null, ipAddress, "articleId=" + articleId + ",commentId=" + commentId);
        }
        ArticleCommentDTO updated = articleCommentMapper.selectCommentByArticleAndId(articleId, commentId);
        updated.setLikedByCurrentUser(true);
        return normalizeComment(updated);
    }

    @Override
    @Transactional
    public ArticleCommentDTO unlikeComment(Long userId, Long articleId, Long commentId, String ipAddress) {
        requireUserId(userId);
        requirePublishedArticle(articleId);
        requireCommentId(commentId);

        int changed = articleCommentMapper.deactivateLike(commentId, articleId, userId);
        if (changed > 0) {
            articleCommentMapper.decrementLikeCount(articleId, commentId);
            securityAuditService.log("ARTICLE_COMMENT_UNLIKED", "USER", userId, null, ipAddress, "articleId=" + articleId + ",commentId=" + commentId);
        }
        ArticleCommentDTO updated = articleCommentMapper.selectCommentByArticleAndId(articleId, commentId);
        if (updated == null) {
            throw new IllegalArgumentException("Comment not found");
        }
        updated.setLikedByCurrentUser(false);
        return normalizeComment(updated);
    }

    private Article requirePublishedArticle(Long articleId) {
        if (articleId == null || articleId <= 0) {
            throw new IllegalArgumentException("Article id is required");
        }
        Article article = articleMapper.selectOne(new LambdaQueryWrapper<Article>()
            .eq(Article::getId, articleId)
            .eq(Article::getDeleted, 0)
            .eq(Article::getStatus, "PUBLISHED")
            .last("LIMIT 1"));
        if (article == null) {
            throw new IllegalArgumentException("Published article not found");
        }
        return article;
    }

    private void notifyRootCommentCreated(Article article, Long commentId, Long actorUserId) {
        Long authorId = article.getAuthorId();
        if (shouldSkipNotification(authorId, actorUserId)) {
            return;
        }
        userNotificationService.createNotification(
            authorId,
            "ARTICLE_COMMENTED",
            "文章收到新评论",
            "你的文章《" + articleTitle(article) + "》收到一条新评论。",
            articleCommentTargetUrl(article, commentId, null)
        );
    }

    private void notifyReplyCreated(Article article, Long rootCommentId, Long replyId, ArticleCommentDTO replyTarget, Long actorUserId) {
        Long articleAuthorId = article.getAuthorId();
        if (!shouldSkipNotification(articleAuthorId, actorUserId)) {
            userNotificationService.createNotification(
                articleAuthorId,
                "ARTICLE_COMMENT_REPLIED",
                "文章收到新回复",
                "你的文章《" + articleTitle(article) + "》收到一条新回复。",
                articleCommentTargetUrl(article, rootCommentId, replyId)
            );
        }

        Long replyTargetAuthorId = replyTarget == null ? null : replyTarget.getAuthorId();
        if (!Objects.equals(replyTargetAuthorId, articleAuthorId) && !shouldSkipNotification(replyTargetAuthorId, actorUserId)) {
            userNotificationService.createNotification(
                replyTargetAuthorId,
                "ARTICLE_COMMENT_REPLIED_TO_YOU",
                "评论收到回复",
                "你在《" + articleTitle(article) + "》下的评论收到一条回复。",
                articleCommentTargetUrl(article, rootCommentId, replyId)
            );
        }
    }

    private boolean shouldSkipNotification(Long recipientUserId, Long actorUserId) {
        return recipientUserId == null || recipientUserId <= 0 || Objects.equals(recipientUserId, actorUserId);
    }

    private String articleTitle(Article article) {
        String title = article.getTitle() == null ? "" : article.getTitle().trim();
        return title.isBlank() ? "未命名文章" : title;
    }

    private String articleCommentTargetUrl(Article article, Long commentId, Long replyId) {
        String slug = article.getSlug() == null ? "" : article.getSlug().trim();
        StringBuilder target = new StringBuilder();
        if (!slug.isBlank()) {
            target.append("/articles/").append(slug);
        } else {
            target.append("/articles/").append(article.getId());
        }
        if (commentId != null && commentId > 0) {
            target.append("?commentId=").append(commentId);
            if (replyId != null && replyId > 0) {
                target.append("&replyId=").append(replyId);
            }
        }
        target.append("#article-comments");
        return target.toString();
    }

    private void requireUserId(Long userId) {
        if (userId == null || userId <= 0) {
            throw new IllegalArgumentException("Invalid user id");
        }
    }

    private void requireCommentId(Long commentId) {
        if (commentId == null || commentId <= 0) {
            throw new IllegalArgumentException("Comment id is required");
        }
    }

    private ArticleCommentDTO requireVisibleComment(Long articleId, Long commentId) {
        requireCommentId(commentId);
        ArticleCommentDTO comment = articleCommentMapper.selectCommentByArticleAndId(articleId, commentId);
        if (comment == null
            || !Objects.equals(articleId, comment.getArticleId())
            || Boolean.TRUE.equals(comment.getDeleted())
            || !"PUBLISHED".equalsIgnoreCase(comment.getStatus())) {
            throw new IllegalArgumentException("Comment not found");
        }
        return comment;
    }

    private String normalizeContent(String content) {
        String normalized = content == null ? "" : content.trim();
        if (normalized.isBlank()) {
            throw new IllegalArgumentException("comment content is required");
        }
        if (normalized.length() > 1000) {
            throw new IllegalArgumentException("comment content is too long");
        }
        return normalized;
    }

    private ArticleCommentDTO normalizeComment(ArticleCommentDTO comment) {
        if (comment == null) {
            return null;
        }
        comment.setAuthorAvatarUrl(userAvatarUrlResolver.resolveProfileAvatarUrl(
            comment.getAuthorAvatarUrl(),
            comment.getAuthorAvatarObjectKey()
        ));
        if (comment.getLikeCount() == null) {
            comment.setLikeCount(0);
        }
        if (comment.getReplyCount() == null) {
            comment.setReplyCount(0);
        }
        if (comment.getLikedByCurrentUser() == null) {
            comment.setLikedByCurrentUser(false);
        }
        if (comment.getDeleted() == null) {
            comment.setDeleted(false);
        }
        if (comment.getStatus() == null || comment.getStatus().isBlank()) {
            comment.setStatus("PUBLISHED");
        }
        if (comment.getReplies() == null) {
            comment.setReplies(Collections.emptyList());
        }
        if (comment.getAuthorDisplayName() == null || comment.getAuthorDisplayName().isBlank()) {
            comment.setAuthorDisplayName("TerraPedia 用户");
        }
        return comment;
    }
}

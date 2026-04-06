package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.config.ArticleReviewProperties;
import com.terraria.skills.dto.ArticleDTO;
import com.terraria.skills.dto.ArticleReviewAction;
import com.terraria.skills.dto.ArticleReviewLogDTO;
import com.terraria.skills.dto.ArticleReviewStatus;
import com.terraria.skills.dto.ArticleStatus;
import com.terraria.skills.dto.ArticleUpsertRequestDTO;
import com.terraria.skills.dto.UserArticleUpsertRequestDTO;
import com.terraria.skills.entity.Article;
import com.terraria.skills.entity.ArticleReviewLog;
import com.terraria.skills.mapper.ArticleMapper;
import com.terraria.skills.mapper.ArticleReviewLogMapper;
import com.terraria.skills.service.ArticleService;
import com.terraria.skills.service.SecurityAuditService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.text.Normalizer;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;

@Slf4j
@Service
@RequiredArgsConstructor
public class ArticleServiceImpl implements ArticleService {

    private static final String ACTION_SUBMIT_REVIEW = "SUBMIT_REVIEW";
    private static final String ACTION_REVIEW_APPROVE = "REVIEW_APPROVE";
    private static final String ACTION_REVIEW_REJECT = "REVIEW_REJECT";
    private static final String ACTION_PUBLISH = "PUBLISH";
    private static final String ACTION_OFFLINE = "OFFLINE";
    private static final String ACTION_DIRECT_PUBLISH_COMPAT = "DIRECT_PUBLISH_COMPAT";
    private static final String ACTION_RESET_TO_DRAFT = "RESET_TO_DRAFT";

    private final ArticleMapper articleMapper;
    private final ArticleReviewLogMapper articleReviewLogMapper;
    private final SecurityAuditService securityAuditService;
    private final ArticleReviewProperties articleReviewProperties;

    @Override
    public Page<ArticleDTO> getAdminArticles(int page, int limit, String keyword, String status) {
        Page<ArticleDTO> mpPage = new Page<>(Math.max(1, page), Math.max(1, Math.min(limit, 100)));
        return articleMapper.selectAdminArticlesPage(mpPage, trimToNull(keyword), normalizeStatusAllowNull(status));
    }

    @Override
    public ArticleDTO getAdminArticleById(Long id) {
        if (id == null || id <= 0) {
            throw new IllegalArgumentException("Invalid article id");
        }
        ArticleDTO article = articleMapper.selectAdminArticleById(id);
        if (article == null) {
            throw new IllegalArgumentException("Article not found");
        }
        return article;
    }

    @Override
    public ArticleDTO createArticle(ArticleUpsertRequestDTO request, String operatorName, String ipAddress) {
        String normalizedStatus = normalizeStatus(request.getStatus());
        String normalizedOperator = normalizeOperatorName(operatorName);
        LocalDateTime now = LocalDateTime.now();

        Article article = new Article();
        article.setTitle(request.getTitle().trim());
        article.setSlug(resolveUniqueSlug(request.getSlug(), request.getTitle(), null));
        article.setSummary(trimToNull(request.getSummary()));
        article.setCoverImage(trimToNull(request.getCoverImage()));
        article.setContentHtml(request.getContentHtml().trim());
        article.setAuthorId(null);
        article.setReviewStatus(ArticleReviewStatus.DRAFT);
        article.setReviewComment(null);
        article.setReviewedAt(null);
        article.setSubmittedAt(null);
        article.setReviewerName(null);
        article.setStatus(ArticleStatus.DRAFT);
        article.setPublishedAt(null);

        boolean directPublishCompat = applyLegacyStatusCompatIfNeeded(article, normalizedStatus, normalizedOperator, now);
        articleMapper.insert(article);

        if (directPublishCompat) {
            writeReviewLog(
                article.getId(),
                ACTION_DIRECT_PUBLISH_COMPAT,
                ArticleReviewStatus.DRAFT,
                article.getReviewStatus(),
                "compat legacy status update to " + normalizedStatus,
                normalizedOperator
            );
            audit(
                "ARTICLE_DIRECT_PUBLISH_COMPAT",
                normalizedOperator,
                ipAddress,
                "articleId=" + article.getId() + ",status=" + normalizedStatus
            );
        }

        audit("ARTICLE_CREATED", normalizedOperator, ipAddress, "articleId=" + article.getId());
        return getAdminArticleById(article.getId());
    }

    @Override
    public ArticleDTO updateArticle(Long id, ArticleUpsertRequestDTO request, String operatorName, String ipAddress) {
        Article article = requireArticle(id);
        String currentReviewStatus = normalizeReviewStatus(article.getReviewStatus());
        if (ArticleReviewStatus.PENDING_REVIEW.equals(currentReviewStatus)) {
            throw new IllegalArgumentException("Article under review cannot be edited directly");
        }

        String normalizedStatus = normalizeStatus(request.getStatus());
        String normalizedOperator = normalizeOperatorName(operatorName);
        LocalDateTime now = LocalDateTime.now();

        article.setTitle(request.getTitle().trim());
        article.setSlug(resolveUniqueSlug(request.getSlug(), request.getTitle(), id));
        article.setSummary(trimToNull(request.getSummary()));
        article.setCoverImage(trimToNull(request.getCoverImage()));
        article.setContentHtml(request.getContentHtml().trim());

        boolean directPublishCompat = applyLegacyStatusCompatIfNeeded(article, normalizedStatus, normalizedOperator, now);
        if (!directPublishCompat && ArticleStatus.DRAFT.equals(normalizedStatus)) {
            resetToDraft(article);
        }

        article.setUpdatedAt(now);
        articleMapper.updateById(article);

        if (directPublishCompat) {
            writeReviewLog(
                id,
                ACTION_DIRECT_PUBLISH_COMPAT,
                currentReviewStatus,
                article.getReviewStatus(),
                "compat legacy status update to " + normalizedStatus,
                normalizedOperator
            );
            audit(
                "ARTICLE_DIRECT_PUBLISH_COMPAT",
                normalizedOperator,
                ipAddress,
                "articleId=" + id + ",status=" + normalizedStatus
            );
        }

        audit("ARTICLE_UPDATED", normalizedOperator, ipAddress, "articleId=" + id);
        return getAdminArticleById(id);
    }

    @Override
    public ArticleDTO updateStatus(Long id, String status, String operatorName, String ipAddress) {
        Article article = requireArticle(id);
        String normalizedStatus = normalizeStatus(status);
        String normalizedOperator = normalizeOperatorName(operatorName);
        LocalDateTime now = LocalDateTime.now();
        String fromReviewStatus = normalizeReviewStatus(article.getReviewStatus());

        if (ArticleStatus.DRAFT.equals(normalizedStatus)) {
            resetToDraft(article);
            article.setUpdatedAt(now);
            articleMapper.updateById(article);
            writeReviewLog(id, ACTION_RESET_TO_DRAFT, fromReviewStatus, ArticleReviewStatus.DRAFT, "legacy status endpoint", normalizedOperator);
            audit("ARTICLE_RESET_TO_DRAFT", normalizedOperator, ipAddress, "articleId=" + id);
            return getAdminArticleById(id);
        }

        if (ArticleStatus.PUBLISHED.equals(normalizedStatus)) {
            boolean compatPromoted = ensureApprovedForPublish(article, normalizedOperator, ipAddress, now, true);
            article.setStatus(ArticleStatus.PUBLISHED);
            article.setPublishedAt(article.getPublishedAt() == null ? now : article.getPublishedAt());
            article.setUpdatedAt(now);
            articleMapper.updateById(article);

            if (compatPromoted) {
                writeReviewLog(id, ACTION_DIRECT_PUBLISH_COMPAT, fromReviewStatus, ArticleReviewStatus.APPROVED, "legacy status endpoint", normalizedOperator);
            }
            writeReviewLog(id, ACTION_PUBLISH, article.getReviewStatus(), article.getReviewStatus(), null, normalizedOperator);
            audit("ARTICLE_PUBLISHED", normalizedOperator, ipAddress, "articleId=" + id + ",legacy=true");
            return getAdminArticleById(id);
        }

        boolean compatPromoted = ensureApprovedForPublish(article, normalizedOperator, ipAddress, now, true);
        if (!ArticleStatus.PUBLISHED.equals(article.getStatus())) {
            throw new IllegalArgumentException("Only published article can be taken offline");
        }
        article.setStatus(ArticleStatus.OFFLINE);
        article.setPublishedAt(null);
        article.setUpdatedAt(now);
        articleMapper.updateById(article);

        if (compatPromoted) {
            writeReviewLog(id, ACTION_DIRECT_PUBLISH_COMPAT, fromReviewStatus, ArticleReviewStatus.APPROVED, "legacy status endpoint", normalizedOperator);
        }
        writeReviewLog(id, ACTION_OFFLINE, article.getReviewStatus(), article.getReviewStatus(), null, normalizedOperator);
        audit("ARTICLE_OFFLINE", normalizedOperator, ipAddress, "articleId=" + id + ",legacy=true");
        return getAdminArticleById(id);
    }

    @Override
    public ArticleDTO submitReview(Long id, String operatorName, String ipAddress) {
        Article article = requireArticle(id);
        String fromReviewStatus = normalizeReviewStatus(article.getReviewStatus());
        if (!(ArticleReviewStatus.DRAFT.equals(fromReviewStatus) || ArticleReviewStatus.REJECTED.equals(fromReviewStatus))) {
            throw new IllegalArgumentException("Only draft or rejected article can be submitted for review");
        }
        if (ArticleStatus.PUBLISHED.equals(article.getStatus())) {
            throw new IllegalArgumentException("Published article cannot be submitted for review");
        }

        article.setReviewStatus(ArticleReviewStatus.PENDING_REVIEW);
        article.setSubmittedAt(LocalDateTime.now());
        article.setReviewComment(null);
        article.setReviewedAt(null);
        article.setReviewerName(null);
        article.setUpdatedAt(LocalDateTime.now());
        articleMapper.updateById(article);

        String normalizedOperator = normalizeOperatorName(operatorName);
        writeReviewLog(id, ACTION_SUBMIT_REVIEW, fromReviewStatus, ArticleReviewStatus.PENDING_REVIEW, null, normalizedOperator);
        audit("ARTICLE_SUBMIT_REVIEW", normalizedOperator, ipAddress, "articleId=" + id);
        return getAdminArticleById(id);
    }

    @Override
    public ArticleDTO reviewArticle(Long id, String action, String comment, String operatorName, String ipAddress) {
        Article article = requireArticle(id);
        String currentReviewStatus = normalizeReviewStatus(article.getReviewStatus());
        if (!ArticleReviewStatus.PENDING_REVIEW.equals(currentReviewStatus)) {
            throw new IllegalArgumentException("Only pending article can be reviewed");
        }

        String normalizedAction = normalizeReviewAction(action);
        String normalizedOperator = normalizeOperatorName(operatorName);
        String normalizedComment = trimToNull(comment);
        LocalDateTime now = LocalDateTime.now();

        String toReviewStatus;
        String reviewLogAction;
        String eventType;
        if (ArticleReviewAction.APPROVE.equals(normalizedAction)) {
            toReviewStatus = ArticleReviewStatus.APPROVED;
            reviewLogAction = ACTION_REVIEW_APPROVE;
            eventType = "ARTICLE_REVIEW_APPROVE";
        } else {
            if (normalizedComment == null) {
                throw new IllegalArgumentException("Reject comment is required");
            }
            toReviewStatus = ArticleReviewStatus.REJECTED;
            reviewLogAction = ACTION_REVIEW_REJECT;
            eventType = "ARTICLE_REVIEW_REJECT";
            article.setStatus(ArticleStatus.DRAFT);
            article.setPublishedAt(null);
        }

        article.setReviewStatus(toReviewStatus);
        article.setReviewComment(normalizedComment);
        article.setReviewedAt(now);
        article.setReviewerName(normalizedOperator);
        article.setUpdatedAt(now);
        articleMapper.updateById(article);

        writeReviewLog(id, reviewLogAction, currentReviewStatus, toReviewStatus, normalizedComment, normalizedOperator);
        audit(eventType, normalizedOperator, ipAddress, "articleId=" + id);
        return getAdminArticleById(id);
    }

    @Override
    public ArticleDTO publishArticle(Long id, String operatorName, String ipAddress) {
        Article article = requireArticle(id);
        if (!ArticleReviewStatus.APPROVED.equals(normalizeReviewStatus(article.getReviewStatus()))) {
            throw new IllegalArgumentException("Only approved article can be published");
        }

        LocalDateTime now = LocalDateTime.now();
        article.setStatus(ArticleStatus.PUBLISHED);
        article.setPublishedAt(article.getPublishedAt() == null ? now : article.getPublishedAt());
        article.setUpdatedAt(now);
        articleMapper.updateById(article);

        String normalizedOperator = normalizeOperatorName(operatorName);
        writeReviewLog(id, ACTION_PUBLISH, article.getReviewStatus(), article.getReviewStatus(), null, normalizedOperator);
        audit("ARTICLE_PUBLISHED", normalizedOperator, ipAddress, "articleId=" + id);
        return getAdminArticleById(id);
    }

    @Override
    public ArticleDTO offlineArticle(Long id, String operatorName, String ipAddress) {
        Article article = requireArticle(id);
        if (!ArticleStatus.PUBLISHED.equals(article.getStatus())) {
            throw new IllegalArgumentException("Only published article can be taken offline");
        }

        article.setStatus(ArticleStatus.OFFLINE);
        article.setPublishedAt(null);
        article.setUpdatedAt(LocalDateTime.now());
        articleMapper.updateById(article);

        String normalizedOperator = normalizeOperatorName(operatorName);
        writeReviewLog(id, ACTION_OFFLINE, article.getReviewStatus(), article.getReviewStatus(), null, normalizedOperator);
        audit("ARTICLE_OFFLINE", normalizedOperator, ipAddress, "articleId=" + id);
        return getAdminArticleById(id);
    }

    @Override
    public Page<ArticleReviewLogDTO> getReviewLogs(Long articleId, int page, int limit) {
        requireArticle(articleId);
        Page<ArticleReviewLog> requestPage = new Page<>(Math.max(1, page), Math.max(1, Math.min(limit, 100)));
        Page<ArticleReviewLog> logPage = articleReviewLogMapper.selectPage(
            requestPage,
            new LambdaQueryWrapper<ArticleReviewLog>()
                .eq(ArticleReviewLog::getArticleId, articleId)
                .orderByDesc(ArticleReviewLog::getCreatedAt, ArticleReviewLog::getId)
        );

        List<ArticleReviewLogDTO> records = logPage.getRecords().stream()
            .map(this::toReviewLogDTO)
            .toList();

        Page<ArticleReviewLogDTO> dtoPage = new Page<>(logPage.getCurrent(), logPage.getSize(), logPage.getTotal());
        dtoPage.setRecords(records);
        return dtoPage;
    }

    @Override
    public Page<ArticleDTO> getPublishedArticles(int page, int limit, String keyword) {
        Page<ArticleDTO> mpPage = new Page<>(Math.max(1, page), Math.max(1, Math.min(limit, 100)));
        return articleMapper.selectPublishedArticlesPage(mpPage, trimToNull(keyword));
    }

    @Override
    public ArticleDTO getPublishedArticleById(Long id) {
        if (id == null || id <= 0) {
            throw new IllegalArgumentException("Invalid article id");
        }

        ArticleDTO article = articleMapper.selectPublishedArticleById(id);
        if (article == null) {
            throw new IllegalArgumentException("Article not found");
        }
        return article;
    }

    @Override
    public ArticleDTO getPublishedArticleBySlug(String slug) {
        String normalizedSlug = trimToNull(slug);
        if (normalizedSlug == null) {
            throw new IllegalArgumentException("slug is required");
        }

        ArticleDTO article = articleMapper.selectPublishedArticleBySlug(normalizedSlug);
        if (article == null) {
            throw new IllegalArgumentException("Article not found");
        }
        return article;
    }

    @Override
    public Page<ArticleDTO> getUserArticles(Long userId, int page, int limit, String keyword) {
        Long normalizedUserId = requireUserId(userId);
        Page<ArticleDTO> mpPage = new Page<>(Math.max(1, page), Math.max(1, Math.min(limit, 100)));
        return articleMapper.selectUserArticlesPage(mpPage, normalizedUserId, trimToNull(keyword));
    }

    @Override
    public ArticleDTO getUserArticleById(Long userId, Long id) {
        Long normalizedUserId = requireUserId(userId);
        if (id == null || id <= 0) {
            throw new IllegalArgumentException("Invalid article id");
        }

        ArticleDTO article = articleMapper.selectUserArticleById(id, normalizedUserId);
        if (article == null) {
            throw new IllegalArgumentException("Article not found");
        }
        return article;
    }

    @Override
    public ArticleDTO createUserArticle(Long userId, UserArticleUpsertRequestDTO request, String operatorName, String ipAddress) {
        Long normalizedUserId = requireUserId(userId);
        LocalDateTime now = LocalDateTime.now();

        Article article = new Article();
        article.setTitle(request.getTitle().trim());
        article.setSlug(resolveUniqueSlug(request.getSlug(), request.getTitle(), null));
        article.setSummary(trimToNull(request.getSummary()));
        article.setCoverImage(trimToNull(request.getCoverImage()));
        article.setContentHtml(request.getContentHtml().trim());
        article.setAuthorId(normalizedUserId);
        article.setReviewStatus(ArticleReviewStatus.DRAFT);
        article.setReviewComment(null);
        article.setReviewedAt(null);
        article.setSubmittedAt(null);
        article.setReviewerName(null);
        article.setStatus(ArticleStatus.DRAFT);
        article.setPublishedAt(null);
        article.setCreatedAt(now);
        article.setUpdatedAt(now);

        articleMapper.insert(article);

        String normalizedOperator = normalizeUserOperatorName(operatorName);
        auditUser("USER_ARTICLE_CREATED", normalizedUserId, normalizedOperator, ipAddress, "articleId=" + article.getId());
        return getUserArticleById(normalizedUserId, article.getId());
    }

    @Override
    public ArticleDTO updateUserArticle(
        Long userId,
        Long id,
        UserArticleUpsertRequestDTO request,
        String operatorName,
        String ipAddress
    ) {
        Long normalizedUserId = requireUserId(userId);
        Article article = requireUserOwnedArticle(id, normalizedUserId);
        String currentReviewStatus = normalizeReviewStatus(article.getReviewStatus());
        if (ArticleReviewStatus.PENDING_REVIEW.equals(currentReviewStatus)) {
            throw new IllegalArgumentException("Article under review cannot be edited directly");
        }
        if (!(ArticleReviewStatus.DRAFT.equals(currentReviewStatus) || ArticleReviewStatus.REJECTED.equals(currentReviewStatus))) {
            throw new IllegalArgumentException("Only draft or rejected article can be edited");
        }

        article.setTitle(request.getTitle().trim());
        article.setSlug(resolveUniqueSlug(request.getSlug(), request.getTitle(), id));
        article.setSummary(trimToNull(request.getSummary()));
        article.setCoverImage(trimToNull(request.getCoverImage()));
        article.setContentHtml(request.getContentHtml().trim());
        resetToDraft(article);
        article.setUpdatedAt(LocalDateTime.now());
        articleMapper.updateById(article);

        String normalizedOperator = normalizeUserOperatorName(operatorName);
        auditUser("USER_ARTICLE_UPDATED", normalizedUserId, normalizedOperator, ipAddress, "articleId=" + id);
        return getUserArticleById(normalizedUserId, id);
    }

    @Override
    public ArticleDTO submitUserArticleReview(Long userId, Long id, String operatorName, String ipAddress) {
        Long normalizedUserId = requireUserId(userId);
        Article article = requireUserOwnedArticle(id, normalizedUserId);
        String fromReviewStatus = normalizeReviewStatus(article.getReviewStatus());
        if (!(ArticleReviewStatus.DRAFT.equals(fromReviewStatus) || ArticleReviewStatus.REJECTED.equals(fromReviewStatus))) {
            throw new IllegalArgumentException("Only draft or rejected article can be submitted for review");
        }
        if (ArticleStatus.PUBLISHED.equals(article.getStatus())) {
            throw new IllegalArgumentException("Published article cannot be submitted for review");
        }

        LocalDateTime now = LocalDateTime.now();
        article.setReviewStatus(ArticleReviewStatus.PENDING_REVIEW);
        article.setSubmittedAt(now);
        article.setReviewComment(null);
        article.setReviewedAt(null);
        article.setReviewerName(null);
        article.setUpdatedAt(now);
        articleMapper.updateById(article);

        String normalizedOperator = normalizeUserOperatorName(operatorName);
        writeReviewLog(id, ACTION_SUBMIT_REVIEW, fromReviewStatus, ArticleReviewStatus.PENDING_REVIEW, null, normalizedOperator);
        auditUser("USER_ARTICLE_SUBMIT_REVIEW", normalizedUserId, normalizedOperator, ipAddress, "articleId=" + id);
        return getUserArticleById(normalizedUserId, id);
    }

    private Article requireArticle(Long id) {
        if (id == null || id <= 0) {
            throw new IllegalArgumentException("Invalid article id");
        }
        Article article = articleMapper.selectById(id);
        if (article == null || (article.getDeleted() != null && article.getDeleted() == 1)) {
            throw new IllegalArgumentException("Article not found");
        }
        return article;
    }

    private Article requireUserOwnedArticle(Long id, Long userId) {
        Article article = requireArticle(id);
        if (article.getAuthorId() == null || !article.getAuthorId().equals(userId)) {
            throw new IllegalArgumentException("Article not found");
        }
        return article;
    }

    private Long requireUserId(Long userId) {
        if (userId == null || userId <= 0) {
            throw new IllegalArgumentException("Invalid user id");
        }
        return userId;
    }

    private boolean applyLegacyStatusCompatIfNeeded(Article article, String requestedStatus, String operatorName, LocalDateTime now) {
        if (ArticleStatus.DRAFT.equals(requestedStatus)) {
            resetToDraft(article);
            return false;
        }

        if (articleReviewProperties.isEnforceStrict()) {
            throw new IllegalArgumentException("Direct publish/offline is disabled. Submit for review first");
        }

        article.setReviewStatus(ArticleReviewStatus.APPROVED);
        article.setReviewedAt(now);
        article.setReviewerName(operatorName);
        article.setReviewComment(null);
        article.setSubmittedAt(article.getSubmittedAt() == null ? now : article.getSubmittedAt());
        article.setStatus(requestedStatus);
        article.setPublishedAt(ArticleStatus.PUBLISHED.equals(requestedStatus) ? now : null);
        return true;
    }

    private boolean ensureApprovedForPublish(
        Article article,
        String operatorName,
        String ipAddress,
        LocalDateTime now,
        boolean legacyStatusEndpoint
    ) {
        if (ArticleReviewStatus.APPROVED.equals(normalizeReviewStatus(article.getReviewStatus()))) {
            return false;
        }

        if (articleReviewProperties.isEnforceStrict()) {
            throw new IllegalArgumentException("Article must be approved before publishing/offline");
        }

        article.setReviewStatus(ArticleReviewStatus.APPROVED);
        article.setReviewedAt(now);
        article.setReviewerName(operatorName);
        article.setReviewComment(null);
        article.setSubmittedAt(article.getSubmittedAt() == null ? now : article.getSubmittedAt());
        audit(
            "ARTICLE_DIRECT_PUBLISH_COMPAT",
            operatorName,
            ipAddress,
            "articleId=" + article.getId() + ",legacy=" + legacyStatusEndpoint
        );
        return true;
    }

    private void resetToDraft(Article article) {
        article.setStatus(ArticleStatus.DRAFT);
        article.setPublishedAt(null);
        article.setReviewStatus(ArticleReviewStatus.DRAFT);
        article.setReviewComment(null);
        article.setReviewedAt(null);
        article.setSubmittedAt(null);
        article.setReviewerName(null);
    }

    private ArticleReviewLogDTO toReviewLogDTO(ArticleReviewLog item) {
        return ArticleReviewLogDTO.builder()
            .id(item.getId())
            .articleId(item.getArticleId())
            .action(item.getAction())
            .fromReviewStatus(item.getFromReviewStatus())
            .toReviewStatus(item.getToReviewStatus())
            .comment(item.getComment())
            .reviewerName(item.getReviewerName())
            .createdAt(item.getCreatedAt())
            .build();
    }

    private void writeReviewLog(
        Long articleId,
        String action,
        String fromReviewStatus,
        String toReviewStatus,
        String comment,
        String reviewerName
    ) {
        ArticleReviewLog logItem = new ArticleReviewLog();
        logItem.setArticleId(articleId);
        logItem.setAction(action);
        logItem.setFromReviewStatus(fromReviewStatus);
        logItem.setToReviewStatus(toReviewStatus);
        logItem.setComment(trimToNull(comment));
        logItem.setReviewerName(normalizeOperatorName(reviewerName));
        logItem.setCreatedAt(LocalDateTime.now());

        try {
            articleReviewLogMapper.insert(logItem);
        } catch (Exception exception) {
            log.warn("Failed to persist article review log articleId={}, action={}", articleId, action, exception);
        }
    }

    private void audit(String eventType, String operatorName, String ipAddress, String details) {
        String normalizedOperator = normalizeOperatorName(operatorName);
        String normalizedDetails = "operator=" + normalizedOperator + (details == null || details.isBlank() ? "" : "," + details);
        securityAuditService.log(eventType, "ADMIN", null, null, ipAddress, normalizedDetails);
    }

    private void auditUser(String eventType, Long userId, String operatorName, String ipAddress, String details) {
        String normalizedOperator = normalizeUserOperatorName(operatorName);
        String normalizedDetails = "operator=" + normalizedOperator + (details == null || details.isBlank() ? "" : "," + details);
        securityAuditService.log(eventType, "USER", userId, null, ipAddress, normalizedDetails);
    }

    private String resolveUniqueSlug(String slug, String title, Long currentArticleId) {
        String initial = trimToNull(slug);
        if (initial == null) {
            initial = toSlug(title);
        } else {
            initial = toSlug(initial);
        }

        if (initial.isBlank()) {
            initial = "article";
        }

        String candidate = initial;
        int suffix = 1;
        while (isSlugUsed(candidate, currentArticleId)) {
            candidate = initial + "-" + suffix;
            suffix += 1;
        }
        return candidate;
    }

    private boolean isSlugUsed(String slug, Long currentArticleId) {
        Article existing = articleMapper.selectOne(
            new LambdaQueryWrapper<Article>()
                .eq(Article::getSlug, slug)
                .eq(Article::getDeleted, 0)
        );
        if (existing == null) {
            return false;
        }
        if (currentArticleId == null) {
            return true;
        }
        return !currentArticleId.equals(existing.getId());
    }

    private String toSlug(String input) {
        if (input == null) {
            return "";
        }
        return Normalizer.normalize(input, Normalizer.Form.NFD)
            .replaceAll("[\\p{InCombiningDiacriticalMarks}]", "")
            .toLowerCase(Locale.ROOT)
            .replaceAll("[^a-z0-9]+", "-")
            .replaceAll("^-+|-+$", "");
    }

    private String normalizeStatusAllowNull(String value) {
        String trimmed = trimToNull(value);
        if (trimmed == null) {
            return null;
        }
        return normalizeStatus(trimmed);
    }

    private String normalizeStatus(String value) {
        String normalized = value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
        if (ArticleStatus.DRAFT.equals(normalized) || ArticleStatus.PUBLISHED.equals(normalized) || ArticleStatus.OFFLINE.equals(normalized)) {
            return normalized;
        }
        throw new IllegalArgumentException("status must be DRAFT, PUBLISHED or OFFLINE");
    }

    private String normalizeReviewStatus(String value) {
        String normalized = value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
        if (normalized.isBlank()) {
            return ArticleReviewStatus.DRAFT;
        }
        if (ArticleReviewStatus.DRAFT.equals(normalized)
            || ArticleReviewStatus.PENDING_REVIEW.equals(normalized)
            || ArticleReviewStatus.APPROVED.equals(normalized)
            || ArticleReviewStatus.REJECTED.equals(normalized)) {
            return normalized;
        }
        throw new IllegalArgumentException("Unsupported review status: " + normalized);
    }

    private String normalizeReviewAction(String value) {
        String normalized = value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
        if (ArticleReviewAction.APPROVE.equals(normalized) || ArticleReviewAction.REJECT.equals(normalized)) {
            return normalized;
        }
        throw new IllegalArgumentException("action must be APPROVE or REJECT");
    }

    private String normalizeOperatorName(String value) {
        String normalized = trimToNull(value);
        return normalized == null ? "UNKNOWN_ADMIN" : normalized;
    }

    private String normalizeUserOperatorName(String value) {
        String normalized = trimToNull(value);
        return normalized == null ? "UNKNOWN_USER" : normalized;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}

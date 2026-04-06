package com.terraria.skills.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.ArticleDTO;
import com.terraria.skills.dto.ArticleReviewLogDTO;
import com.terraria.skills.dto.ArticleUpsertRequestDTO;
import com.terraria.skills.dto.UserArticleUpsertRequestDTO;

public interface ArticleService {

    Page<ArticleDTO> getAdminArticles(int page, int limit, String keyword, String status);

    ArticleDTO getAdminArticleById(Long id);

    ArticleDTO createArticle(ArticleUpsertRequestDTO request, String operatorName, String ipAddress);

    ArticleDTO updateArticle(Long id, ArticleUpsertRequestDTO request, String operatorName, String ipAddress);

    ArticleDTO updateStatus(Long id, String status, String operatorName, String ipAddress);

    ArticleDTO submitReview(Long id, String operatorName, String ipAddress);

    ArticleDTO reviewArticle(Long id, String action, String comment, String operatorName, String ipAddress);

    ArticleDTO publishArticle(Long id, String operatorName, String ipAddress);

    ArticleDTO offlineArticle(Long id, String operatorName, String ipAddress);

    Page<ArticleReviewLogDTO> getReviewLogs(Long articleId, int page, int limit);

    Page<ArticleDTO> getPublishedArticles(int page, int limit, String keyword);

    ArticleDTO getPublishedArticleById(Long id);

    ArticleDTO getPublishedArticleBySlug(String slug);

    Page<ArticleDTO> getUserArticles(Long userId, int page, int limit, String keyword);

    ArticleDTO getUserArticleById(Long userId, Long id);

    ArticleDTO createUserArticle(Long userId, UserArticleUpsertRequestDTO request, String operatorName, String ipAddress);

    ArticleDTO updateUserArticle(Long userId, Long id, UserArticleUpsertRequestDTO request, String operatorName, String ipAddress);

    ArticleDTO submitUserArticleReview(Long userId, Long id, String operatorName, String ipAddress);
}

package com.terraria.skills.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.ArticleCommentDTO;

public interface ArticleCommentService {

    Page<ArticleCommentDTO> getPublishedArticleComments(Long articleId, Long currentUserId, int page, int limit);

    Page<ArticleCommentDTO> getPublishedArticleReplies(Long articleId, Long rootCommentId, Long currentUserId, int page, int limit);

    ArticleCommentDTO createComment(Long userId, Long articleId, String content, String ipAddress);

    ArticleCommentDTO createReply(Long userId, Long articleId, Long rootCommentId, Long replyToCommentId, String content, String ipAddress);

    ArticleCommentDTO deleteOwnComment(Long userId, Long articleId, Long commentId, String ipAddress);

    ArticleCommentDTO likeComment(Long userId, Long articleId, Long commentId, String ipAddress);

    ArticleCommentDTO unlikeComment(Long userId, Long articleId, Long commentId, String ipAddress);
}

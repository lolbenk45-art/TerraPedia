package com.terraria.skills.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.AdminArticleCommentDTO;

public interface AdminArticleCommentService {

    Page<AdminArticleCommentDTO> getArticleComments(Long articleId, int page, int limit, String status, String keyword, Long authorId);

    Page<AdminArticleCommentDTO> getArticleCommentReplies(Long articleId, Long rootCommentId, int page, int limit, String status);

    AdminArticleCommentDTO updateCommentStatus(Long articleId, Long commentId, String status, String reason, String operator, String ipAddress);
}

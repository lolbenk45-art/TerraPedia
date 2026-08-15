package com.terraria.skills.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.terraria.skills.dto.AdminArticleCommentDTO;
import com.terraria.skills.dto.ArticleCommentDTO;
import com.terraria.skills.entity.ArticleComment;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface ArticleCommentMapper extends BaseMapper<ArticleComment> {

    long countPublishedArticleComments(@Param("articleId") Long articleId);

    List<ArticleCommentDTO> selectPublishedArticleCommentsPage(
        @Param("articleId") Long articleId,
        @Param("currentUserId") Long currentUserId,
        @Param("limit") long limit,
        @Param("offset") long offset
    );

    long countPublishedArticleReplies(
        @Param("articleId") Long articleId,
        @Param("rootCommentId") Long rootCommentId
    );

    List<ArticleCommentDTO> selectPublishedArticleRepliesPage(
        @Param("articleId") Long articleId,
        @Param("rootCommentId") Long rootCommentId,
        @Param("currentUserId") Long currentUserId,
        @Param("limit") long limit,
        @Param("offset") long offset
    );

    ArticleCommentDTO selectCommentById(@Param("id") Long id);

    ArticleCommentDTO selectCommentByArticleAndId(
        @Param("articleId") Long articleId,
        @Param("id") Long id
    );

    int updateRootId(
        @Param("id") Long id,
        @Param("articleId") Long articleId,
        @Param("rootId") Long rootId
    );

    int softDeleteOwnComment(
        @Param("id") Long id,
        @Param("articleId") Long articleId,
        @Param("authorId") Long authorId
    );

    int incrementReplyCount(
        @Param("articleId") Long articleId,
        @Param("id") Long id
    );

    int decrementReplyCount(
        @Param("articleId") Long articleId,
        @Param("id") Long id
    );

    int insertLikeIgnore(
        @Param("commentId") Long commentId,
        @Param("articleId") Long articleId,
        @Param("userId") Long userId
    );

    int reactivateLike(
        @Param("commentId") Long commentId,
        @Param("articleId") Long articleId,
        @Param("userId") Long userId
    );

    int deactivateLike(
        @Param("commentId") Long commentId,
        @Param("articleId") Long articleId,
        @Param("userId") Long userId
    );

    int incrementLikeCount(
        @Param("articleId") Long articleId,
        @Param("id") Long id
    );

    int decrementLikeCount(
        @Param("articleId") Long articleId,
        @Param("id") Long id
    );

    long countAdminArticleComments(
        @Param("articleId") Long articleId,
        @Param("status") String status,
        @Param("keyword") String keyword,
        @Param("authorId") Long authorId
    );

    List<AdminArticleCommentDTO> selectAdminArticleCommentsPage(
        @Param("articleId") Long articleId,
        @Param("status") String status,
        @Param("keyword") String keyword,
        @Param("authorId") Long authorId,
        @Param("sortBy") String sortBy,
        @Param("sortOrder") String sortOrder,
        @Param("limit") long limit,
        @Param("offset") long offset
    );

    long countAdminArticleCommentReplies(
        @Param("articleId") Long articleId,
        @Param("rootCommentId") Long rootCommentId,
        @Param("status") String status
    );

    List<AdminArticleCommentDTO> selectAdminArticleCommentRepliesPage(
        @Param("articleId") Long articleId,
        @Param("rootCommentId") Long rootCommentId,
        @Param("status") String status,
        @Param("limit") long limit,
        @Param("offset") long offset
    );

    AdminArticleCommentDTO selectAdminCommentByArticleAndId(
        @Param("articleId") Long articleId,
        @Param("id") Long id
    );

    int updateAdminCommentStatus(
        @Param("articleId") Long articleId,
        @Param("id") Long id,
        @Param("status") String status,
        @Param("reason") String reason,
        @Param("operator") String operator
    );
}

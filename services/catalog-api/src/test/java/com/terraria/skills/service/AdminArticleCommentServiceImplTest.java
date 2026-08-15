package com.terraria.skills.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.AdminArticleCommentDTO;
import com.terraria.skills.entity.Article;
import com.terraria.skills.mapper.ArticleCommentMapper;
import com.terraria.skills.mapper.ArticleMapper;
import com.terraria.skills.service.impl.AdminArticleCommentServiceImpl;
import com.terraria.skills.service.impl.UserAvatarUrlResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminArticleCommentServiceImplTest {

    private ArticleCommentMapper articleCommentMapper;
    private ArticleMapper articleMapper;
    private SecurityAuditService securityAuditService;
    private UserAvatarUrlResolver userAvatarUrlResolver;
    private AdminArticleCommentServiceImpl service;

    @BeforeEach
    void setUp() {
        articleCommentMapper = mock(ArticleCommentMapper.class);
        articleMapper = mock(ArticleMapper.class);
        securityAuditService = mock(SecurityAuditService.class);
        userAvatarUrlResolver = mock(UserAvatarUrlResolver.class);
        when(userAvatarUrlResolver.resolveProfileAvatarUrl(any(), any())).thenAnswer(invocation -> invocation.getArgument(0));
        service = new AdminArticleCommentServiceImpl(articleCommentMapper, articleMapper, securityAuditService, userAvatarUrlResolver);
    }

    @Test
    void shouldListArticleCommentsWithoutRequiringPublishedArticle() {
        Article offlineArticle = article();
        offlineArticle.setStatus("OFFLINE");
        when(articleMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(offlineArticle);
        when(articleCommentMapper.countAdminArticleComments(77L, "PUBLISHED", "guide", 42L)).thenReturn(1L);
        when(articleCommentMapper.selectAdminArticleCommentsPage(77L, "PUBLISHED", "guide", 42L, "replyCount", "desc", 20L, 0L))
            .thenReturn(List.of(comment(9L, "PUBLISHED")));

        Page<AdminArticleCommentDTO> page = service.getArticleComments(77L, 1, 20, "published", "guide", 42L, "replyCount", "desc");

        assertEquals(1L, page.getTotal());
        assertEquals(9L, page.getRecords().get(0).getId());
        verify(articleCommentMapper).selectAdminArticleCommentsPage(77L, "PUBLISHED", "guide", 42L, "replyCount", "desc", 20L, 0L);
    }

    @Test
    void shouldFallbackToCreatedAtDescForInvalidSortValues() {
        when(articleMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(article());
        when(articleCommentMapper.countAdminArticleComments(77L, null, null, null)).thenReturn(1L);
        when(articleCommentMapper.selectAdminArticleCommentsPage(77L, null, null, null, "createdAt", "desc", 20L, 0L))
            .thenReturn(List.of(comment(9L, "PUBLISHED")));

        Page<AdminArticleCommentDTO> page = service.getArticleComments(77L, 1, 20, null, null, null, "deletedReason", "sideways");

        assertEquals(1L, page.getTotal());
        verify(articleCommentMapper).selectAdminArticleCommentsPage(77L, null, null, null, "createdAt", "desc", 20L, 0L);
    }

    @Test
    void shouldRejectMissingArticleBeforeListingComments() {
        when(articleMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);

        assertThrows(IllegalArgumentException.class, () ->
            service.getArticleComments(77L, 1, 20, null, null, null, null, null)
        );

        verify(articleCommentMapper, never()).countAdminArticleComments(any(), any(), any(), any());
    }

    @Test
    void shouldRejectStatusUpdateWhenCommentDoesNotBelongToArticle() {
        when(articleMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(article());
        when(articleCommentMapper.selectAdminCommentByArticleAndId(77L, 9L)).thenReturn(null);

        assertThrows(IllegalArgumentException.class, () ->
            service.updateCommentStatus(77L, 9L, "HIDDEN", "spam", "admin", "127.0.0.1")
        );

        verify(articleCommentMapper, never()).updateAdminCommentStatus(any(), any(), any(), any(), any());
    }

    @Test
    void shouldHideCommentWithAdminMetadataAndAudit() {
        when(articleMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(article());
        when(articleCommentMapper.selectAdminCommentByArticleAndId(77L, 9L))
            .thenReturn(comment(9L, "PUBLISHED"))
            .thenReturn(hiddenComment());

        AdminArticleCommentDTO result = service.updateCommentStatus(77L, 9L, "HIDDEN", "spam", "admin", "127.0.0.1");

        assertEquals("HIDDEN", result.getStatus());
        verify(articleCommentMapper).updateAdminCommentStatus(77L, 9L, "HIDDEN", "spam", "admin");
        verify(securityAuditService).log(
            eq("ADMIN_ARTICLE_COMMENT_HIDDEN"),
            eq("ADMIN"),
            isNull(),
            isNull(),
            eq("127.0.0.1"),
            contains("articleId=77,commentId=9,operator=admin,reason=spam")
        );
    }

    @Test
    void shouldRejectHideWithoutReason() {
        when(articleMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(article());
        when(articleCommentMapper.selectAdminCommentByArticleAndId(77L, 9L)).thenReturn(comment(9L, "PUBLISHED"));

        assertThrows(IllegalArgumentException.class, () ->
            service.updateCommentStatus(77L, 9L, "HIDDEN", " ", "admin", "127.0.0.1")
        );

        verify(articleCommentMapper, never()).updateAdminCommentStatus(any(), any(), any(), any(), any());
    }

    @Test
    void shouldRestoreOnlyAdminDeletedComment() {
        when(articleMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(article());
        AdminArticleCommentDTO hidden = hiddenComment();
        when(articleCommentMapper.selectAdminCommentByArticleAndId(77L, 9L))
            .thenReturn(hidden)
            .thenReturn(comment(9L, "PUBLISHED"));

        AdminArticleCommentDTO result = service.updateCommentStatus(77L, 9L, "PUBLISHED", null, "admin", "127.0.0.1");

        assertEquals("PUBLISHED", result.getStatus());
        verify(articleCommentMapper).updateAdminCommentStatus(77L, 9L, "PUBLISHED", null, "admin");
        verify(securityAuditService).log(eq("ADMIN_ARTICLE_COMMENT_RESTORED"), eq("ADMIN"), isNull(), isNull(), eq("127.0.0.1"), contains("articleId=77,commentId=9"));
    }

    @Test
    void shouldRejectRestoringUserDeletedComment() {
        when(articleMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(article());
        AdminArticleCommentDTO deleted = comment(9L, "DELETED");
        deleted.setDeleted(true);
        deleted.setDeletedByType("USER");
        when(articleCommentMapper.selectAdminCommentByArticleAndId(77L, 9L)).thenReturn(deleted);

        assertThrows(IllegalArgumentException.class, () ->
            service.updateCommentStatus(77L, 9L, "PUBLISHED", null, "admin", "127.0.0.1")
        );

        verify(articleCommentMapper, never()).updateAdminCommentStatus(any(), any(), any(), any(), any());
    }

    private Article article() {
        Article article = new Article();
        article.setId(77L);
        article.setStatus("PUBLISHED");
        article.setDeleted(0);
        return article;
    }

    private AdminArticleCommentDTO comment(Long id, String status) {
        AdminArticleCommentDTO comment = new AdminArticleCommentDTO();
        comment.setId(id);
        comment.setArticleId(77L);
        comment.setRootId(id);
        comment.setAuthorId(42L);
        comment.setAuthorDisplayName("Guide Reader");
        comment.setContent("评论内容");
        comment.setStatus(status);
        comment.setDeleted(!"PUBLISHED".equals(status));
        comment.setLikeCount(0);
        comment.setReplyCount(0);
        return comment;
    }

    private AdminArticleCommentDTO hiddenComment() {
        AdminArticleCommentDTO comment = comment(9L, "HIDDEN");
        comment.setDeleted(true);
        comment.setDeletedByType("ADMIN");
        comment.setDeletedByName("admin");
        comment.setDeletedReason("spam");
        return comment;
    }
}

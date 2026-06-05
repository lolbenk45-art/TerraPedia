package com.terraria.skills.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.terraria.skills.dto.ArticleCommentDTO;
import com.terraria.skills.entity.Article;
import com.terraria.skills.entity.ArticleComment;
import com.terraria.skills.mapper.ArticleCommentMapper;
import com.terraria.skills.mapper.ArticleMapper;
import com.terraria.skills.service.impl.ArticleCommentServiceImpl;
import com.terraria.skills.service.impl.UserAvatarUrlResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ArticleCommentServiceImplTest {

    private ArticleCommentMapper articleCommentMapper;
    private ArticleMapper articleMapper;
    private SecurityAuditService securityAuditService;
    private UserNotificationService userNotificationService;
    private UserAvatarUrlResolver userAvatarUrlResolver;
    private ArticleCommentServiceImpl service;

    @BeforeEach
    void setUp() {
        articleCommentMapper = mock(ArticleCommentMapper.class);
        articleMapper = mock(ArticleMapper.class);
        securityAuditService = mock(SecurityAuditService.class);
        userNotificationService = mock(UserNotificationService.class);
        userAvatarUrlResolver = mock(UserAvatarUrlResolver.class);
        when(userAvatarUrlResolver.resolveProfileAvatarUrl(any(), any())).thenAnswer(invocation -> invocation.getArgument(0));
        service = new ArticleCommentServiceImpl(articleCommentMapper, articleMapper, securityAuditService, userNotificationService, userAvatarUrlResolver);
    }

    @Test
    void shouldCreateRootCommentAndPersistRootIdAfterGeneratedId() {
        when(articleMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(publishedArticle());
        when(articleCommentMapper.insert(any(ArticleComment.class))).thenAnswer(invocation -> {
            ArticleComment comment = invocation.getArgument(0);
            comment.setId(9L);
            return 1;
        });
        when(articleCommentMapper.selectCommentByArticleAndId(77L, 9L)).thenReturn(rootComment(9L));

        ArticleCommentDTO created = service.createComment(42L, 77L, "主评论", "127.0.0.1");

        assertEquals(9L, created.getId());
        ArgumentCaptor<ArticleComment> captor = ArgumentCaptor.forClass(ArticleComment.class);
        verify(articleCommentMapper).insert(captor.capture());
        assertEquals(77L, captor.getValue().getArticleId());
        assertEquals(42L, captor.getValue().getAuthorId());
        assertEquals("PUBLISHED", captor.getValue().getStatus());
        verify(articleCommentMapper).updateRootId(9L, 77L, 9L);
        verify(securityAuditService).log(eq("ARTICLE_COMMENT_CREATED"), eq("USER"), eq(42L), eq(null), eq("127.0.0.1"), eq("articleId=77,commentId=9"));
    }

    @Test
    void shouldNotifyArticleAuthorWhenOtherUserCreatesRootComment() {
        Article article = publishedArticle();
        article.setAuthorId(7L);
        article.setTitle("真永夜教程");
        article.setSlug("true-night-guide");
        when(articleMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(article);
        when(articleCommentMapper.insert(any(ArticleComment.class))).thenAnswer(invocation -> {
            ArticleComment comment = invocation.getArgument(0);
            comment.setId(9L);
            return 1;
        });
        when(articleCommentMapper.selectCommentByArticleAndId(77L, 9L)).thenReturn(rootComment(9L));

        service.createComment(42L, 77L, "主评论", "127.0.0.1");

        verify(userNotificationService).createNotification(
            eq(7L),
            eq("ARTICLE_COMMENTED"),
            eq("文章收到新评论"),
            eq("你的文章《真永夜教程》收到一条新评论。"),
            eq("/articles/true-night-guide#article-comments")
        );
    }

    @Test
    void shouldNotNotifyArticleAuthorForOwnRootComment() {
        Article article = publishedArticle();
        article.setAuthorId(42L);
        article.setTitle("真永夜教程");
        article.setSlug("true-night-guide");
        when(articleMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(article);
        when(articleCommentMapper.insert(any(ArticleComment.class))).thenAnswer(invocation -> {
            ArticleComment comment = invocation.getArgument(0);
            comment.setId(9L);
            return 1;
        });
        when(articleCommentMapper.selectCommentByArticleAndId(77L, 9L)).thenReturn(rootComment(9L));

        service.createComment(42L, 77L, "主评论", "127.0.0.1");

        verify(userNotificationService, never()).createNotification(any(), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void shouldCreateReplyUnderRootAndTrackReplyTargetUser() {
        when(articleMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(publishedArticle());
        when(articleCommentMapper.selectCommentByArticleAndId(77L, 9L)).thenReturn(rootComment(9L));
        when(articleCommentMapper.insert(any(ArticleComment.class))).thenAnswer(invocation -> {
            ArticleComment comment = invocation.getArgument(0);
            comment.setId(12L);
            return 1;
        });
        ArticleCommentDTO reply = rootComment(12L);
        reply.setParentId(9L);
        reply.setRootId(9L);
        reply.setReplyToUserId(42L);
        when(articleCommentMapper.selectCommentByArticleAndId(77L, 12L)).thenReturn(reply);

        ArticleCommentDTO created = service.createReply(88L, 77L, 9L, 9L, "回复内容", "127.0.0.1");

        assertEquals(12L, created.getId());
        ArgumentCaptor<ArticleComment> captor = ArgumentCaptor.forClass(ArticleComment.class);
        verify(articleCommentMapper).insert(captor.capture());
        assertEquals(9L, captor.getValue().getParentId());
        assertEquals(9L, captor.getValue().getRootId());
        assertEquals(42L, captor.getValue().getReplyToUserId());
        verify(articleCommentMapper).incrementReplyCount(77L, 9L);
    }

    @Test
    void shouldNotifyArticleAuthorAndReplyTargetWhenOtherUserCreatesReply() {
        Article article = publishedArticle();
        article.setAuthorId(7L);
        article.setTitle("真永夜教程");
        article.setSlug("true-night-guide");
        when(articleMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(article);
        ArticleCommentDTO root = rootComment(9L);
        root.setAuthorId(42L);
        when(articleCommentMapper.selectCommentByArticleAndId(77L, 9L)).thenReturn(root);
        when(articleCommentMapper.insert(any(ArticleComment.class))).thenAnswer(invocation -> {
            ArticleComment comment = invocation.getArgument(0);
            comment.setId(12L);
            return 1;
        });
        ArticleCommentDTO reply = rootComment(12L);
        reply.setAuthorId(88L);
        reply.setParentId(9L);
        reply.setRootId(9L);
        reply.setReplyToUserId(42L);
        when(articleCommentMapper.selectCommentByArticleAndId(77L, 12L)).thenReturn(reply);

        service.createReply(88L, 77L, 9L, 9L, "回复内容", "127.0.0.1");

        verify(userNotificationService).createNotification(
            eq(7L),
            eq("ARTICLE_COMMENT_REPLIED"),
            eq("文章收到新回复"),
            eq("你的文章《真永夜教程》收到一条新回复。"),
            eq("/articles/true-night-guide#article-comments")
        );
        verify(userNotificationService).createNotification(
            eq(42L),
            eq("ARTICLE_COMMENT_REPLIED_TO_YOU"),
            eq("评论收到回复"),
            eq("你在《真永夜教程》下的评论收到一条回复。"),
            eq("/articles/true-night-guide#article-comments")
        );
    }

    @Test
    void shouldDedupeReplyNotificationRecipientsAndSkipActor() {
        Article article = publishedArticle();
        article.setAuthorId(42L);
        article.setTitle("真永夜教程");
        article.setSlug("true-night-guide");
        when(articleMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(article);
        ArticleCommentDTO root = rootComment(9L);
        root.setAuthorId(42L);
        when(articleCommentMapper.selectCommentByArticleAndId(77L, 9L)).thenReturn(root);
        when(articleCommentMapper.insert(any(ArticleComment.class))).thenAnswer(invocation -> {
            ArticleComment comment = invocation.getArgument(0);
            comment.setId(12L);
            return 1;
        });
        ArticleCommentDTO reply = rootComment(12L);
        reply.setAuthorId(88L);
        reply.setParentId(9L);
        reply.setRootId(9L);
        reply.setReplyToUserId(42L);
        when(articleCommentMapper.selectCommentByArticleAndId(77L, 12L)).thenReturn(reply);

        service.createReply(88L, 77L, 9L, 9L, "回复内容", "127.0.0.1");

        verify(userNotificationService).createNotification(
            eq(42L),
            eq("ARTICLE_COMMENT_REPLIED"),
            eq("文章收到新回复"),
            eq("你的文章《真永夜教程》收到一条新回复。"),
            eq("/articles/true-night-guide#article-comments")
        );
    }

    @Test
    void shouldRejectReplyTargetFromDifferentRoot() {
        when(articleMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(publishedArticle());
        ArticleCommentDTO root = rootComment(9L);
        ArticleCommentDTO otherReply = rootComment(13L);
        otherReply.setParentId(11L);
        otherReply.setRootId(11L);
        when(articleCommentMapper.selectCommentByArticleAndId(77L, 9L)).thenReturn(root);
        when(articleCommentMapper.selectCommentByArticleAndId(77L, 13L)).thenReturn(otherReply);

        assertThrows(IllegalArgumentException.class, () ->
            service.createReply(88L, 77L, 9L, 13L, "bad", "127.0.0.1")
        );

        verify(articleCommentMapper, never()).insert(any(ArticleComment.class));
    }

    @Test
    void shouldRejectHiddenCommentForReplyAndLike() {
        when(articleMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(publishedArticle());
        ArticleCommentDTO hidden = rootComment(9L);
        hidden.setStatus("HIDDEN");
        hidden.setDeleted(true);
        when(articleCommentMapper.selectCommentByArticleAndId(77L, 9L)).thenReturn(hidden);

        assertThrows(IllegalArgumentException.class, () ->
            service.createReply(88L, 77L, 9L, 9L, "bad", "127.0.0.1")
        );
        assertThrows(IllegalArgumentException.class, () ->
            service.likeComment(88L, 77L, 9L, "127.0.0.1")
        );

        verify(articleCommentMapper, never()).insertLikeIgnore(any(), any(), any());
    }

    @Test
    void shouldIncrementLikeCountOnlyWhenLikeStateChanges() {
        when(articleMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(publishedArticle());
        ArticleCommentDTO comment = rootComment(9L);
        comment.setLikeCount(1);
        when(articleCommentMapper.selectCommentByArticleAndId(77L, 9L)).thenReturn(rootComment(9L)).thenReturn(comment);
        when(articleCommentMapper.insertLikeIgnore(9L, 77L, 42L)).thenReturn(1);

        ArticleCommentDTO liked = service.likeComment(42L, 77L, 9L, "127.0.0.1");

        assertTrue(liked.getLikedByCurrentUser());
        verify(articleCommentMapper).incrementLikeCount(77L, 9L);
        verify(articleCommentMapper, never()).reactivateLike(9L, 77L, 42L);
    }

    @Test
    void shouldNotIncrementLikeCountWhenAlreadyLiked() {
        when(articleMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(publishedArticle());
        ArticleCommentDTO comment = rootComment(9L);
        comment.setLikeCount(1);
        when(articleCommentMapper.selectCommentByArticleAndId(77L, 9L)).thenReturn(rootComment(9L)).thenReturn(comment);
        when(articleCommentMapper.insertLikeIgnore(9L, 77L, 42L)).thenReturn(0);
        when(articleCommentMapper.reactivateLike(9L, 77L, 42L)).thenReturn(0);

        ArticleCommentDTO liked = service.likeComment(42L, 77L, 9L, "127.0.0.1");

        assertTrue(liked.getLikedByCurrentUser());
        verify(articleCommentMapper, never()).incrementLikeCount(77L, 9L);
    }

    @Test
    void shouldDecrementLikeCountOnlyWhenUnlikeStateChanges() {
        when(articleMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(publishedArticle());
        ArticleCommentDTO comment = rootComment(9L);
        comment.setLikeCount(0);
        when(articleCommentMapper.selectCommentByArticleAndId(77L, 9L)).thenReturn(comment);
        when(articleCommentMapper.deactivateLike(9L, 77L, 42L)).thenReturn(1);

        ArticleCommentDTO unliked = service.unlikeComment(42L, 77L, 9L, "127.0.0.1");

        assertFalse(unliked.getLikedByCurrentUser());
        verify(articleCommentMapper).decrementLikeCount(77L, 9L);
    }

    @Test
    void shouldDeleteOwnReplyAndDecrementRootReplyCount() {
        when(articleMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(publishedArticle());
        ArticleCommentDTO reply = rootComment(12L);
        reply.setAuthorId(42L);
        reply.setParentId(9L);
        reply.setRootId(9L);
        ArticleCommentDTO deleted = rootComment(12L);
        deleted.setAuthorId(42L);
        deleted.setParentId(9L);
        deleted.setRootId(9L);
        deleted.setDeleted(true);
        deleted.setStatus("DELETED");
        when(articleCommentMapper.selectCommentByArticleAndId(77L, 12L)).thenReturn(reply).thenReturn(deleted);

        ArticleCommentDTO result = service.deleteOwnComment(42L, 77L, 12L, "127.0.0.1");

        assertTrue(result.getDeleted());
        verify(articleCommentMapper).softDeleteOwnComment(12L, 77L, 42L);
        verify(articleCommentMapper).decrementReplyCount(77L, 9L);
    }

    private Article publishedArticle() {
        Article article = new Article();
        article.setId(77L);
        article.setTitle("测试文章");
        article.setSlug("test-article");
        article.setAuthorId(7L);
        article.setStatus("PUBLISHED");
        article.setDeleted(0);
        return article;
    }

    private ArticleCommentDTO rootComment(Long id) {
        ArticleCommentDTO comment = new ArticleCommentDTO();
        comment.setId(id);
        comment.setArticleId(77L);
        comment.setRootId(id);
        comment.setParentId(null);
        comment.setAuthorId(42L);
        comment.setAuthorDisplayName("Guide Reader");
        comment.setAuthorAvatarUrl("/avatar.png");
        comment.setContent("评论");
        comment.setStatus("PUBLISHED");
        comment.setDeleted(false);
        comment.setLikeCount(0);
        comment.setLikedByCurrentUser(false);
        comment.setReplyCount(0);
        return comment;
    }
}

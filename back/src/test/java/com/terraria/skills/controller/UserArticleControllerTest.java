package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.auth.UserAuthenticationInterceptor;
import com.terraria.skills.auth.UserTokenClaims;
import com.terraria.skills.config.ArticleReviewProperties;
import com.terraria.skills.dto.ArticleDTO;
import com.terraria.skills.dto.ArticleReviewStatus;
import com.terraria.skills.dto.ArticleStatus;
import com.terraria.skills.dto.UserArticleUpsertRequestDTO;
import com.terraria.skills.entity.Article;
import com.terraria.skills.mapper.ArticleMapper;
import com.terraria.skills.mapper.ArticleReviewLogMapper;
import com.terraria.skills.service.ArticleService;
import com.terraria.skills.service.SecurityAuditService;
import com.terraria.skills.service.UserNotificationService;
import com.terraria.skills.service.impl.ArticleServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class UserArticleControllerTest {

    private static final Long CURRENT_USER_ID = 42L;
    private static final Long OTHER_USER_ID = 99L;
    private static final Long ARTICLE_ID = 77L;

    @Nested
    class ControllerRoutes {

        private final ArticleService articleService = mock(ArticleService.class);
        private MockMvc mockMvc;

        @BeforeEach
        void setUp() {
            mockMvc = MockMvcBuilders.standaloneSetup(new UserArticleController(articleService))
                .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
                .build();
        }

        @Test
        void shouldDeleteArticleForCurrentClaimsUserOnly() throws Exception {
            ArticleDTO article = articleDto(ARTICLE_ID, CURRENT_USER_ID, ArticleStatus.DRAFT, ArticleReviewStatus.DRAFT);
            when(articleService.deleteUserArticle(eq(CURRENT_USER_ID), eq(ARTICLE_ID))).thenReturn(article);

            mockMvc.perform(delete("/user/articles/{id}", ARTICLE_ID)
                    .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, claims(CURRENT_USER_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(ARTICLE_ID))
                .andExpect(jsonPath("$.data.reviewStatus").value(ArticleReviewStatus.DRAFT));

            ArgumentCaptor<Long> userIdCaptor = ArgumentCaptor.forClass(Long.class);
            verify(articleService).deleteUserArticle(userIdCaptor.capture(), eq(ARTICLE_ID));
            assertEquals(CURRENT_USER_ID, userIdCaptor.getValue());
        }

        @Test
        void shouldWithdrawArticleForCurrentClaimsUserOnly() throws Exception {
            ArticleDTO article = articleDto(ARTICLE_ID, CURRENT_USER_ID, ArticleStatus.DRAFT, ArticleReviewStatus.DRAFT);
            when(articleService.withdrawUserArticle(eq(CURRENT_USER_ID), eq(ARTICLE_ID))).thenReturn(article);

            mockMvc.perform(post("/user/articles/{id}/withdraw", ARTICLE_ID)
                    .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, claims(CURRENT_USER_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(ARTICLE_ID))
                .andExpect(jsonPath("$.data.reviewStatus").value(ArticleReviewStatus.DRAFT));

            ArgumentCaptor<Long> userIdCaptor = ArgumentCaptor.forClass(Long.class);
            verify(articleService).withdrawUserArticle(userIdCaptor.capture(), eq(ARTICLE_ID));
            assertEquals(CURRENT_USER_ID, userIdCaptor.getValue());
        }

        @Test
        void shouldOfflinePublishedArticleForCurrentClaimsUserOnly() throws Exception {
            ArticleDTO article = articleDto(ARTICLE_ID, CURRENT_USER_ID, ArticleStatus.OFFLINE, ArticleReviewStatus.APPROVED);
            when(articleService.offlineUserArticle(eq(CURRENT_USER_ID), eq(ARTICLE_ID))).thenReturn(article);

            mockMvc.perform(post("/user/articles/{id}/offline", ARTICLE_ID)
                    .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, claims(CURRENT_USER_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(ARTICLE_ID))
                .andExpect(jsonPath("$.data.status").value(ArticleStatus.OFFLINE))
                .andExpect(jsonPath("$.data.reviewStatus").value(ArticleReviewStatus.APPROVED));

            ArgumentCaptor<Long> userIdCaptor = ArgumentCaptor.forClass(Long.class);
            verify(articleService).offlineUserArticle(userIdCaptor.capture(), eq(ARTICLE_ID));
            assertEquals(CURRENT_USER_ID, userIdCaptor.getValue());
        }
    }

    @Nested
    class ServiceRules {

        private ArticleMapper articleMapper;
        private ArticleReviewLogMapper articleReviewLogMapper;
        private SecurityAuditService securityAuditService;
        private UserNotificationService userNotificationService;
        private ArticleServiceImpl articleService;

        @BeforeEach
        void setUp() {
            articleMapper = mock(ArticleMapper.class);
            articleReviewLogMapper = mock(ArticleReviewLogMapper.class);
            securityAuditService = mock(SecurityAuditService.class);
            userNotificationService = mock(UserNotificationService.class);
            articleService = new ArticleServiceImpl(
                articleMapper,
                articleReviewLogMapper,
                securityAuditService,
                new ArticleReviewProperties(),
                userNotificationService
            );
        }

        @Test
        void shouldSoftDeleteOwnerDraftArticle() {
            Article article = article(ARTICLE_ID, CURRENT_USER_ID, ArticleStatus.DRAFT, ArticleReviewStatus.DRAFT);
            when(articleMapper.selectById(ARTICLE_ID)).thenReturn(article);
            when(articleMapper.selectUserArticleById(ARTICLE_ID, CURRENT_USER_ID))
                .thenReturn(articleDto(ARTICLE_ID, CURRENT_USER_ID, ArticleStatus.DRAFT, ArticleReviewStatus.DRAFT));

            ArticleDTO result = articleService.deleteUserArticle(CURRENT_USER_ID, ARTICLE_ID);

            assertEquals(ARTICLE_ID, result.getId());
            assertEquals(1, article.getDeleted());
            assertNotNull(article.getUpdatedAt());
            verify(articleMapper).updateById(article);
            verify(securityAuditService).log(eq("USER_ARTICLE_DELETED"), eq("USER"), eq(CURRENT_USER_ID), isNull(), isNull(), anyString());
        }

        @Test
        void shouldSoftDeleteOwnerRejectedArticle() {
            Article article = article(ARTICLE_ID, CURRENT_USER_ID, ArticleStatus.DRAFT, ArticleReviewStatus.REJECTED);
            when(articleMapper.selectById(ARTICLE_ID)).thenReturn(article);
            when(articleMapper.selectUserArticleById(ARTICLE_ID, CURRENT_USER_ID))
                .thenReturn(articleDto(ARTICLE_ID, CURRENT_USER_ID, ArticleStatus.DRAFT, ArticleReviewStatus.REJECTED));

            ArticleDTO result = articleService.deleteUserArticle(CURRENT_USER_ID, ARTICLE_ID);

            assertEquals(ARTICLE_ID, result.getId());
            assertEquals(1, article.getDeleted());
            verify(articleMapper).updateById(article);
        }

        @Test
        void shouldRejectDeleteForPendingReviewAndPublishedArticles() {
            assertDeleteRejected(article(ARTICLE_ID, CURRENT_USER_ID, ArticleStatus.DRAFT, ArticleReviewStatus.PENDING_REVIEW));
            assertDeleteRejected(article(ARTICLE_ID, CURRENT_USER_ID, ArticleStatus.PUBLISHED, ArticleReviewStatus.APPROVED));
        }

        @Test
        void shouldSoftDeleteOwnerOfflineArticle() {
            Article article = article(ARTICLE_ID, CURRENT_USER_ID, ArticleStatus.OFFLINE, ArticleReviewStatus.APPROVED);
            when(articleMapper.selectById(ARTICLE_ID)).thenReturn(article);
            when(articleMapper.selectUserArticleById(ARTICLE_ID, CURRENT_USER_ID))
                .thenReturn(articleDto(ARTICLE_ID, CURRENT_USER_ID, ArticleStatus.OFFLINE, ArticleReviewStatus.APPROVED));

            ArticleDTO result = articleService.deleteUserArticle(CURRENT_USER_ID, ARTICLE_ID);

            assertEquals(ARTICLE_ID, result.getId());
            assertEquals(1, article.getDeleted());
            verify(articleMapper).updateById(article);
        }

        @Test
        void shouldOfflineOwnerPublishedArticle() {
            Article article = article(ARTICLE_ID, CURRENT_USER_ID, ArticleStatus.PUBLISHED, ArticleReviewStatus.APPROVED);
            when(articleMapper.selectById(ARTICLE_ID)).thenReturn(article);
            when(articleMapper.selectUserArticleById(ARTICLE_ID, CURRENT_USER_ID))
                .thenReturn(articleDto(ARTICLE_ID, CURRENT_USER_ID, ArticleStatus.OFFLINE, ArticleReviewStatus.APPROVED));

            ArticleDTO result = articleService.offlineUserArticle(CURRENT_USER_ID, ARTICLE_ID);

            assertEquals(ArticleStatus.OFFLINE, result.getStatus());
            assertEquals(ArticleStatus.OFFLINE, article.getStatus());
            assertEquals(ArticleReviewStatus.APPROVED, article.getReviewStatus());
            assertEquals(null, article.getPublishedAt());
            assertNotNull(article.getUpdatedAt());
            verify(articleMapper).updateById(article);
            verify(articleReviewLogMapper).insert(argThat(log -> log != null
                && "USER_OFFLINE".equals(log.getAction())
                && ArticleReviewStatus.APPROVED.equals(log.getFromReviewStatus())
                && ArticleReviewStatus.APPROVED.equals(log.getToReviewStatus())));
            verify(securityAuditService).log(eq("USER_ARTICLE_OFFLINE"), eq("USER"), eq(CURRENT_USER_ID), isNull(), isNull(), anyString());
        }

        @Test
        void shouldAllowOwnerOfflineArticleToBeEditedBackToDraft() {
            Article article = article(ARTICLE_ID, CURRENT_USER_ID, ArticleStatus.OFFLINE, ArticleReviewStatus.APPROVED);
            UserArticleUpsertRequestDTO request = new UserArticleUpsertRequestDTO();
            request.setTitle("Updated title");
            request.setSummary("Updated summary");
            request.setContentHtml("<p>Updated body</p>");

            when(articleMapper.selectById(ARTICLE_ID)).thenReturn(article);
            when(articleMapper.selectUserArticleById(ARTICLE_ID, CURRENT_USER_ID))
                .thenReturn(articleDto(ARTICLE_ID, CURRENT_USER_ID, ArticleStatus.DRAFT, ArticleReviewStatus.DRAFT));

            ArticleDTO result = articleService.updateUserArticle(CURRENT_USER_ID, ARTICLE_ID, request, "owner", "127.0.0.1");

            assertEquals(ArticleStatus.DRAFT, result.getStatus());
            assertEquals(ArticleStatus.DRAFT, article.getStatus());
            assertEquals(ArticleReviewStatus.DRAFT, article.getReviewStatus());
            assertEquals(null, article.getPublishedAt());
            assertEquals("Updated title", article.getTitle());
            verify(articleMapper).updateById(article);
        }

        @Test
        void shouldWithdrawOwnerPendingReviewArticleToDraft() {
            Article article = article(ARTICLE_ID, CURRENT_USER_ID, ArticleStatus.DRAFT, ArticleReviewStatus.PENDING_REVIEW);
            when(articleMapper.selectById(ARTICLE_ID)).thenReturn(article);
            when(articleMapper.selectUserArticleById(ARTICLE_ID, CURRENT_USER_ID))
                .thenReturn(articleDto(ARTICLE_ID, CURRENT_USER_ID, ArticleStatus.DRAFT, ArticleReviewStatus.DRAFT));

            ArticleDTO result = articleService.withdrawUserArticle(CURRENT_USER_ID, ARTICLE_ID);

            assertEquals(ArticleReviewStatus.DRAFT, result.getReviewStatus());
            assertEquals(ArticleReviewStatus.DRAFT, article.getReviewStatus());
            assertEquals(ArticleStatus.DRAFT, article.getStatus());
            assertEquals(null, article.getSubmittedAt());
            assertNotNull(article.getUpdatedAt());
            verify(articleMapper).updateById(article);
            verify(articleReviewLogMapper).insert(argThat(log -> log != null
                && "WITHDRAW_REVIEW".equals(log.getAction())
                && ArticleReviewStatus.PENDING_REVIEW.equals(log.getFromReviewStatus())
                && ArticleReviewStatus.DRAFT.equals(log.getToReviewStatus())));
            verify(securityAuditService).log(eq("USER_ARTICLE_WITHDRAW_REVIEW"), eq("USER"), eq(CURRENT_USER_ID), isNull(), isNull(), anyString());
        }

        @Test
        void shouldNotifyOwnerWhenArticleReviewApproved() {
            Article article = article(ARTICLE_ID, CURRENT_USER_ID, ArticleStatus.DRAFT, ArticleReviewStatus.PENDING_REVIEW);
            article.setTitle("Guide");
            when(articleMapper.selectById(ARTICLE_ID)).thenReturn(article);
            when(articleMapper.selectAdminArticleById(ARTICLE_ID))
                .thenReturn(articleDto(ARTICLE_ID, CURRENT_USER_ID, ArticleStatus.DRAFT, ArticleReviewStatus.APPROVED));

            articleService.reviewArticle(ARTICLE_ID, "APPROVE", null, "admin", "127.0.0.1");

            verify(userNotificationService).createNotification(
                eq(CURRENT_USER_ID),
                eq("ARTICLE_APPROVED"),
                anyString(),
                anyString(),
                eq("/user/articles/" + ARTICLE_ID)
            );
        }

        @Test
        void shouldRejectDeleteAndWithdrawForAnotherUsersArticle() {
            Article article = article(ARTICLE_ID, OTHER_USER_ID, ArticleStatus.DRAFT, ArticleReviewStatus.DRAFT);
            when(articleMapper.selectById(ARTICLE_ID)).thenReturn(article);

            assertThrows(IllegalArgumentException.class, () -> articleService.deleteUserArticle(CURRENT_USER_ID, ARTICLE_ID));
            assertThrows(IllegalArgumentException.class, () -> articleService.withdrawUserArticle(CURRENT_USER_ID, ARTICLE_ID));
            assertThrows(IllegalArgumentException.class, () -> articleService.offlineUserArticle(CURRENT_USER_ID, ARTICLE_ID));
            verify(articleMapper, never()).updateById(any());
        }

        private void assertDeleteRejected(Article article) {
            when(articleMapper.selectById(ARTICLE_ID)).thenReturn(article);

            IllegalArgumentException exception = assertThrows(
                IllegalArgumentException.class,
                () -> articleService.deleteUserArticle(CURRENT_USER_ID, ARTICLE_ID)
            );

            assertTrue(exception.getMessage().contains("Only draft, rejected or offline article can be deleted"));
            verify(articleMapper, never()).updateById(article);
        }
    }

    private static Article article(Long id, Long authorId, String status, String reviewStatus) {
        Article article = new Article();
        article.setId(id);
        article.setAuthorId(authorId);
        article.setStatus(status);
        article.setReviewStatus(reviewStatus);
        article.setDeleted(0);
        return article;
    }

    private static ArticleDTO articleDto(Long id, Long authorId, String status, String reviewStatus) {
        ArticleDTO article = new ArticleDTO();
        article.setId(id);
        article.setAuthorId(authorId);
        article.setStatus(status);
        article.setReviewStatus(reviewStatus);
        return article;
    }

    private static UserTokenClaims claims(Long userId) {
        return UserTokenClaims.builder()
            .userId(userId)
            .email("user@example.com")
            .displayName("User " + userId)
            .build();
    }

}

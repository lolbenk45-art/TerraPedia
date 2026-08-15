package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.config.ArticleReviewProperties;
import com.terraria.skills.dto.ArticleDTO;
import com.terraria.skills.mapper.ArticleMapper;
import com.terraria.skills.mapper.ArticleReviewLogMapper;
import com.terraria.skills.service.SecurityAuditService;
import com.terraria.skills.service.UserNotificationService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentMatchers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ArticleServiceImplAdminListFilterTest {

    @Mock
    private ArticleMapper articleMapper;

    @Mock
    private ArticleReviewLogMapper articleReviewLogMapper;

    @Mock
    private SecurityAuditService securityAuditService;

    @Mock
    private ArticleReviewProperties articleReviewProperties;

    @Mock
    private UserNotificationService userNotificationService;

    @Mock
    private UserAvatarUrlResolver userAvatarUrlResolver;

    @InjectMocks
    private ArticleServiceImpl articleService;

    @Test
    void shouldNormalizeValidReviewStatusBeforeFilteringAdminArticles() {
        stubAdminArticlePage();

        articleService.getAdminArticles(1, 20, null, null, " pending_review ", "commentCount", "desc");

        verify(articleMapper).selectAdminArticlesPage(
            any(Page.class),
            isNull(),
            isNull(),
            eq("PENDING_REVIEW"),
            eq("commentCount"),
            eq("desc")
        );
    }

    @Test
    void shouldTreatBlankReviewStatusAsNoAdminArticleFilter() {
        stubAdminArticlePage();

        articleService.getAdminArticles(1, 20, null, null, "  ", "commentCount", "desc");

        verify(articleMapper).selectAdminArticlesPage(
            any(Page.class),
            isNull(),
            isNull(),
            isNull(),
            eq("commentCount"),
            eq("desc")
        );
    }

    @Test
    void shouldRejectUnsupportedReviewStatusForAdminArticleFilter() {
        org.junit.jupiter.api.Assertions.assertThrows(
            IllegalArgumentException.class,
            () -> articleService.getAdminArticles(1, 20, null, null, "invalid", "commentCount", "desc")
        );
    }

    private void stubAdminArticlePage() {
        when(articleMapper.selectAdminArticlesPage(
            ArgumentMatchers.<Page<ArticleDTO>>any(),
            ArgumentMatchers.nullable(String.class),
            ArgumentMatchers.nullable(String.class),
            ArgumentMatchers.nullable(String.class),
            ArgumentMatchers.nullable(String.class),
            ArgumentMatchers.nullable(String.class)
        )).thenReturn(new Page<>());
    }
}

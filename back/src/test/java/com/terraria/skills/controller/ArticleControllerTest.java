package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.ArticleDTO;
import com.terraria.skills.service.ArticleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ArticleControllerTest {

    private ArticleService articleService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        articleService = mock(ArticleService.class);
        mockMvc = MockMvcBuilders.standaloneSetup(new ArticleController(articleService)).build();
    }

    @Test
    void shouldReturnPublishedArticleListWithContentAndPagination() throws Exception {
        ArticleDTO article = article(7L, "Guide", "guide", "Summary", "<p>Body</p>", "PUBLISHED", "APPROVED");
        Page<ArticleDTO> page = new Page<>(1, 5, 1);
        page.setRecords(List.of(article));
        when(articleService.getPublishedArticles(1, 5, "guide")).thenReturn(page);

        mockMvc.perform(get("/articles").param("page", "1").param("limit", "5").param("keyword", "guide"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].id").value(7))
            .andExpect(jsonPath("$.data[0].slug").value("guide"))
            .andExpect(jsonPath("$.data[0].contentHtml").value("<p>Body</p>"))
            .andExpect(jsonPath("$.pagination.total").value(1))
            .andExpect(jsonPath("$.pagination.page").value(1))
            .andExpect(jsonPath("$.pagination.limit").value(5));

        verify(articleService).getPublishedArticles(eq(1), eq(5), eq("guide"));
    }

    @Test
    void shouldReturnPublishedArticleByIdWithContent() throws Exception {
        when(articleService.getPublishedArticleById(7L))
            .thenReturn(article(7L, "Guide", "guide", null, "<p>Body</p>", "PUBLISHED", "APPROVED"));

        mockMvc.perform(get("/articles/7"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.id").value(7))
            .andExpect(jsonPath("$.data.contentHtml").value("<p>Body</p>"));

        verify(articleService).getPublishedArticleById(eq(7L));
    }

    @Test
    void shouldReturnPublishedArticleBySlugWithContent() throws Exception {
        ArticleDTO article = article(7L, "Guide", "guide", null, "<p>Body</p>", "PUBLISHED", "APPROVED");
        article.setAuthorAvatarUrl("/api/files/objects/avatars/7/avatar.png");
        article.setViewCount(12L);
        article.setLikeCount(2L);
        article.setFavoriteCount(3L);
        article.setCommentCount(4L);
        when(articleService.getPublishedArticleBySlug("guide")).thenReturn(article);

        mockMvc.perform(get("/articles/slug/guide"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.slug").value("guide"))
            .andExpect(jsonPath("$.data.contentHtml").value("<p>Body</p>"))
            .andExpect(jsonPath("$.data.authorAvatarUrl").value("/api/files/objects/avatars/7/avatar.png"))
            .andExpect(jsonPath("$.data.viewCount").value(12))
            .andExpect(jsonPath("$.data.likeCount").value(2))
            .andExpect(jsonPath("$.data.favoriteCount").value(3))
            .andExpect(jsonPath("$.data.commentCount").value(4));

        verify(articleService).getPublishedArticleBySlug(eq("guide"));
    }

    private ArticleDTO article(Long id, String title, String slug, String summary, String contentHtml, String status, String reviewStatus) {
        ArticleDTO article = new ArticleDTO();
        article.setId(id);
        article.setTitle(title);
        article.setSlug(slug);
        article.setSummary(summary);
        article.setContentHtml(contentHtml);
        article.setStatus(status);
        article.setReviewStatus(reviewStatus);
        return article;
    }
}

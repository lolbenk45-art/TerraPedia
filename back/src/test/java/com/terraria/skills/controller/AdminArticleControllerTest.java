package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.auth.AdminAuthenticationInterceptor;
import com.terraria.skills.auth.AdminTokenClaims;
import com.terraria.skills.dto.ArticleDTO;
import com.terraria.skills.service.ArticleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AdminArticleControllerTest {

    private ArticleService articleService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        articleService = mock(ArticleService.class);
        mockMvc = MockMvcBuilders.standaloneSetup(new AdminArticleController(articleService))
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldReturnAdminArticleDetailWithBodyContent() throws Exception {
        when(articleService.getAdminArticleById(7L))
            .thenReturn(article(7L, "Guide", "<p>Admin body</p>", "PUBLISHED", "APPROVED"));

        mockMvc.perform(get("/admin/articles/7"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.id").value(7))
            .andExpect(jsonPath("$.data.contentHtml").value("<p>Admin body</p>"));

        verify(articleService).getAdminArticleById(eq(7L));
    }

    @Test
    void shouldPassArticleListSortOptionsToService() throws Exception {
        when(articleService.getAdminArticles(1, 20, null, null, "commentCount", "desc"))
            .thenReturn(new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(1, 20));

        mockMvc.perform(get("/admin/articles")
                .param("sortBy", "commentCount")
                .param("sortOrder", "desc"))
            .andExpect(status().isOk());

        verify(articleService).getAdminArticles(1, 20, null, null, "commentCount", "desc");
    }

    @Test
    void shouldOfflinePublishedArticleThroughAdminAction() throws Exception {
        when(articleService.offlineArticle(eq(7L), eq("admin"), anyString()))
            .thenReturn(article(7L, "Guide", null, "OFFLINE", "APPROVED"));

        mockMvc.perform(post("/admin/articles/7/offline")
                .requestAttr(AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE, claims()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.status").value("OFFLINE"));

        verify(articleService).offlineArticle(eq(7L), eq("admin"), anyString());
    }

    @Test
    void shouldApprovePendingArticleThroughAdminAction() throws Exception {
        when(articleService.reviewArticle(eq(7L), eq("APPROVE"), isNull(), eq("admin"), anyString()))
            .thenReturn(article(7L, "Guide", null, "DRAFT", "APPROVED"));

        mockMvc.perform(post("/admin/articles/7/review")
                .requestAttr(AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE, claims())
                .contentType("application/json")
                .content("{\"action\":\"APPROVE\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.reviewStatus").value("APPROVED"));

        verify(articleService).reviewArticle(eq(7L), eq("APPROVE"), isNull(), eq("admin"), anyString());
    }

    private ArticleDTO article(Long id, String title, String contentHtml, String status, String reviewStatus) {
        ArticleDTO article = new ArticleDTO();
        article.setId(id);
        article.setTitle(title);
        article.setContentHtml(contentHtml);
        article.setStatus(status);
        article.setReviewStatus(reviewStatus);
        return article;
    }

    private AdminTokenClaims claims() {
        return AdminTokenClaims.builder()
            .username("admin")
            .build();
    }
}

package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.terraria.skills.auth.AdminAuthenticationInterceptor;
import com.terraria.skills.auth.AdminTokenClaims;
import com.terraria.skills.dto.AdminArticleCommentDTO;
import com.terraria.skills.handler.GlobalExceptionHandler;
import com.terraria.skills.service.AdminArticleCommentService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AdminArticleCommentControllerTest {

    private AdminArticleCommentService adminArticleCommentService;
    private final ObjectMapper objectMapper = new ObjectMapper()
        .findAndRegisterModules()
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        adminArticleCommentService = mock(AdminArticleCommentService.class);
        mockMvc = MockMvcBuilders.standaloneSetup(new AdminArticleCommentController(adminArticleCommentService))
            .setControllerAdvice(new GlobalExceptionHandler())
            .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
            .build();
    }

    @Test
    void shouldListCommentsForExactArticleId() throws Exception {
        Page<AdminArticleCommentDTO> page = new Page<>(1, 20, 1);
        page.setRecords(List.of(comment(9L, 77L, "PUBLISHED")));
        when(adminArticleCommentService.getArticleComments(77L, 1, 20, "PUBLISHED", "guide", 42L, "replyCount", "desc")).thenReturn(page);

        mockMvc.perform(get("/admin/articles/77/comments")
                .param("page", "1")
                .param("limit", "20")
                .param("status", "PUBLISHED")
                .param("keyword", "guide")
                .param("authorId", "42")
                .param("sortBy", "replyCount")
                .param("sortOrder", "desc")
                .requestAttr(AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE, claims()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.pagination.total").value(1))
            .andExpect(jsonPath("$.data[0].id").value(9))
            .andExpect(jsonPath("$.data[0].articleId").value(77))
            .andExpect(jsonPath("$.data[0].status").value("PUBLISHED"));

        verify(adminArticleCommentService).getArticleComments(77L, 1, 20, "PUBLISHED", "guide", 42L, "replyCount", "desc");
    }

    @Test
    void shouldListRepliesForExactArticleAndRootComment() throws Exception {
        AdminArticleCommentDTO reply = comment(12L, 77L, "PUBLISHED");
        reply.setParentId(9L);
        reply.setRootId(9L);
        Page<AdminArticleCommentDTO> page = new Page<>(1, 20, 1);
        page.setRecords(List.of(reply));
        when(adminArticleCommentService.getArticleCommentReplies(77L, 9L, 1, 20, null)).thenReturn(page);

        mockMvc.perform(get("/admin/articles/77/comments/9/replies")
                .param("page", "1")
                .param("limit", "20")
                .requestAttr(AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE, claims()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].id").value(12))
            .andExpect(jsonPath("$.data[0].parentId").value(9));

        verify(adminArticleCommentService).getArticleCommentReplies(77L, 9L, 1, 20, null);
    }

    @Test
    void shouldUpdateCommentStatusWithAdminOperator() throws Exception {
        AdminArticleCommentDTO hidden = comment(9L, 77L, "HIDDEN");
        hidden.setDeleted(true);
        hidden.setDeletedReason("spam");
        when(adminArticleCommentService.updateCommentStatus(eq(77L), eq(9L), eq("HIDDEN"), eq("spam"), eq("admin"), anyString()))
            .thenReturn(hidden);

        mockMvc.perform(patch("/admin/articles/77/comments/9/status")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"HIDDEN\",\"reason\":\"spam\"}")
                .requestAttr(AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE, claims()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.status").value("HIDDEN"))
            .andExpect(jsonPath("$.data.deleted").value(true))
            .andExpect(jsonPath("$.data.deletedReason").value("spam"));

        verify(adminArticleCommentService).updateCommentStatus(eq(77L), eq(9L), eq("HIDDEN"), eq("spam"), eq("admin"), anyString());
    }

    @Test
    void shouldReturnBadRequestForInvalidStatusRequest() throws Exception {
        mockMvc.perform(patch("/admin/articles/77/comments/9/status")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"\"}")
                .requestAttr(AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE, claims()))
            .andExpect(status().isBadRequest());

        verify(adminArticleCommentService, org.mockito.Mockito.never())
            .updateCommentStatus(eq(77L), eq(9L), anyString(), isNull(), eq("admin"), anyString());
    }

    @Test
    void shouldRejectWrongTypeAdminClaimsAsUnauthorized() throws Exception {
        mockMvc.perform(patch("/admin/articles/77/comments/9/status")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"HIDDEN\",\"reason\":\"spam\"}")
                .requestAttr(AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE, "not-admin-claims"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.statusCode").value(401))
            .andExpect(jsonPath("$.message").value("未登录或登录状态已失效"));

        verifyNoInteractions(adminArticleCommentService);
    }

    private AdminArticleCommentDTO comment(Long id, Long articleId, String status) {
        AdminArticleCommentDTO comment = new AdminArticleCommentDTO();
        comment.setId(id);
        comment.setArticleId(articleId);
        comment.setRootId(id);
        comment.setAuthorId(42L);
        comment.setAuthorDisplayName("Guide Reader");
        comment.setContent("评论内容");
        comment.setStatus(status);
        comment.setDeleted(!"PUBLISHED".equals(status));
        comment.setLikeCount(0);
        comment.setReplyCount(0);
        comment.setCreatedAt(LocalDateTime.of(2026, 6, 5, 8, 20));
        comment.setUpdatedAt(LocalDateTime.of(2026, 6, 5, 8, 20));
        return comment;
    }

    private AdminTokenClaims claims() {
        return AdminTokenClaims.builder()
            .username("admin")
            .build();
    }
}

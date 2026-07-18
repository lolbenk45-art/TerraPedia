package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.terraria.skills.auth.UserAuthenticationInterceptor;
import com.terraria.skills.auth.UserTokenClaims;
import com.terraria.skills.dto.ArticleCommentCreateRequestDTO;
import com.terraria.skills.dto.ArticleCommentDTO;
import com.terraria.skills.handler.GlobalExceptionHandler;
import com.terraria.skills.security.ClientIpResolver;
import com.terraria.skills.service.ArticleCommentService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ArticleCommentControllerTest {

    private final ArticleCommentService articleCommentService = mock(ArticleCommentService.class);
    private final ClientIpResolver clientIpResolver = mock(ClientIpResolver.class);
    private final ObjectMapper objectMapper = new ObjectMapper()
        .findAndRegisterModules()
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        when(clientIpResolver.resolve(org.mockito.ArgumentMatchers.any())).thenReturn("203.0.113.9");
        mockMvc = MockMvcBuilders.standaloneSetup(new ArticleCommentController(articleCommentService, clientIpResolver))
            .setControllerAdvice(new GlobalExceptionHandler())
            .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
            .build();
    }

    @Test
    void shouldListPublishedArticleCommentsWithPagination() throws Exception {
        Page<ArticleCommentDTO> page = new Page<>(1, 10, 1);
        page.setRecords(List.of(comment()));
        when(articleCommentService.getPublishedArticleComments(77L, null, 1, 10)).thenReturn(page);

        mockMvc.perform(get("/articles/77/comments").param("page", "1").param("limit", "10"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.pagination.total").value(1))
            .andExpect(jsonPath("$.data[0].id").value(9))
            .andExpect(jsonPath("$.data[0].content").value("这条路线很清楚。"))
            .andExpect(jsonPath("$.data[0].authorDisplayName").value("Guide Reader"))
            .andExpect(jsonPath("$.data[0].authorAvatarUrl").value("/api/files/objects/avatars/42/avatar.png"));

        verify(articleCommentService).getPublishedArticleComments(77L, null, 1, 10);
    }

    @Test
    void shouldListPublishedArticleCommentRepliesWithPagination() throws Exception {
        ArticleCommentDTO reply = comment();
        reply.setId(12L);
        reply.setParentId(9L);
        reply.setRootId(9L);
        reply.setReplyToUserId(42L);
        reply.setReplyToDisplayName("Guide Reader");
        reply.setContent("我补一张流程图。");
        Page<ArticleCommentDTO> page = new Page<>(1, 10, 1);
        page.setRecords(List.of(reply));
        when(articleCommentService.getPublishedArticleReplies(77L, 9L, null, 1, 10)).thenReturn(page);

        mockMvc.perform(get("/articles/77/comments/9/replies").param("page", "1").param("limit", "10"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.pagination.total").value(1))
            .andExpect(jsonPath("$.data[0].id").value(12))
            .andExpect(jsonPath("$.data[0].parentId").value(9))
            .andExpect(jsonPath("$.data[0].replyToDisplayName").value("Guide Reader"));

        verify(articleCommentService).getPublishedArticleReplies(77L, 9L, null, 1, 10);
    }

    @Test
    void shouldCreateArticleCommentForCurrentClaimsUserOnly() throws Exception {
        when(articleCommentService.createComment(eq(42L), eq(77L), eq("补充一个材料顺序。"), anyString())).thenReturn(comment());

        ArticleCommentCreateRequestDTO request = new ArticleCommentCreateRequestDTO();
        request.setContent("补充一个材料顺序。");

        mockMvc.perform(post("/articles/77/comments")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, claims(42L)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.id").value(9))
            .andExpect(jsonPath("$.data.content").value("这条路线很清楚。"));

        ArgumentCaptor<Long> userIdCaptor = ArgumentCaptor.forClass(Long.class);
        verify(articleCommentService).createComment(userIdCaptor.capture(), eq(77L), eq("补充一个材料顺序。"), anyString());
        assertEquals(42L, userIdCaptor.getValue());
    }

    @Test
    void shouldCreateArticleCommentReplyForCurrentClaimsUserOnly() throws Exception {
        ArticleCommentDTO reply = comment();
        reply.setId(12L);
        reply.setParentId(9L);
        reply.setRootId(9L);
        when(articleCommentService.createReply(eq(42L), eq(77L), eq(9L), eq(9L), eq("我补一张流程图"), anyString())).thenReturn(reply);

        mockMvc.perform(post("/articles/77/comments/9/replies")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"content\":\"我补一张流程图\",\"replyToCommentId\":9}")
                .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, claims(42L)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.id").value(12))
            .andExpect(jsonPath("$.data.parentId").value(9))
            .andExpect(jsonPath("$.data.rootId").value(9));

        verify(articleCommentService).createReply(eq(42L), eq(77L), eq(9L), eq(9L), eq("我补一张流程图"), anyString());
    }

    @Test
    void shouldDeleteOwnArticleCommentForCurrentClaimsUserOnly() throws Exception {
        when(articleCommentService.deleteOwnComment(eq(42L), eq(77L), eq(9L), anyString())).thenReturn(comment());

        mockMvc.perform(delete("/articles/77/comments/9")
                .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, claims(42L)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.id").value(9));

        verify(articleCommentService).deleteOwnComment(eq(42L), eq(77L), eq(9L), anyString());
    }

    @Test
    void shouldLikeAndUnlikeArticleCommentForCurrentClaimsUserOnly() throws Exception {
        ArticleCommentDTO liked = comment();
        liked.setLikeCount(1);
        liked.setLikedByCurrentUser(true);
        when(articleCommentService.likeComment(eq(42L), eq(77L), eq(9L), anyString())).thenReturn(liked);

        mockMvc.perform(post("/articles/77/comments/9/like")
                .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, claims(42L)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.likedByCurrentUser").value(true))
            .andExpect(jsonPath("$.data.likeCount").value(1));

        ArticleCommentDTO unliked = comment();
        unliked.setLikeCount(0);
        unliked.setLikedByCurrentUser(false);
        when(articleCommentService.unlikeComment(eq(42L), eq(77L), eq(9L), anyString())).thenReturn(unliked);

        mockMvc.perform(delete("/articles/77/comments/9/like")
                .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, claims(42L)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.likedByCurrentUser").value(false))
            .andExpect(jsonPath("$.data.likeCount").value(0));

        verify(articleCommentService).likeComment(eq(42L), eq(77L), eq(9L), anyString());
        verify(articleCommentService).unlikeComment(eq(42L), eq(77L), eq(9L), anyString());
    }

    private ArticleCommentDTO comment() {
        ArticleCommentDTO comment = new ArticleCommentDTO();
        comment.setId(9L);
        comment.setArticleId(77L);
        comment.setParentId(null);
        comment.setRootId(9L);
        comment.setAuthorId(42L);
        comment.setAuthorDisplayName("Guide Reader");
        comment.setAuthorAvatarUrl("/api/files/objects/avatars/42/avatar.png");
        comment.setContent("这条路线很清楚。");
        comment.setStatus("PUBLISHED");
        comment.setDeleted(false);
        comment.setLikeCount(0);
        comment.setLikedByCurrentUser(false);
        comment.setReplyCount(0);
        comment.setReplies(List.of());
        comment.setCreatedAt(LocalDateTime.of(2026, 6, 5, 6, 50));
        comment.setUpdatedAt(LocalDateTime.of(2026, 6, 5, 6, 50));
        return comment;
    }

    private static UserTokenClaims claims(Long userId) {
        return UserTokenClaims.builder()
            .userId(userId)
            .email("reader@example.com")
            .build();
    }
}

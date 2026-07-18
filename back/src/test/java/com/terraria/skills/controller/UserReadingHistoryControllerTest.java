package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.auth.UserAuthenticationInterceptor;
import com.terraria.skills.auth.UserTokenClaims;
import com.terraria.skills.dto.UserReadingHistoryDTO;
import com.terraria.skills.handler.GlobalExceptionHandler;
import com.terraria.skills.security.ClientIpResolver;
import com.terraria.skills.service.UserReadingHistoryService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class UserReadingHistoryControllerTest {

    private final UserReadingHistoryService userReadingHistoryService = mock(UserReadingHistoryService.class);
    private final ClientIpResolver clientIpResolver = mock(ClientIpResolver.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        when(clientIpResolver.resolve(org.mockito.ArgumentMatchers.any())).thenReturn("203.0.113.9");
        mockMvc = MockMvcBuilders.standaloneSetup(new UserReadingHistoryController(userReadingHistoryService, clientIpResolver))
            .setControllerAdvice(new GlobalExceptionHandler())
            .setMessageConverters(new org.springframework.http.converter.json.MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldRecordArticleHistoryForCurrentClaimsUserOnly() throws Exception {
        when(userReadingHistoryService.record(eq(42L), eq("ARTICLE"), eq(77L), anyString()))
            .thenReturn(UserReadingHistoryDTO.builder()
                .targetType("ARTICLE")
                .targetId(77L)
                .title("Guide")
                .url("/articles/guide")
                .viewCount(1)
                .build());

        mockMvc.perform(post("/user/history/ARTICLE/77")
                .param("userId", "43")
                .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, UserTokenClaims.builder()
                    .userId(42L)
                    .email("user@example.com")
                    .build()))
            .andExpect(status().isOk());

        ArgumentCaptor<Long> userIdCaptor = ArgumentCaptor.forClass(Long.class);
        verify(userReadingHistoryService).record(userIdCaptor.capture(), eq("ARTICLE"), eq(77L), anyString());
        assertEquals(42L, userIdCaptor.getValue());
    }

    @Test
    void shouldListHistoryWithPaginationForCurrentClaimsUserOnly() throws Exception {
        Page<UserReadingHistoryDTO> page = new Page<>(1, 20);
        page.setTotal(1);
        page.setRecords(List.of(UserReadingHistoryDTO.builder()
            .targetType("ITEM")
            .targetId(88L)
            .title("Item")
            .url("/items/88")
            .viewCount(2)
            .build()));
        when(userReadingHistoryService.getHistory(42L, "all", 1, 20)).thenReturn(page);

        mockMvc.perform(get("/user/history")
                .param("type", "all")
                .param("page", "1")
                .param("limit", "20")
                .param("userId", "43")
                .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, UserTokenClaims.builder()
                    .userId(42L)
                    .email("user@example.com")
                    .build()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.pagination.total").value(1))
            .andExpect(jsonPath("$.data[0].targetType").value("ITEM"));

        verify(userReadingHistoryService).getHistory(42L, "all", 1, 20);
    }

    @Test
    void shouldDeleteHistoryForCurrentClaimsUserOnly() throws Exception {
        when(userReadingHistoryService.remove(eq(42L), eq("ITEM"), eq(88L), anyString()))
            .thenReturn(UserReadingHistoryDTO.builder()
                .targetType("ITEM")
                .targetId(88L)
                .url("/items/88")
                .build());

        mockMvc.perform(delete("/user/history/ITEM/88")
                .param("userId", "43")
                .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, UserTokenClaims.builder()
                    .userId(42L)
                    .email("user@example.com")
                    .build()))
            .andExpect(status().isOk());

        verify(userReadingHistoryService).remove(eq(42L), eq("ITEM"), eq(88L), anyString());
    }

    @Test
    void shouldRejectMissingClaimsWithUnauthorized() throws Exception {
        mockMvc.perform(post("/user/history/ARTICLE/77"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.statusCode").value(401));
    }

    @Test
    void shouldRejectClaimsWithoutUserIdAsUnauthorized() throws Exception {
        mockMvc.perform(post("/user/history/ARTICLE/77")
                .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, UserTokenClaims.builder()
                    .email("user@example.com")
                    .build()))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.statusCode").value(401))
            .andExpect(jsonPath("$.message").value("未登录或登录状态已失效"));

        verifyNoInteractions(userReadingHistoryService);
    }
}

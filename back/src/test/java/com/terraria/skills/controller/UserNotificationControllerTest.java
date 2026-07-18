package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.auth.UserAuthenticationInterceptor;
import com.terraria.skills.auth.UserTokenClaims;
import com.terraria.skills.dto.UserNotificationDTO;
import com.terraria.skills.handler.GlobalExceptionHandler;
import com.terraria.skills.security.ClientIpResolver;
import com.terraria.skills.service.UserNotificationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class UserNotificationControllerTest {

    private final UserNotificationService userNotificationService = mock(UserNotificationService.class);
    private final ClientIpResolver clientIpResolver = mock(ClientIpResolver.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        when(clientIpResolver.resolve(org.mockito.ArgumentMatchers.any())).thenReturn("203.0.113.9");
        mockMvc = MockMvcBuilders.standaloneSetup(new UserNotificationController(userNotificationService, clientIpResolver))
            .setControllerAdvice(new GlobalExceptionHandler())
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldListNotificationsForCurrentClaimsUserOnly() throws Exception {
        Page<UserNotificationDTO> page = new Page<>(1, 20);
        page.setTotal(1);
        page.setRecords(List.of(notification(9L, false)));
        when(userNotificationService.getNotifications(42L, true, 1, 20)).thenReturn(page);

        mockMvc.perform(get("/user/notifications")
                .param("unreadOnly", "true")
                .param("userId", "43")
                .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, claims(42L)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].title").value("文章已通过审核"));

        verify(userNotificationService).getNotifications(42L, true, 1, 20);
    }

    @Test
    void shouldExposeUnreadCountForCurrentClaimsUserOnly() throws Exception {
        when(userNotificationService.countUnread(42L)).thenReturn(3L);

        mockMvc.perform(get("/user/notifications/unread-count")
                .param("userId", "43")
                .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, claims(42L)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.unreadCount").value(3));

        verify(userNotificationService).countUnread(42L);
    }

    @Test
    void shouldMarkNotificationReadForCurrentClaimsUserOnly() throws Exception {
        when(userNotificationService.markRead(eq(42L), eq(9L), eq("203.0.113.9"))).thenReturn(notification(9L, true));

        mockMvc.perform(patch("/user/notifications/9/read")
                .param("userId", "43")
                .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, claims(42L)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.read").value(true));

        verify(userNotificationService).markRead(eq(42L), eq(9L), eq("203.0.113.9"));
        verify(clientIpResolver).resolve(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void shouldMarkAllNotificationsReadForCurrentClaimsUserOnly() throws Exception {
        when(userNotificationService.markAllRead(eq(42L), anyString())).thenReturn(2);

        mockMvc.perform(patch("/user/notifications/read-all")
                .param("userId", "43")
                .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, claims(42L)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.updated").value(2));

        verify(userNotificationService).markAllRead(eq(42L), anyString());
    }

    private static UserNotificationDTO notification(Long id, boolean read) {
        return UserNotificationDTO.builder()
            .id(id)
            .type("ARTICLE_APPROVED")
            .title("文章已通过审核")
            .body("你的文章已经通过审核。")
            .targetUrl("/user/articles/77")
            .read(read)
            .build();
    }

    private static UserTokenClaims claims(Long userId) {
        return UserTokenClaims.builder()
            .userId(userId)
            .email("user@example.com")
            .build();
    }
}

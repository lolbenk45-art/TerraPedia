package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.auth.UserAuthProperties;
import com.terraria.skills.dto.UserProfileDTO;
import com.terraria.skills.dto.UserSessionDTO;
import com.terraria.skills.service.UserAuthService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class UserAuthControllerTest {

    private final UserAuthService userAuthService = mock(UserAuthService.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        UserAuthProperties properties = new UserAuthProperties();
        properties.setAccessCookieName("tp_user_access");
        properties.setRefreshCookieName("tp_user_refresh");
        properties.setAccessTokenTtlSeconds(3600L);
        properties.setRefreshTokenTtlSeconds(86400L);

        mockMvc = MockMvcBuilders.standaloneSetup(new UserAuthController(userAuthService, properties))
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldRejectRefreshWithoutRefreshCookie() throws Exception {
        mockMvc.perform(post("/user-auth/refresh"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.message").value("Refresh session is missing"));

        verifyNoInteractions(userAuthService);
    }

    @Test
    void shouldRotateSessionWithValidRefreshCookie() throws Exception {
        UserProfileDTO user = UserProfileDTO.builder()
            .id(42L)
            .email("user@example.com")
            .displayName("User")
            .status(1)
            .build();
        UserSessionDTO session = UserSessionDTO.builder()
            .user(user)
            .accessToken("new-access-token")
            .refreshToken("new-refresh-token")
            .expiresAt(1893456000000L)
            .build();
        when(userAuthService.refreshSession(eq("old-refresh-token"), anyString())).thenReturn(session);

        mockMvc.perform(post("/user-auth/refresh")
                .cookie(new Cookie("tp_user_refresh", "old-refresh-token")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.user.id").value(42L))
            .andExpect(cookie().value("tp_user_access", "new-access-token"))
            .andExpect(cookie().value("tp_user_refresh", "new-refresh-token"));

        verify(userAuthService).refreshSession(eq("old-refresh-token"), anyString());
    }

    @Test
    void shouldRejectRefreshWhenRefreshTokenIsInvalid() throws Exception {
        when(userAuthService.refreshSession(eq("revoked-refresh-token"), anyString()))
            .thenThrow(new IllegalArgumentException("Refresh session is invalid"));

        mockMvc.perform(post("/user-auth/refresh")
                .cookie(new Cookie("tp_user_refresh", "revoked-refresh-token")))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.message").value("Refresh session is invalid"))
            .andExpect(cookie().maxAge("tp_user_access", 0))
            .andExpect(cookie().maxAge("tp_user_refresh", 0));
    }
}

package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.auth.UserAuthProperties;
import com.terraria.skills.auth.UserAuthenticationInterceptor;
import com.terraria.skills.auth.UserTokenClaims;
import com.terraria.skills.dto.UserProfileDTO;
import com.terraria.skills.dto.UserSessionDTO;
import com.terraria.skills.handler.GlobalExceptionHandler;
import com.terraria.skills.security.ClientIpResolver;
import com.terraria.skills.service.UserAuthService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.hamcrest.Matchers.greaterThan;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class UserAuthControllerTest {

    private final UserAuthService userAuthService = mock(UserAuthService.class);
    private final ClientIpResolver clientIpResolver = mock(ClientIpResolver.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        UserAuthProperties properties = new UserAuthProperties();
        properties.setAccessCookieName("tp_user_access");
        properties.setRefreshCookieName("tp_user_refresh");
        properties.setAccessTokenTtlSeconds(3600L);
        properties.setRefreshTokenTtlSeconds(86400L);

        when(clientIpResolver.resolve(org.mockito.ArgumentMatchers.any())).thenReturn("203.0.113.9");

        mockMvc = MockMvcBuilders.standaloneSetup(new UserAuthController(userAuthService, properties, clientIpResolver))
            .setControllerAdvice(new GlobalExceptionHandler())
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldRejectRefreshWithoutRefreshCookie() throws Exception {
        mockMvc.perform(post("/user-auth/refresh"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.statusCode").value(401))
            .andExpect(jsonPath("$.message").value("Refresh session is missing"))
            .andExpect(cookie().maxAge("tp_user_access", 0))
            .andExpect(cookie().maxAge("tp_user_refresh", 0));

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
            .andExpect(jsonPath("$.statusCode").value(401))
            .andExpect(jsonPath("$.message").value("Refresh session is invalid"))
            .andExpect(cookie().maxAge("tp_user_access", 0))
            .andExpect(cookie().maxAge("tp_user_refresh", 0));
    }

    @Test
    void shouldRejectMalformedLoginThroughExternalApiPathWithoutAuthCookies() throws Exception {
        mockMvc.perform(post("/api/user-auth/login")
                .contextPath("/api")
                .contentType("application/json")
                .content("""
                    {
                      "email": "not-an-email",
                      "password": "Password123"
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.statusCode").value(400))
            .andExpect(cookie().doesNotExist("tp_user_access"))
            .andExpect(cookie().doesNotExist("tp_user_refresh"));

        verifyNoInteractions(userAuthService);
    }

    @Test
    void shouldRejectValidShapeRegistrationWhenVerificationCodeIsRejected() throws Exception {
        when(userAuthService.register(
            eq("new@example.com"),
            eq("Password123"),
            eq("Runner user"),
            eq("123456"),
            anyString()
        )).thenThrow(new IllegalArgumentException("Invalid verification code"));

        mockMvc.perform(post("/api/user-auth/register")
                .contextPath("/api")
                .contentType("application/json")
                .content("""
                    {
                      "email": "new@example.com",
                      "password": "Password123",
                      "displayName": "Runner user",
                      "verificationCode": "123456"
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.statusCode").value(400))
            .andExpect(cookie().doesNotExist("tp_user_access"))
            .andExpect(cookie().doesNotExist("tp_user_refresh"));

        verify(userAuthService).register(
            eq("new@example.com"),
            eq("Password123"),
            eq("Runner user"),
            eq("123456"),
            anyString()
        );
    }

    @Test
    void shouldClearAuthCookiesAfterPasswordChangeRequiresFreshLogin() throws Exception {
        mockMvc.perform(patch("/user-auth/password")
                .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, UserTokenClaims.builder()
                    .userId(42L)
                    .email("user@example.com")
                    .build())
                .contentType("application/json")
                .content("""
                    {
                      "currentPassword": "OldPassword123",
                      "newPassword": "NewPassword123"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(cookie().maxAge("tp_user_access", 0))
            .andExpect(cookie().maxAge("tp_user_refresh", 0))
            .andExpect(jsonPath("$.message").value("Password changed successfully"));

        verify(userAuthService).changePassword(eq(42L), eq("OldPassword123"), eq("NewPassword123"), anyString());
    }

    @Test
    void shouldUseCentralClientIpResolverForLogin() throws Exception {
        UserProfileDTO user = UserProfileDTO.builder()
            .id(42L)
            .email("user@example.com")
            .displayName("User")
            .status(1)
            .build();
        UserSessionDTO session = UserSessionDTO.builder()
            .user(user)
            .accessToken("access-token")
            .refreshToken("refresh-token")
            .expiresAt(1893456000000L)
            .build();
        when(userAuthService.login(eq("user@example.com"), eq("Password123"), eq("203.0.113.9"))).thenReturn(session);

        mockMvc.perform(post("/user-auth/login")
                .header("X-Forwarded-For", "198.51.100.77")
                .contentType("application/json")
                .content("""
                    {
                      "email": "user@example.com",
                      "password": "Password123"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.user.email").value("user@example.com"))
            .andExpect(jsonPath("$.data.tokenType").value("Bearer"))
            .andExpect(jsonPath("$.data.expiresAt").value(greaterThan(System.currentTimeMillis())))
            .andExpect(cookie().httpOnly("tp_user_access", true))
            .andExpect(cookie().path("tp_user_access", "/"))
            .andExpect(cookie().maxAge("tp_user_access", greaterThan(0)))
            .andExpect(cookie().httpOnly("tp_user_refresh", true))
            .andExpect(cookie().path("tp_user_refresh", "/"))
            .andExpect(cookie().maxAge("tp_user_refresh", greaterThan(0)));

        verify(userAuthService).login(eq("user@example.com"), eq("Password123"), eq("203.0.113.9"));
    }

    @Test
    void shouldReturnTheExternalRegistrationSessionContractAndSecureCookies() throws Exception {
        UserProfileDTO user = UserProfileDTO.builder()
            .id(43L)
            .email("new@example.com")
            .displayName("New user")
            .status(1)
            .build();
        UserSessionDTO session = UserSessionDTO.builder()
            .user(user)
            .accessToken("register-access-token")
            .refreshToken("register-refresh-token")
            .expiresAt(System.currentTimeMillis() + 3_600_000L)
            .build();
        when(userAuthService.register(
            eq("new@example.com"),
            eq("Password123"),
            eq("New user"),
            eq("123456"),
            eq("203.0.113.9")
        )).thenReturn(session);

        mockMvc.perform(post("/api/user-auth/register")
                .contextPath("/api")
                .contentType("application/json")
                .content("""
                    {
                      "email": "new@example.com",
                      "password": "Password123",
                      "displayName": "New user",
                      "verificationCode": "123456"
                    }
                    """))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.user.email").value("new@example.com"))
            .andExpect(jsonPath("$.data.tokenType").value("Bearer"))
            .andExpect(jsonPath("$.data.expiresAt").value(greaterThan(System.currentTimeMillis())))
            .andExpect(cookie().httpOnly("tp_user_access", true))
            .andExpect(cookie().path("tp_user_access", "/"))
            .andExpect(cookie().maxAge("tp_user_access", greaterThan(0)))
            .andExpect(cookie().httpOnly("tp_user_refresh", true))
            .andExpect(cookie().path("tp_user_refresh", "/"))
            .andExpect(cookie().maxAge("tp_user_refresh", greaterThan(0)));
    }
}

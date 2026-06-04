package com.terraria.skills.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.auth.LoginRateLimitService;
import com.terraria.skills.auth.RegisterVerificationService;
import com.terraria.skills.auth.UserAuthProperties;
import com.terraria.skills.auth.UserJwtService;
import com.terraria.skills.auth.UserRefreshTokenStoreService;
import com.terraria.skills.dto.UserSessionDTO;
import com.terraria.skills.entity.User;
import com.terraria.skills.mapper.UserMapper;
import com.terraria.skills.service.ObjectStorageService;
import com.terraria.skills.service.SecurityAuditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserAuthServiceImplTest {

    private UserMapper userMapper;
    private UserRefreshTokenStoreService refreshTokenStore;
    private SecurityAuditService securityAuditService;
    private UserAuthServiceImpl service;

    @BeforeEach
    void setUp() {
        UserAuthProperties properties = new UserAuthProperties();
        properties.setTokenSecret("unit-test-user-auth-secret-that-is-long-enough");
        properties.setAccessTokenTtlSeconds(3600L);
        properties.setRefreshTokenTtlSeconds(86400L);

        userMapper = mock(UserMapper.class);
        refreshTokenStore = mock(UserRefreshTokenStoreService.class);
        securityAuditService = mock(SecurityAuditService.class);

        service = new UserAuthServiceImpl(
            userMapper,
            new UserJwtService(properties, new ObjectMapper()),
            refreshTokenStore,
            properties,
            mock(LoginRateLimitService.class),
            mock(RegisterVerificationService.class),
            securityAuditService,
            mock(ObjectStorageService.class),
            new UserAvatarUrlResolver(null)
        );
    }

    @Test
    void shouldRejectInvalidRefreshTokenWithoutCreatingNewSession() {
        when(refreshTokenStore.consumeToken("revoked-refresh-token")).thenReturn(null);

        IllegalArgumentException exception = assertThrows(
            IllegalArgumentException.class,
            () -> service.refreshSession("revoked-refresh-token", "127.0.0.1")
        );

        assertEquals("Refresh session is invalid", exception.getMessage());
        verify(userMapper, never()).selectById(anyLong());
        verify(securityAuditService).log(eq("USER_SESSION_REFRESH_FAILED"), eq("USER"), eq(null), eq(null), eq("127.0.0.1"), eq("invalid refresh token"));
    }

    @Test
    void shouldConsumeRefreshTokenAndCreateNewSessionForActiveUser() {
        User user = activeUser();
        when(refreshTokenStore.consumeToken("valid-refresh-token")).thenReturn(42L);
        when(userMapper.selectById(42L)).thenReturn(user);

        UserSessionDTO session = service.refreshSession("valid-refresh-token", "127.0.0.1");

        assertNotNull(session.getAccessToken());
        assertNotEquals("valid-refresh-token", session.getRefreshToken());
        assertEquals(42L, session.getUser().getId());
        verify(refreshTokenStore).consumeToken("valid-refresh-token");
        verify(refreshTokenStore).saveToken(eq(42L), eq(session.getRefreshToken()), eq(86400L));
        verify(securityAuditService).log(eq("USER_SESSION_REFRESHED"), eq("USER"), eq(42L), eq("user@example.com"), eq("127.0.0.1"), eq(null));
    }

    private static User activeUser() {
        User user = new User();
        user.setId(42L);
        user.setEmail("user@example.com");
        user.setDisplayName("User");
        user.setStatus(1);
        user.setDeleted(0);
        return user;
    }
}

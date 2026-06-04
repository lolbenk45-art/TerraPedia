package com.terraria.skills.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.config.MinioConnectionDetails;
import com.terraria.skills.auth.LoginRateLimitService;
import com.terraria.skills.auth.RegisterVerificationService;
import com.terraria.skills.auth.UserAuthProperties;
import com.terraria.skills.auth.UserJwtService;
import com.terraria.skills.auth.UserRefreshTokenStoreService;
import com.terraria.skills.dto.FileUploadResultDTO;
import com.terraria.skills.dto.UserSessionDTO;
import com.terraria.skills.entity.User;
import com.terraria.skills.mapper.UserMapper;
import com.terraria.skills.service.ObjectStorageService;
import com.terraria.skills.service.SecurityAuditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserAuthServiceImplTest {

    private UserMapper userMapper;
    private UserRefreshTokenStoreService refreshTokenStore;
    private ObjectStorageService objectStorageService;
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
        objectStorageService = mock(ObjectStorageService.class);
        securityAuditService = mock(SecurityAuditService.class);

        service = new UserAuthServiceImpl(
            userMapper,
            new UserJwtService(properties, new ObjectMapper()),
            refreshTokenStore,
            properties,
            mock(LoginRateLimitService.class),
            mock(RegisterVerificationService.class),
            securityAuditService,
            objectStorageService,
            new UserAvatarUrlResolver(emptyMinioConnectionDetailsProvider())
        );
    }

    private ObjectProvider<MinioConnectionDetails> emptyMinioConnectionDetailsProvider() {
        ObjectProvider<MinioConnectionDetails> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(null);
        return provider;
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

    @Test
    void shouldCleanPreviousAvatarObjectAfterSuccessfulReplacement() {
        User user = activeUser();
        user.setAvatarObjectKey("avatars/42/2026/06/04/old.png");
        when(userMapper.selectById(42L)).thenReturn(user);
        when(objectStorageService.uploadUserAvatar(any(MultipartFile.class), eq(42L), eq("image/png"), eq(".png")))
            .thenReturn(uploadResult("avatars/42/2026/06/04/new.png"));

        service.uploadAvatar(42L, onePixelPngFile(), "127.0.0.1");

        verify(userMapper).updateAvatar(eq(42L), eq("http://localhost:9000/terrapedia-images/avatars/42/2026/06/04/new.png"), eq("avatars/42/2026/06/04/new.png"), org.mockito.ArgumentMatchers.any());
        verify(objectStorageService).deleteUserAvatarObject(42L, "avatars/42/2026/06/04/old.png");
    }

    @Test
    void shouldCleanPreviousAvatarObjectAfterDeleteAvatar() {
        User user = activeUser();
        user.setAvatarObjectKey("avatars/42/2026/06/04/old.png");
        when(userMapper.selectById(42L)).thenReturn(user);

        service.deleteAvatar(42L, "127.0.0.1");

        verify(userMapper).clearAvatar(42L);
        verify(objectStorageService).deleteUserAvatarObject(42L, "avatars/42/2026/06/04/old.png");
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

    private static FileUploadResultDTO uploadResult(String objectKey) {
        FileUploadResultDTO result = new FileUploadResultDTO();
        result.setBucket("terrapedia-images");
        result.setObjectKey(objectKey);
        result.setUrl("http://localhost:9000/terrapedia-images/" + objectKey);
        result.setContentType("image/png");
        result.setSize(onePixelPng().length);
        return result;
    }

    private static MockMultipartFile onePixelPngFile() {
        return new MockMultipartFile("file", "avatar.png", "image/png", onePixelPng());
    }

    private static byte[] onePixelPng() {
        return Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        );
    }
}

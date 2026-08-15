package com.terraria.skills.service.impl;

import com.terraria.skills.config.MinioConnectionDetails;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class UserAvatarUrlResolverTest {

    private final UserAvatarUrlResolver resolver = new UserAvatarUrlResolver(connectionDetailsProvider(new MinioConnectionDetails(
        "http://127.0.0.1:9000",
        "http://localhost:9000",
        "minio",
        "minio123",
        "terrapedia-images",
        "items",
        true,
        true,
        true,
        1024 * 1024
    )));

    @Test
    void shouldExposeAvatarThroughSameOriginApiProxy() {
        String avatarUrl = "http://localhost:9000/terrapedia-images/avatars/3/2026/06/04/avatar.png";

        String resolved = resolver.resolveProfileAvatarUrl(avatarUrl, "avatars/3/2026/06/04/avatar.png");

        assertEquals("/api/files/objects/avatars/3/2026/06/04/avatar.png", resolved);
    }

    @Test
    void shouldFallBackToObjectKeyWhenStoredUrlIsMissing() {
        String resolved = resolver.resolveProfileAvatarUrl(null, "avatars/3/2026/06/04/avatar.png");

        assertEquals("/api/files/objects/avatars/3/2026/06/04/avatar.png", resolved);
    }

    @Test
    void shouldKeepNonMinioExternalAvatarUrlUnchanged() {
        String avatarUrl = "https://cdn.example.com/avatar.png";

        String resolved = resolver.resolveProfileAvatarUrl(avatarUrl, null);

        assertEquals(avatarUrl, resolved);
    }

    @Test
    void shouldReturnNullWhenAvatarIsMissing() {
        assertNull(resolver.resolveProfileAvatarUrl(null, null));
    }

    @Test
    void shouldWorkWhenMinioConnectionDetailsAreMissing() {
        UserAvatarUrlResolver resolverWithoutMinio = new UserAvatarUrlResolver(connectionDetailsProvider(null));

        String avatarUrl = "https://cdn.example.com/avatar.png";

        assertEquals(avatarUrl, resolverWithoutMinio.resolveProfileAvatarUrl(avatarUrl, null));
        assertNull(resolverWithoutMinio.resolveProfileAvatarUrl(null, null));
    }

    private ObjectProvider<MinioConnectionDetails> connectionDetailsProvider(MinioConnectionDetails connectionDetails) {
        ObjectProvider<MinioConnectionDetails> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(connectionDetails);
        return provider;
    }
}

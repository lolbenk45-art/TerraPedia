package com.terraria.skills.service.impl;

import com.terraria.skills.config.MinioConnectionDetails;
import com.terraria.skills.config.MinioStorageProperties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MinioManagedImageUrlPolicyTest {

    @Test
    void shouldAllowOnlyConfiguredMinioOriginsAndObjectPrefix() {
        MinioManagedImageUrlPolicy policy = new MinioManagedImageUrlPolicy(
            new MinioStorageProperties(),
            connectionDetailsProvider(connectionDetails("http://minio:9000", "https://cdn.example.com"))
        );

        assertTrue(policy.isManagedImageUrl("https://cdn.example.com/terrapedia-images/items/night-edge.png"));
        assertTrue(policy.isManagedImageUrl("http://minio:9000/terrapedia-images/items/night-edge.png"));
        assertFalse(policy.isManagedImageUrl("https://example.com/terrapedia-images/items/night-edge.png"));
        assertFalse(policy.isManagedImageUrl("https://cdn.example.com/terrapedia-images/other/night-edge.png"));
        assertFalse(policy.isManagedImageUrl("//cdn.example.com/terrapedia-images/items/night-edge.png"));
        assertFalse(policy.isManagedImageUrl("https://user@cdn.example.com/terrapedia-images/items/night-edge.png"));
    }

    @Test
    void shouldBuildTrustedPrefixesFromConfiguredEndpoints() {
        MinioManagedImageUrlPolicy policy = new MinioManagedImageUrlPolicy(
            new MinioStorageProperties(),
            connectionDetailsProvider(connectionDetails("http://minio:9000/", "https://cdn.example.com/"))
        );

        assertEquals(
            List.of(
                "https://cdn.example.com/terrapedia-images/items/",
                "http://minio:9000/terrapedia-images/items/"
            ),
            policy.trustedManagedImageUrlPrefixes()
        );
    }

    @Test
    void shouldFailClosedWhenNoEndpointIsConfigured() {
        MinioStorageProperties properties = new MinioStorageProperties();

        MinioManagedImageUrlPolicy policy = new MinioManagedImageUrlPolicy(
            properties,
            connectionDetailsProvider(null)
        );

        assertEquals(List.of(), policy.trustedManagedImageUrlPrefixes());
        assertFalse(policy.isManagedImageUrl("http://localhost:9000/terrapedia-images/items/night-edge.png"));
    }

    @SuppressWarnings("unchecked")
    private ObjectProvider<MinioConnectionDetails> connectionDetailsProvider(MinioConnectionDetails connectionDetails) {
        ObjectProvider<MinioConnectionDetails> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(connectionDetails);
        return provider;
    }

    private MinioConnectionDetails connectionDetails(String endpoint, String publicEndpoint) {
        return new MinioConnectionDetails(
            endpoint,
            publicEndpoint,
            "minio",
            "minio123",
            "terrapedia-images",
            "items",
            true,
            false,
            true,
            1024 * 1024
        );
    }
}

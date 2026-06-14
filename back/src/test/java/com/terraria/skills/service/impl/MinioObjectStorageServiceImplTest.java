package com.terraria.skills.service.impl;

import com.terraria.skills.config.MinioConnectionDetails;
import io.minio.BucketExistsArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MinioObjectStorageServiceImplTest {

    @Test
    void shouldWriteNpcUploadsUnderNpcPrefix() throws Exception {
        MinioClient minioClient = mock(MinioClient.class);
        when(minioClient.bucketExists(any(BucketExistsArgs.class))).thenReturn(true);
        MinioObjectStorageServiceImpl service = new MinioObjectStorageServiceImpl(
            minioClient,
            new MinioConnectionDetails(
                "http://localhost:9000",
                "http://localhost:9000",
                "minio",
                "minio123",
                "terrapedia-images",
                "items",
                true,
                false,
                true,
                1024 * 1024
            )
        );

        MockMultipartFile file = new MockMultipartFile("file", "eye.png", "image/png", onePixelPng());
        service.uploadItemImage(file, "npcs");

        verify(minioClient).putObject(any(PutObjectArgs.class));
        verify(minioClient).putObject(argThat(args -> args.object().startsWith("npcs/")));
    }

    @Test
    void shouldWriteBossUploadsUnderBossPrefix() throws Exception {
        MinioClient minioClient = mock(MinioClient.class);
        when(minioClient.bucketExists(any(BucketExistsArgs.class))).thenReturn(true);
        MinioObjectStorageServiceImpl service = new MinioObjectStorageServiceImpl(
            minioClient,
            new MinioConnectionDetails(
                "http://localhost:9000",
                "http://localhost:9000",
                "minio",
                "minio123",
                "terrapedia-images",
                "items",
                true,
                false,
                true,
                1024 * 1024
            )
        );

        MockMultipartFile file = new MockMultipartFile("file", "king-slime.png", "image/png", onePixelPng());
        service.uploadItemImage(file, "bosses");

        verify(minioClient).putObject(any(PutObjectArgs.class));
        verify(minioClient).putObject(argThat(args -> args.object().startsWith("bosses/")));
    }

    @Test
    void shouldRejectSvgUploadsForManagedImages() throws Exception {
        MinioClient minioClient = mock(MinioClient.class);
        MinioObjectStorageServiceImpl service = new MinioObjectStorageServiceImpl(minioClient, connectionDetails());
        MockMultipartFile file = new MockMultipartFile(
            "file",
            "bad.svg",
            "image/svg+xml",
            "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>".getBytes()
        );

        assertThrows(IllegalArgumentException.class, () -> service.uploadItemImage(file, "items"));

        verify(minioClient, never()).putObject(any(PutObjectArgs.class));
    }

    @Test
    void shouldRejectSpoofedPngUploadsForManagedImages() throws Exception {
        MinioClient minioClient = mock(MinioClient.class);
        MinioObjectStorageServiceImpl service = new MinioObjectStorageServiceImpl(minioClient, connectionDetails());
        MockMultipartFile file = new MockMultipartFile("file", "bad.png", "image/png", new byte[] {1, 2, 3});

        assertThrows(IllegalArgumentException.class, () -> service.uploadItemImage(file, "items"));

        verify(minioClient, never()).putObject(any(PutObjectArgs.class));
    }

    @Test
    void shouldUseValidatedImageTypeForObjectKeyAndResult() throws Exception {
        MinioClient minioClient = mock(MinioClient.class);
        when(minioClient.bucketExists(any(BucketExistsArgs.class))).thenReturn(true);
        MinioObjectStorageServiceImpl service = new MinioObjectStorageServiceImpl(minioClient, connectionDetails());
        MockMultipartFile file = new MockMultipartFile("file", "misleading.gif", "image/png", onePixelPng());

        var result = service.uploadItemImage(file, "items");

        assertTrue(result.getObjectKey().endsWith(".png"));
        assertEquals("image/png", result.getContentType());
        verify(minioClient).putObject(argThat(args -> args.object().endsWith(".png")));
    }

    @Test
    void shouldDeleteOnlyOwnedAvatarObjects() throws Exception {
        MinioClient minioClient = mock(MinioClient.class);
        MinioObjectStorageServiceImpl service = new MinioObjectStorageServiceImpl(
            minioClient,
            connectionDetails()
        );

        service.deleteUserAvatarObject(42L, "avatars/42/2026/06/04/old.png");

        verify(minioClient).removeObject(removeArgThat(args -> args.object().equals("avatars/42/2026/06/04/old.png")));
    }

    @Test
    void shouldIgnoreAvatarDeleteOutsideOwnedPrefix() throws Exception {
        MinioClient minioClient = mock(MinioClient.class);
        MinioObjectStorageServiceImpl service = new MinioObjectStorageServiceImpl(
            minioClient,
            connectionDetails()
        );

        service.deleteUserAvatarObject(42L, "avatars/99/2026/06/04/old.png");
        service.deleteUserAvatarObject(42L, "items/old.png");
        service.deleteUserAvatarObject(42L, "avatars/42/../99/old.png");

        verify(minioClient, never()).removeObject(any(RemoveObjectArgs.class));
    }

    private static PutObjectArgs argThat(org.mockito.ArgumentMatcher<PutObjectArgs> matcher) {
        return org.mockito.ArgumentMatchers.argThat(matcher);
    }

    private static RemoveObjectArgs removeArgThat(org.mockito.ArgumentMatcher<RemoveObjectArgs> matcher) {
        return org.mockito.ArgumentMatchers.argThat(matcher);
    }

    private static MinioConnectionDetails connectionDetails() {
        return new MinioConnectionDetails(
            "http://localhost:9000",
            "http://localhost:9000",
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

    private static byte[] onePixelPng() {
        return Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        );
    }
}

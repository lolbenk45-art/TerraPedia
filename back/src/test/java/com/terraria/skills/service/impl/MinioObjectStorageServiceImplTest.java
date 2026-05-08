package com.terraria.skills.service.impl;

import com.terraria.skills.config.MinioConnectionDetails;
import io.minio.BucketExistsArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
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

        MockMultipartFile file = new MockMultipartFile("file", "eye.png", "image/png", new byte[] {1, 2, 3});
        service.uploadItemImage(file, "npcs");

        verify(minioClient).putObject(any(PutObjectArgs.class));
        verify(minioClient).putObject(argThat(args -> args.object().startsWith("npcs/")));
    }

    private static PutObjectArgs argThat(org.mockito.ArgumentMatcher<PutObjectArgs> matcher) {
        return org.mockito.ArgumentMatchers.argThat(matcher);
    }
}

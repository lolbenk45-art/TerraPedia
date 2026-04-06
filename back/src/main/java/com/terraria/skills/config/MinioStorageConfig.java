package com.terraria.skills.config;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.minio.MinioClient;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;

@Configuration
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "terraria.storage.minio", name = "enabled", havingValue = "true")
public class MinioStorageConfig {

    private final ObjectMapper objectMapper;
    private final MinioStorageProperties properties;

    @Bean
    public MinioConnectionDetails minioConnectionDetails() throws IOException {
        CredentialsFile credentials = loadCredentials(Path.of(properties.getCredentialsFile()));

        String endpoint = StringUtils.hasText(properties.getEndpoint())
            ? trimTrailingSlash(properties.getEndpoint())
            : deriveS3Endpoint(credentials.url());
        String publicEndpoint = StringUtils.hasText(properties.getPublicEndpoint())
            ? trimTrailingSlash(properties.getPublicEndpoint())
            : endpoint;

        return new MinioConnectionDetails(
            endpoint,
            publicEndpoint,
            credentials.accessKey(),
            credentials.secretKey(),
            properties.getBucket(),
            properties.getObjectPrefix(),
            properties.isEnabled(),
            properties.isAutoCreateBucket(),
            properties.isPublicRead(),
            properties.getMaxFileSize()
        );
    }

    @Bean
    public MinioClient minioClient(MinioConnectionDetails details) {
        return MinioClient.builder()
            .endpoint(details.endpoint())
            .credentials(details.accessKey(), details.secretKey())
            .build();
    }

    private CredentialsFile loadCredentials(Path configuredPath) throws IOException {
        Path[] candidates = new Path[] {
            configuredPath,
            configuredPath.toAbsolutePath(),
            Path.of(System.getProperty("user.dir")).resolve(configuredPath).normalize(),
            Path.of(System.getProperty("user.dir")).resolve("..").resolve(configuredPath).normalize()
        };

        for (Path candidate : candidates) {
            if (Files.exists(candidate)) {
                return objectMapper.readValue(candidate.toFile(), CredentialsFile.class);
            }
        }

        throw new IOException("MinIO credentials file not found: " + configuredPath);
    }

    private String deriveS3Endpoint(String consoleUrl) {
        URI uri = URI.create(consoleUrl);
        int port = uri.getPort();
        int s3Port = port == 9001 ? 9000 : port;
        URI endpoint = URI.create(uri.getScheme() + "://" + uri.getHost() + (s3Port > 0 ? ":" + s3Port : ""));
        return trimTrailingSlash(endpoint.toString());
    }

    private String trimTrailingSlash(String value) {
        if (value == null) {
            return null;
        }
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record CredentialsFile(
        String url,
        String accessKey,
        String secretKey
    ) {
    }
}

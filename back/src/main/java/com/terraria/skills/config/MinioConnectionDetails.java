package com.terraria.skills.config;

public record MinioConnectionDetails(
    String endpoint,
    String publicEndpoint,
    String accessKey,
    String secretKey,
    String bucket,
    String objectPrefix,
    boolean enabled,
    boolean autoCreateBucket,
    boolean publicRead,
    long maxFileSize
) {
}

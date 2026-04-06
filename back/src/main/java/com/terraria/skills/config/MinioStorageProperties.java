package com.terraria.skills.config;

import jakarta.annotation.PostConstruct;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Data
@Component
@ConfigurationProperties(prefix = "terraria.storage.minio")
public class MinioStorageProperties {

    private boolean enabled = false;

    /**
     * Path to the local credentials JSON provided by MinIO.
     */
    private String credentialsFile;

    /**
     * S3 endpoint. If blank, it will be derived from the credentials console URL.
     */
    private String endpoint;

    /**
     * Public endpoint used to assemble object URLs.
     */
    private String publicEndpoint;

    private String bucket = "terrapedia-images";

    private String objectPrefix = "items";

    private boolean autoCreateBucket = true;

    private boolean publicRead = true;

    private long maxFileSize = 5 * 1024 * 1024;

    @PostConstruct
    void validate() {
        if (enabled && !StringUtils.hasText(credentialsFile)) {
            throw new IllegalStateException("Missing required property: terraria.storage.minio.credentials-file");
        }
    }
}

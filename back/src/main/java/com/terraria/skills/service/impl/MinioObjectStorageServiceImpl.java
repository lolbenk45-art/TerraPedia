package com.terraria.skills.service.impl;

import com.terraria.skills.config.MinioConnectionDetails;
import com.terraria.skills.dto.FileUploadResultDTO;
import com.terraria.skills.service.ObjectStorageService;
import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.SetBucketPolicyArgs;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.time.LocalDate;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

@Slf4j
@Service
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "terraria.storage.minio", name = "enabled", havingValue = "true", matchIfMissing = true)
public class MinioObjectStorageServiceImpl implements ObjectStorageService {

    private final MinioClient minioClient;
    private final MinioConnectionDetails connectionDetails;
    private final AtomicBoolean bucketReady = new AtomicBoolean(false);

    @PostConstruct
    public void init() {
        if (!connectionDetails.enabled()) {
            log.info("MinIO storage is disabled");
            return;
        }

        if (connectionDetails.autoCreateBucket()) {
            ensureBucketReady();
        }
    }

    @Override
    public FileUploadResultDTO uploadItemImage(MultipartFile file) {
        return uploadItemImage(file, null);
    }

    @Override
    public FileUploadResultDTO uploadItemImage(MultipartFile file, String entityDomain) {
        if (!connectionDetails.enabled()) {
            throw new IllegalStateException("MinIO storage is disabled");
        }
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("请选择要上传的图片文件");
        }
        if (file.getSize() > connectionDetails.maxFileSize()) {
            throw new IllegalArgumentException("图片文件过大，当前限制为 " + (connectionDetails.maxFileSize() / 1024 / 1024) + " MB");
        }

        String contentType = file.getContentType();
        if (!StringUtils.hasText(contentType) || !contentType.toLowerCase(Locale.ROOT).startsWith("image/")) {
            throw new IllegalArgumentException("仅支持图片文件上传");
        }

        ensureBucketReady();

        String objectKey = buildObjectKey(file.getOriginalFilename(), contentType, entityDomain);

        try (InputStream inputStream = file.getInputStream()) {
            minioClient.putObject(
                PutObjectArgs.builder()
                    .bucket(connectionDetails.bucket())
                    .object(objectKey)
                    .stream(inputStream, file.getSize(), -1)
                    .contentType(contentType)
                    .build()
            );
        } catch (Exception e) {
            throw new IllegalStateException("上传图片到 MinIO 失败: " + e.getMessage(), e);
        }

        FileUploadResultDTO result = new FileUploadResultDTO();
        result.setBucket(connectionDetails.bucket());
        result.setObjectKey(objectKey);
        result.setUrl(buildPublicObjectUrl(objectKey));
        result.setOriginalFilename(file.getOriginalFilename());
        result.setContentType(contentType);
        result.setSize(file.getSize());
        return result;
    }

    private void ensureBucketReady() {
        if (bucketReady.get()) {
            return;
        }

        synchronized (bucketReady) {
            if (bucketReady.get()) {
                return;
            }

            try {
                boolean exists = minioClient.bucketExists(
                    BucketExistsArgs.builder().bucket(connectionDetails.bucket()).build()
                );
                if (!exists) {
                    minioClient.makeBucket(
                        MakeBucketArgs.builder().bucket(connectionDetails.bucket()).build()
                    );
                }

                if (connectionDetails.publicRead()) {
                    minioClient.setBucketPolicy(
                        SetBucketPolicyArgs.builder()
                            .bucket(connectionDetails.bucket())
                            .config(buildPublicReadPolicy(connectionDetails.bucket()))
                            .build()
                    );
                }

                bucketReady.set(true);
            } catch (Exception e) {
                throw new IllegalStateException("初始化 MinIO bucket 失败: " + e.getMessage(), e);
            }
        }
    }

    private String buildObjectKey(String originalFilename, String contentType, String entityDomain) {
        LocalDate today = LocalDate.now();
        String extension = resolveExtension(originalFilename, contentType);
        String prefix = resolveObjectPrefix(entityDomain);

        return prefix
            + "/"
            + today.getYear()
            + "/"
            + String.format("%02d", today.getMonthValue())
            + "/"
            + String.format("%02d", today.getDayOfMonth())
            + "/"
            + UUID.randomUUID().toString().replace("-", "")
            + extension;
    }

    private String resolveObjectPrefix(String entityDomain) {
        String normalizedDomain = trimToNull(entityDomain);
        if (normalizedDomain != null) {
            String lowered = normalizedDomain.toLowerCase(Locale.ROOT);
            if ("items".equals(lowered) || "npcs".equals(lowered) || "projectiles".equals(lowered)) {
                return lowered;
            }
        }
        return StringUtils.hasText(connectionDetails.objectPrefix())
            ? connectionDetails.objectPrefix().replaceAll("^/+|/+$", "")
            : "items";
    }

    private String resolveExtension(String originalFilename, String contentType) {
        if (StringUtils.hasText(originalFilename) && originalFilename.contains(".")) {
            return originalFilename.substring(originalFilename.lastIndexOf('.')).toLowerCase(Locale.ROOT);
        }

        return switch (contentType.toLowerCase(Locale.ROOT)) {
            case "image/jpeg" -> ".jpg";
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            case "image/gif" -> ".gif";
            case "image/svg+xml" -> ".svg";
            default -> ".bin";
        };
    }

    private String buildPublicReadPolicy(String bucket) {
        return """
            {
              "Version":"2012-10-17",
              "Statement":[
                {
                  "Effect":"Allow",
                  "Principal":{"AWS":["*"]},
                  "Action":["s3:GetObject"],
                  "Resource":["arn:aws:s3:::%s/*"]
                }
              ]
            }
            """.formatted(bucket);
    }

    private String buildPublicObjectUrl(String objectKey) {
        String endpoint = normalizePublicEndpoint(connectionDetails.publicEndpoint());
        return endpoint + "/" + connectionDetails.bucket() + "/" + objectKey;
    }

    private String normalizePublicEndpoint(String endpoint) {
        String value = trimToNull(endpoint);
        if (value == null) {
            throw new IllegalStateException("MinIO public endpoint is not configured");
        }

        if (value.startsWith("http://") || value.startsWith("https://")) {
            return trimTrailingSlash(value);
        }

        if (value.startsWith("//")) {
            return "https:" + trimTrailingSlash(value);
        }

        return "http://" + trimTrailingSlash(value);
    }

    private String trimTrailingSlash(String value) {
        String normalized = value;
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}

package com.terraria.skills.service.impl;

import com.terraria.skills.common.AdminTextUtils;

import com.terraria.skills.config.MinioConnectionDetails;
import com.terraria.skills.dto.FileUploadResultDTO;
import com.terraria.skills.dto.StoredObjectDTO;
import com.terraria.skills.service.ObjectStorageService;
import com.terraria.skills.service.UserAvatarValidator;
import io.minio.BucketExistsArgs;
import io.minio.GetObjectArgs;
import io.minio.MakeBucketArgs;
import io.minio.StatObjectArgs;
import io.minio.StatObjectResponse;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.SetBucketPolicyArgs;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDate;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

@Slf4j
@Service
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "terraria.storage.minio", name = "enabled", havingValue = "true")
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
    public StoredObjectDTO getObject(String objectKey) {
        String normalizedObjectKey = normalizeReadableObjectKey(objectKey);
        try {
            StatObjectResponse stat = minioClient.statObject(
                StatObjectArgs.builder()
                    .bucket(connectionDetails.bucket())
                    .object(normalizedObjectKey)
                    .build()
            );
            return StoredObjectDTO.builder()
                .inputStream(minioClient.getObject(
                    GetObjectArgs.builder()
                        .bucket(connectionDetails.bucket())
                        .object(normalizedObjectKey)
                        .build()
                ))
                .contentType(stat.contentType())
                .size(stat.size())
                .build();
        } catch (Exception e) {
            throw new IllegalArgumentException("图片文件不存在或不可读取");
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

        UserAvatarValidator.AvatarImage validatedImage = validateManagedImage(file);
        String contentType = validatedImage.contentType();

        ensureBucketReady();

        String objectKey = buildObjectKey(validatedImage.extension(), entityDomain);

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

    @Override
    public FileUploadResultDTO uploadUserAvatar(MultipartFile file, Long userId, String contentType, String extension) {
        if (!connectionDetails.enabled()) {
            throw new IllegalStateException("MinIO storage is disabled");
        }
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Avatar file is required");
        }
        if (userId == null || userId <= 0) {
            throw new IllegalArgumentException("Invalid user id");
        }
        ensureBucketReady();

        String objectKey = buildAvatarObjectKey(userId, extension);
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
            throw new IllegalStateException("上传头像到 MinIO 失败: " + e.getMessage(), e);
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

    @Override
    public void deleteUserAvatarObject(Long userId, String objectKey) {
        String normalizedObjectKey = normalizeOwnedAvatarObjectKey(userId, objectKey);
        if (normalizedObjectKey == null) {
            return;
        }

        try {
            minioClient.removeObject(
                RemoveObjectArgs.builder()
                    .bucket(connectionDetails.bucket())
                    .object(normalizedObjectKey)
                    .build()
            );
        } catch (Exception exception) {
            log.warn("Failed to delete user avatar object userId={} objectKey={}", userId, normalizedObjectKey, exception);
        }
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

    private String buildObjectKey(String extension, String entityDomain) {
        LocalDate today = LocalDate.now();
        String normalizedExtension = StringUtils.hasText(extension) && extension.startsWith(".") ? extension : ".bin";
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
            + normalizedExtension;
    }

    private UserAvatarValidator.AvatarImage validateManagedImage(MultipartFile file) {
        if ("image/gif".equals(normalizeContentType(file.getContentType()))) {
            return validateGifImage(file);
        }
        try {
            return UserAvatarValidator.validateAndResolve(file);
        } catch (IllegalArgumentException exception) {
            throw invalidManagedImage();
        }
    }

    private UserAvatarValidator.AvatarImage validateGifImage(MultipartFile file) {
        try {
            byte[] bytes = file.getBytes();
            if (!hasGifSignature(bytes) || ImageIO.read(new ByteArrayInputStream(bytes)) == null) {
                throw invalidManagedImage();
            }
            return new UserAvatarValidator.AvatarImage("image/gif", ".gif");
        } catch (IOException exception) {
            throw invalidManagedImage();
        }
    }

    private boolean hasGifSignature(byte[] bytes) {
        return bytes.length >= 6
            && bytes[0] == 'G'
            && bytes[1] == 'I'
            && bytes[2] == 'F'
            && bytes[3] == '8'
            && (bytes[4] == '7' || bytes[4] == '9')
            && bytes[5] == 'a';
    }

    private String normalizeContentType(String contentType) {
        return StringUtils.hasText(contentType) ? contentType.trim().toLowerCase(Locale.ROOT) : "";
    }

    private IllegalArgumentException invalidManagedImage() {
        return new IllegalArgumentException("仅支持有效的 JPEG、PNG、WebP 或 GIF 图片文件");
    }

    private String normalizeReadableObjectKey(String objectKey) {
        String normalized = AdminTextUtils.trimToNull(objectKey);
        if (normalized == null) {
            throw new IllegalArgumentException("Object key is required");
        }
        normalized = normalized.replace("\\", "/").replaceAll("^/+", "");
        if (normalized.contains("..")) {
            throw new IllegalArgumentException("Invalid object key");
        }
        if (
            !normalized.startsWith("avatars/")
                && !normalized.startsWith("items/")
                && !normalized.startsWith("npcs/")
                && !normalized.startsWith("projectiles/")
                && !normalized.startsWith("buffs/")
                && !normalized.startsWith("bosses/")
                && !normalized.startsWith("articles/")
        ) {
            throw new IllegalArgumentException("Unsupported object key");
        }
        return normalized;
    }

    private String buildAvatarObjectKey(Long userId, String extension) {
        LocalDate today = LocalDate.now();
        String normalizedExtension = StringUtils.hasText(extension) && extension.startsWith(".") ? extension : ".bin";
        return "avatars/"
            + userId
            + "/"
            + today.getYear()
            + "/"
            + String.format("%02d", today.getMonthValue())
            + "/"
            + String.format("%02d", today.getDayOfMonth())
            + "/"
            + UUID.randomUUID().toString().replace("-", "")
            + normalizedExtension;
    }

    private String normalizeOwnedAvatarObjectKey(Long userId, String objectKey) {
        if (userId == null || userId <= 0) {
            return null;
        }
        String normalized = AdminTextUtils.trimToNull(objectKey);
        if (normalized == null) {
            return null;
        }
        normalized = normalized.replace("\\", "/").replaceAll("^/+", "");
        String ownedPrefix = "avatars/" + userId + "/";
        if (normalized.contains("..") || !normalized.startsWith(ownedPrefix)) {
            return null;
        }
        return normalized;
    }

    private String resolveObjectPrefix(String entityDomain) {
        String normalizedDomain = AdminTextUtils.trimToNull(entityDomain);
        if (normalizedDomain != null) {
            String lowered = normalizedDomain.toLowerCase(Locale.ROOT);
            if ("items".equals(lowered) || "npcs".equals(lowered) || "projectiles".equals(lowered) || "buffs".equals(lowered) || "bosses".equals(lowered) || "articles".equals(lowered)) {
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
        String value = AdminTextUtils.trimToNull(endpoint);
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

}

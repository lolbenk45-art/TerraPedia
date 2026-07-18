package com.terraria.skills.service.impl;

import com.terraria.skills.common.AdminTextUtils;

import com.terraria.skills.config.MinioConnectionDetails;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriUtils;

import java.nio.charset.StandardCharsets;

@Component
public class UserAvatarUrlResolver {

    private static final String PUBLIC_OBJECT_PROXY_PREFIX = "/api/files/objects/";

    private final ObjectProvider<MinioConnectionDetails> connectionDetailsProvider;

    public UserAvatarUrlResolver(ObjectProvider<MinioConnectionDetails> connectionDetailsProvider) {
        this.connectionDetailsProvider = connectionDetailsProvider;
    }

    public String resolveProfileAvatarUrl(String avatarUrl, String avatarObjectKey) {
        String normalizedObjectKey = normalizeAvatarObjectKey(avatarObjectKey);
        if (normalizedObjectKey != null) {
            return buildProxyUrl(normalizedObjectKey);
        }

        String normalizedUrl = AdminTextUtils.trimToNull(avatarUrl);
        if (normalizedUrl == null) {
            return null;
        }

        String objectKey = extractObjectKeyFromPublicUrl(normalizedUrl);
        if (objectKey != null && objectKey.startsWith("avatars/")) {
            return buildProxyUrl(objectKey);
        }

        return normalizedUrl;
    }

    private String extractObjectKeyFromPublicUrl(String avatarUrl) {
        MinioConnectionDetails connectionDetails = connectionDetailsProvider.getIfAvailable();
        if (connectionDetails == null) {
            return null;
        }
        String publicPrefix = trimTrailingSlash(connectionDetails.publicEndpoint()) + "/" + connectionDetails.bucket() + "/";
        if (!avatarUrl.startsWith(publicPrefix)) {
            return null;
        }
        return normalizeAvatarObjectKey(avatarUrl.substring(publicPrefix.length()));
    }

    private String normalizeAvatarObjectKey(String objectKey) {
        String normalized = AdminTextUtils.trimToNull(objectKey);
        if (normalized == null) {
            return null;
        }
        normalized = normalized.replace("\\", "/").replaceAll("^/+", "");
        if (normalized.contains("..") || !normalized.startsWith("avatars/")) {
            return null;
        }
        return normalized;
    }

    private String buildProxyUrl(String objectKey) {
        return PUBLIC_OBJECT_PROXY_PREFIX + UriUtils.encodePath(objectKey, StandardCharsets.UTF_8);
    }

    private String trimTrailingSlash(String value) {
        String normalized = AdminTextUtils.trimToNull(value);
        if (normalized == null) {
            return "";
        }
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

}

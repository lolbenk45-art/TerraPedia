package com.terraria.skills.service.impl;

import com.terraria.skills.config.MinioConnectionDetails;
import com.terraria.skills.config.MinioStorageProperties;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class MinioManagedImageUrlPolicy implements ManagedImageUrlPolicy {

    private final MinioStorageProperties properties;
    private final org.springframework.beans.factory.ObjectProvider<MinioConnectionDetails> connectionDetailsProvider;

    @Override
    public boolean isManagedImageUrl(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return false;
        }
        URI uri = parseHttpUri(normalized);
        if (uri == null || uri.getHost() == null || uri.getPath() == null) {
            return false;
        }
        for (String prefix : trustedManagedImageUrlPrefixes()) {
            URI trustedPrefix = parseHttpUri(prefix);
            if (sameOrigin(uri, trustedPrefix) && startsWithPath(uri.getPath(), trustedPrefix.getPath())) {
                return true;
            }
        }
        return false;
    }

    @Override
    public List<String> trustedManagedImageUrlPrefixes() {
        LinkedHashSet<String> prefixes = new LinkedHashSet<>();
        MinioConnectionDetails connectionDetails = connectionDetailsProvider.getIfAvailable();
        if (connectionDetails != null) {
            addPrefix(prefixes, connectionDetails.publicEndpoint(), connectionDetails.bucket(), connectionDetails.objectPrefix());
            addPrefix(prefixes, connectionDetails.endpoint(), connectionDetails.bucket(), connectionDetails.objectPrefix());
        } else {
            addPrefix(prefixes, properties.getPublicEndpoint(), properties.getBucket(), properties.getObjectPrefix());
            addPrefix(prefixes, properties.getEndpoint(), properties.getBucket(), properties.getObjectPrefix());
        }
        return List.copyOf(prefixes);
    }

    private void addPrefix(LinkedHashSet<String> prefixes, String endpoint, String bucket, String objectPrefix) {
        String normalizedEndpoint = normalizeEndpoint(endpoint);
        String normalizedBucket = trimObjectPath(bucket);
        if (normalizedEndpoint == null || normalizedBucket == null) {
            return;
        }
        List<String> pathParts = new ArrayList<>();
        pathParts.add(normalizedBucket);
        String normalizedObjectPrefix = trimObjectPath(objectPrefix);
        if (normalizedObjectPrefix != null) {
            pathParts.add(normalizedObjectPrefix);
        }
        prefixes.add(normalizedEndpoint + "/" + String.join("/", pathParts) + "/");
    }

    private String normalizeEndpoint(String endpoint) {
        String value = trimToNull(endpoint);
        if (value == null) {
            return null;
        }
        if (value.startsWith("//")) {
            return "https:" + trimTrailingSlash(value);
        }
        if (value.startsWith("http://") || value.startsWith("https://")) {
            return trimTrailingSlash(value);
        }
        return "http://" + trimTrailingSlash(value);
    }

    private URI parseHttpUri(String value) {
        String normalized = trimToNull(value);
        if (normalized == null || normalized.startsWith("//")) {
            return null;
        }
        try {
            URI uri = URI.create(normalized);
            String scheme = uri.getScheme();
            if (scheme == null || uri.getHost() == null || uri.getRawUserInfo() != null) {
                return null;
            }
            String lowerScheme = scheme.toLowerCase(Locale.ROOT);
            return "http".equals(lowerScheme) || "https".equals(lowerScheme) ? uri : null;
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private boolean sameOrigin(URI left, URI right) {
        if (left == null || right == null || left.getHost() == null || right.getHost() == null) {
            return false;
        }
        return left.getHost().equalsIgnoreCase(right.getHost())
            && normalizePort(left) == normalizePort(right)
            && Objects.equals(normalizeScheme(left), normalizeScheme(right));
    }

    private int normalizePort(URI uri) {
        if (uri.getPort() >= 0) {
            return uri.getPort();
        }
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private String normalizeScheme(URI uri) {
        return uri.getScheme() == null ? null : uri.getScheme().toLowerCase(Locale.ROOT);
    }

    private boolean startsWithPath(String value, String prefix) {
        return value != null && prefix != null && value.startsWith(prefix);
    }

    private String trimObjectPath(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        String normalized = value.trim().replace('\\', '/').replaceAll("^/+", "").replaceAll("/+$", "");
        return normalized.isEmpty() ? null : normalized;
    }

    private String trimTrailingSlash(String value) {
        String normalized = value;
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    private String trimToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}

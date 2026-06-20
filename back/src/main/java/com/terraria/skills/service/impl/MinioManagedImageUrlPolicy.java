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
import java.util.Arrays;
import java.util.Optional;
import java.util.Set;

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
            for (String objectPrefix : resolveTrustedObjectPrefixes(connectionDetails.objectPrefix(), properties.getManagedImageObjectPrefixes())) {
                addPrefix(prefixes, connectionDetails.publicEndpoint(), connectionDetails.bucket(), objectPrefix);
                addPrefix(prefixes, connectionDetails.endpoint(), connectionDetails.bucket(), objectPrefix);
            }
        } else {
            for (String objectPrefix : resolveTrustedObjectPrefixes(properties.getObjectPrefix(), properties.getManagedImageObjectPrefixes())) {
                addPrefix(prefixes, properties.getPublicEndpoint(), properties.getBucket(), objectPrefix);
                addPrefix(prefixes, properties.getEndpoint(), properties.getBucket(), objectPrefix);
            }
        }
        return List.copyOf(prefixes);
    }

    @Override
    public Optional<String> normalizeManagedImagePath(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return Optional.empty();
        }
        if (normalized.startsWith("/") && !normalized.startsWith("//")) {
            return normalizeManagedPath(normalized);
        }

        String absoluteValue = normalized.startsWith("//") ? "http:" + normalized : normalized;
        URI uri = parseHttpUri(absoluteValue);
        if (uri == null || uri.getPath() == null) {
            return Optional.empty();
        }
        if (!isTrustedNormalizationOrigin(uri)) {
            return Optional.empty();
        }
        return normalizeManagedPath(uri.getPath());
    }

    private Optional<String> normalizeManagedPath(String path) {
        String normalizedPath = stripQueryAndFragment(trimToNull(path));
        if (normalizedPath == null || !normalizedPath.startsWith("/")) {
            return Optional.empty();
        }
        String bucket = trimObjectPath(resolveBucket());
        if (bucket == null) {
            return Optional.empty();
        }
        String expectedBucket = "/" + bucket + "/";
        if (!normalizedPath.startsWith(expectedBucket)) {
            return Optional.empty();
        }
        String objectPath = normalizedPath.substring(expectedBucket.length());
        String domain = firstPathSegment(objectPath);
        if (domain == null || !managedDomains().contains(domain.toLowerCase(Locale.ROOT))) {
            return Optional.empty();
        }
        return Optional.of(expectedBucket.substring(0, expectedBucket.length() - 1) + "/" + objectPath);
    }

    private boolean isTrustedNormalizationOrigin(URI uri) {
        String origin = originOf(uri);
        if (origin == null) {
            return false;
        }
        if (legacyImageOrigins().contains(origin)) {
            return true;
        }
        for (String endpoint : configuredEndpoints()) {
            URI trusted = parseHttpUri(normalizeEndpoint(endpoint));
            if (sameOrigin(uri, trusted)) {
                return true;
            }
        }
        return false;
    }

    private List<String> configuredEndpoints() {
        LinkedHashSet<String> endpoints = new LinkedHashSet<>();
        MinioConnectionDetails connectionDetails = connectionDetailsProvider.getIfAvailable();
        if (connectionDetails != null) {
            addEndpoint(endpoints, connectionDetails.publicEndpoint());
            addEndpoint(endpoints, connectionDetails.endpoint());
        } else {
            addEndpoint(endpoints, properties.getPublicEndpoint());
            addEndpoint(endpoints, properties.getEndpoint());
        }
        return List.copyOf(endpoints);
    }

    private Set<String> legacyImageOrigins() {
        LinkedHashSet<String> origins = new LinkedHashSet<>();
        for (String raw : splitObjectPrefixes(properties.getLegacyImageOrigins())) {
            String normalized = normalizeEndpoint(raw);
            URI uri = parseHttpUri(normalized);
            String origin = originOf(uri);
            if (origin != null) {
                origins.add(origin);
            }
        }
        return Set.copyOf(origins);
    }

    private void addEndpoint(LinkedHashSet<String> endpoints, String endpoint) {
        String normalized = normalizeEndpoint(endpoint);
        if (normalized != null) {
            endpoints.add(normalized);
        }
    }

    private String resolveBucket() {
        MinioConnectionDetails connectionDetails = connectionDetailsProvider.getIfAvailable();
        if (connectionDetails != null) {
            return connectionDetails.bucket();
        }
        return properties.getBucket();
    }

    private Set<String> managedDomains() {
        String configuredPrefixes;
        String defaultPrefix;
        MinioConnectionDetails connectionDetails = connectionDetailsProvider.getIfAvailable();
        if (connectionDetails != null) {
            configuredPrefixes = properties.getManagedImageObjectPrefixes();
            defaultPrefix = connectionDetails.objectPrefix();
        } else {
            configuredPrefixes = properties.getManagedImageObjectPrefixes();
            defaultPrefix = properties.getObjectPrefix();
        }

        LinkedHashSet<String> domains = new LinkedHashSet<>();
        for (String prefix : resolveTrustedObjectPrefixes(defaultPrefix, configuredPrefixes)) {
            String firstSegment = firstPathSegment(prefix);
            if (firstSegment != null) {
                domains.add(firstSegment.toLowerCase(Locale.ROOT));
            }
        }
        return Set.copyOf(domains);
    }

    private String originOf(URI uri) {
        if (uri == null || uri.getScheme() == null || uri.getHost() == null || uri.getRawUserInfo() != null) {
            return null;
        }
        String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            return null;
        }
        String host = uri.getHost().toLowerCase(Locale.ROOT);
        int port = normalizePort(uri);
        boolean defaultPort = ("http".equals(scheme) && port == 80) || ("https".equals(scheme) && port == 443);
        return scheme + "://" + host + (defaultPort ? "" : ":" + port);
    }

    private List<String> resolveTrustedObjectPrefixes(String defaultObjectPrefix, String configuredPrefixes) {
        LinkedHashSet<String> prefixes = new LinkedHashSet<>();
        for (String value : splitObjectPrefixes(configuredPrefixes)) {
            String normalized = trimObjectPath(value);
            if (normalized != null) {
                prefixes.add(normalized);
            }
        }
        String fallback = trimObjectPath(defaultObjectPrefix);
        if (fallback != null) {
            prefixes.add(fallback);
        }
        return List.copyOf(prefixes);
    }

    private List<String> splitObjectPrefixes(String configuredPrefixes) {
        String normalized = trimToNull(configuredPrefixes);
        if (normalized == null) {
            return List.of();
        }
        return Arrays.stream(normalized.split(","))
            .map(this::trimObjectPath)
            .filter(Objects::nonNull)
            .toList();
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

    private String stripQueryAndFragment(String path) {
        if (path == null) {
            return null;
        }
        int queryIndex = path.indexOf('?');
        int fragmentIndex = path.indexOf('#');
        int endIndex = path.length();
        if (queryIndex >= 0) {
            endIndex = Math.min(endIndex, queryIndex);
        }
        if (fragmentIndex >= 0) {
            endIndex = Math.min(endIndex, fragmentIndex);
        }
        String stripped = path.substring(0, endIndex);
        return stripped.isEmpty() ? null : stripped;
    }

    private String firstPathSegment(String value) {
        String normalized = trimObjectPath(value);
        if (normalized == null) {
            return null;
        }
        int slashIndex = normalized.indexOf('/');
        return slashIndex >= 0 ? normalized.substring(0, slashIndex) : normalized;
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

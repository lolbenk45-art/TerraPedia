package com.terraria.skills.service;

import java.net.URI;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

public interface ManagedImageUrlPolicy {

    boolean isManagedImageUrl(String value);

    List<String> trustedManagedImageUrlPrefixes();

    default Optional<String> normalizeManagedImagePath(String value) {
        String normalizedValue = trimToNull(value);
        if (normalizedValue == null || !isManagedImageUrl(normalizedValue)) {
            return Optional.empty();
        }
        String path = extractManagedPath(normalizedValue);
        return path == null ? Optional.of(normalizedValue) : Optional.of(path);
    }

    default Optional<String> normalizeManagedImagePathForDomain(String value, String domain) {
        Optional<String> normalized = normalizeManagedImagePath(value);
        String normalizedDomain = trimToNull(domain);
        if (normalized.isEmpty() || normalizedDomain == null) {
            return Optional.empty();
        }
        String expectedPrefix = "/terrapedia-images/" + normalizedDomain.toLowerCase(Locale.ROOT) + "/";
        return normalized.get().toLowerCase(Locale.ROOT).startsWith(expectedPrefix)
            ? normalized
            : Optional.empty();
    }

    default boolean isManagedImageUrlForDomain(String value, String domain) {
        String normalizedValue = trimToNull(value);
        String normalizedDomain = trimToNull(domain);
        if (normalizedValue == null || normalizedDomain == null || !isManagedImageUrl(normalizedValue)) {
            return false;
        }
        String expectedSegment = "/" + normalizedDomain.toLowerCase(Locale.ROOT) + "/";
        for (String prefix : trustedManagedImageUrlPrefixes()) {
            String normalizedPrefix = trimToNull(prefix);
            if (normalizedPrefix == null) {
                continue;
            }
            if (!normalizedValue.startsWith(normalizedPrefix)) {
                continue;
            }
            if (normalizedPrefix.toLowerCase(Locale.ROOT).contains(expectedSegment)) {
                return true;
            }
        }
        return false;
    }

    static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String extractManagedPath(String value) {
        String path = value;
        try {
            URI uri = URI.create(value);
            if (uri.getScheme() != null && uri.getPath() != null) {
                path = uri.getPath();
            }
        } catch (IllegalArgumentException ignored) {
            path = value;
        }
        int index = path.indexOf("/terrapedia-images/");
        if (index < 0) {
            return null;
        }
        String managedPath = path.substring(index);
        int queryIndex = managedPath.indexOf('?');
        int fragmentIndex = managedPath.indexOf('#');
        int endIndex = managedPath.length();
        if (queryIndex >= 0) {
            endIndex = Math.min(endIndex, queryIndex);
        }
        if (fragmentIndex >= 0) {
            endIndex = Math.min(endIndex, fragmentIndex);
        }
        return managedPath.substring(0, endIndex);
    }
}

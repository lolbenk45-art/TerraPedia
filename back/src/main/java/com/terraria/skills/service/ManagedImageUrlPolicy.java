package com.terraria.skills.service;

import java.util.List;
import java.util.Locale;

public interface ManagedImageUrlPolicy {

    boolean isManagedImageUrl(String value);

    List<String> trustedManagedImageUrlPrefixes();

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

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}

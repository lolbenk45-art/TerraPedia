package com.terraria.skills.common;

public final class AdminTextUtils {

    private AdminTextUtils() {
    }

    public static String trimToNull(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }

    public static String trimToNullUnicodeBlank(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}

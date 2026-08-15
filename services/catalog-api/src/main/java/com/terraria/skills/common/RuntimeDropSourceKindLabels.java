package com.terraria.skills.common;

import java.util.Locale;

public final class RuntimeDropSourceKindLabels {

    public static final String UNKNOWN_KIND = "unknown";

    private RuntimeDropSourceKindLabels() {
    }

    public static String normalizeKind(Object value) {
        if (value == null) {
            return UNKNOWN_KIND;
        }
        String normalized = String.valueOf(value).trim().toLowerCase(Locale.ROOT);
        if (normalized.isEmpty()) {
            return UNKNOWN_KIND;
        }
        return switch (normalized) {
            case "npc_drop", "direct_boss", "treasure_bag" -> normalized;
            default -> UNKNOWN_KIND;
        };
    }

    public static String label(Object value) {
        return switch (normalizeKind(value)) {
            case "npc_drop" -> "NPC 掉落";
            case "direct_boss" -> "Boss 直接掉落";
            case "treasure_bag" -> "宝藏袋掉落";
            default -> "未知来源";
        };
    }
}

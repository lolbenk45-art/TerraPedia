package com.terraria.skills.common;

public final class PaginationParams {

    private PaginationParams() {
    }

    public static int resolvePage(Integer page) {
        if (page == null || page < 1) {
            return 1;
        }
        return page;
    }

    public static int resolveLimit(Integer limit, Integer size, int defaultLimit) {
        return resolveLimit(limit, size, defaultLimit, null);
    }

    public static int resolveLimit(Integer limit, Integer size, int defaultLimit, Integer maxLimit) {
        int resolved = firstPositive(limit);
        if (resolved == 0) {
            resolved = firstPositive(size);
        }
        if (resolved == 0) {
            resolved = Math.max(1, defaultLimit);
        }
        if (maxLimit != null && maxLimit > 0) {
            resolved = Math.min(resolved, maxLimit);
        }
        return Math.max(1, resolved);
    }

    private static int firstPositive(Integer value) {
        if (value == null || value < 1) {
            return 0;
        }
        return value;
    }
}

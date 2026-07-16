package com.terraria.skills.service.impl.crawlerv2;

public enum CrawlerQueueEngineMode {
    V1("v1"),
    MAINTENANCE("maintenance"),
    V2("v2");

    private final String value;

    CrawlerQueueEngineMode(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

    public static CrawlerQueueEngineMode fromValue(String value) {
        if (value == null || value.isBlank()) {
            return V1;
        }
        for (CrawlerQueueEngineMode mode : values()) {
            if (mode.value.equals(value)) {
                return mode;
            }
        }
        throw new IllegalArgumentException("未知队列引擎模式：" + value);
    }
}

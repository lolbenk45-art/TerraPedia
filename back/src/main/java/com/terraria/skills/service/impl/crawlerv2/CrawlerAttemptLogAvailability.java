package com.terraria.skills.service.impl.crawlerv2;

import com.fasterxml.jackson.annotation.JsonValue;

public enum CrawlerAttemptLogAvailability {
    AVAILABLE("available"),
    EMPTY("empty"),
    MISSING("missing"),
    EXPIRED("expired"),
    FORBIDDEN("forbidden");

    private final String value;

    CrawlerAttemptLogAvailability(String value) {
        this.value = value;
    }

    @JsonValue
    public String value() {
        return value;
    }
}

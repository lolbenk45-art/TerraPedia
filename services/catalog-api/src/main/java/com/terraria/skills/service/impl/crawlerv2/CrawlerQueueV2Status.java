package com.terraria.skills.service.impl.crawlerv2;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Arrays;

public enum CrawlerQueueV2Status {
    QUEUED("queued", false),
    RETRY_WAIT("retry_wait", false),
    STARTING("starting", false),
    RUNNING("running", false),
    PAUSE_REQUESTED("pause_requested", false),
    PAUSED("paused", false),
    CANCEL_REQUESTED("cancel_requested", false),
    STALLED("stalled", false),
    COMPLETED("completed", true),
    FAILED("failed", true),
    CANCELLED("cancelled", true),
    TIMED_OUT("timed_out", true),
    INTERRUPTED("interrupted", true);

    private final String value;
    private final boolean terminal;

    CrawlerQueueV2Status(String value, boolean terminal) {
        this.value = value;
        this.terminal = terminal;
    }

    @JsonValue
    public String value() {
        return value;
    }

    public boolean terminal() {
        return terminal;
    }

    @JsonCreator
    public static CrawlerQueueV2Status fromValue(String value) {
        return Arrays.stream(values())
            .filter(status -> status.value.equals(value))
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("未知 V2 状态：" + value));
    }
}

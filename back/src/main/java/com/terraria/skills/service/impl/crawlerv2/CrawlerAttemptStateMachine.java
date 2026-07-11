package com.terraria.skills.service.impl.crawlerv2;

import com.terraria.skills.config.CrawlerQueueV2Properties;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import static com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2Status.CANCELLED;
import static com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2Status.CANCEL_REQUESTED;
import static com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2Status.COMPLETED;
import static com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2Status.FAILED;
import static com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2Status.INTERRUPTED;
import static com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2Status.PAUSED;
import static com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2Status.PAUSE_REQUESTED;
import static com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2Status.QUEUED;
import static com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2Status.RETRY_WAIT;
import static com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2Status.RUNNING;
import static com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2Status.STALLED;
import static com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2Status.STARTING;
import static com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2Status.TIMED_OUT;

public class CrawlerAttemptStateMachine {

    private static final Map<CrawlerQueueV2Status, Set<CrawlerQueueV2Status>> ALLOWED = Map.ofEntries(
        Map.entry(QUEUED, Set.of(STARTING, CANCELLED, TIMED_OUT)),
        Map.entry(RETRY_WAIT, Set.of(STARTING, CANCELLED, TIMED_OUT)),
        Map.entry(STARTING, Set.of(RUNNING, CANCEL_REQUESTED, STALLED, FAILED)),
        Map.entry(RUNNING, Set.of(PAUSE_REQUESTED, CANCEL_REQUESTED, COMPLETED, FAILED, STALLED)),
        Map.entry(PAUSE_REQUESTED, Set.of(PAUSED, CANCEL_REQUESTED, STALLED, FAILED)),
        Map.entry(PAUSED, Set.of(RUNNING, CANCEL_REQUESTED, STALLED)),
        Map.entry(CANCEL_REQUESTED, Set.of(CANCELLED, FAILED)),
        Map.entry(STALLED, Set.of(STARTING, RUNNING, PAUSED, CANCEL_REQUESTED, TIMED_OUT, FAILED)),
        Map.entry(COMPLETED, Set.of()),
        Map.entry(FAILED, Set.of()),
        Map.entry(CANCELLED, Set.of()),
        Map.entry(TIMED_OUT, Set.of()),
        Map.entry(INTERRUPTED, Set.of())
    );

    private final CrawlerQueueV2Properties properties;

    public CrawlerAttemptStateMachine(CrawlerQueueV2Properties properties) {
        this.properties = Objects.requireNonNull(properties, "properties");
    }

    public boolean canTransition(CrawlerQueueV2Status from, CrawlerQueueV2Status to) {
        if (from == null || to == null) {
            return false;
        }
        return ALLOWED.getOrDefault(from, Set.of()).contains(to);
    }

    public void requireValidTransition(CrawlerQueueV2Status from, CrawlerQueueV2Status to) {
        if (!canTransition(from, to)) {
            throw new IllegalArgumentException("不允许的 V2 状态转换：" + from + " -> " + to);
        }
    }

    public Instant deadlineFor(
        CrawlerQueueV2Status status,
        Instant enteredAt,
        Instant lastHeartbeatAt,
        Instant eligibleAt
    ) {
        Objects.requireNonNull(status, "status");
        if (status.terminal()) {
            return null;
        }
        Instant entered = Objects.requireNonNull(enteredAt, "enteredAt");
        return switch (status) {
            case QUEUED -> entered.plus(properties.getQueuedDeadline());
            case RETRY_WAIT -> Objects.requireNonNull(eligibleAt, "eligibleAt")
                .plus(properties.getRetryWindow());
            case STARTING -> entered.plus(properties.getStartingDeadline());
            case RUNNING -> Objects.requireNonNull(lastHeartbeatAt, "lastHeartbeatAt")
                .plus(properties.getRunningHeartbeatDeadline());
            case PAUSE_REQUESTED -> entered.plus(properties.getPauseRequestDeadline());
            case PAUSED -> entered.plus(properties.getPausedDeadline());
            case CANCEL_REQUESTED -> entered.plus(properties.getCancelRequestDeadline());
            case STALLED -> entered.plus(properties.getStalledDeadline());
            case COMPLETED, FAILED, CANCELLED, TIMED_OUT, INTERRUPTED -> null;
        };
    }

    public void requireDeadline(CrawlerQueueV2Status status, Instant deadlineAt) {
        Objects.requireNonNull(status, "status");
        if (!status.terminal() && deadlineAt == null) {
            throw new IllegalArgumentException("非终态必须携带 deadlineAt：" + status.value());
        }
    }

    public List<String> allowedActions(CrawlerQueueV2Status status) {
        Objects.requireNonNull(status, "status");
        return switch (status) {
            case QUEUED, RETRY_WAIT, STARTING, PAUSE_REQUESTED, STALLED -> List.of("cancel");
            case RUNNING -> List.of("pause", "cancel");
            case PAUSED -> List.of("resume", "cancel");
            case CANCEL_REQUESTED -> List.of();
            case FAILED, TIMED_OUT, INTERRUPTED -> List.of("retry", "cleanup");
            case COMPLETED, CANCELLED -> List.of("cleanup");
        };
    }
}

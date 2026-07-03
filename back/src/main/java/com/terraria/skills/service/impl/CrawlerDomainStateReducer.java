package com.terraria.skills.service.impl;

import java.time.Instant;
import java.util.Set;

/**
 * 域状态真相源：综合 domain/progress/queue 三路信号 + 租约有效性，
 * 计算单一权威 status + nextAction + blocker。纯函数，只读不写（读算分离，R3）。
 * 移植自前端 crawlerMonitorUnifiedStatus.mjs 的 11 级优先级阶梯。
 * R1 契约：progress 为 running/starting 但 leaseExpiresAt 为 null 或已过期时，判定为 stalled 而非 running。
 */
public class CrawlerDomainStateReducer {

    private static final Set<String> ACTIVE_PROGRESS = Set.of("running", "starting");

    public State reduce(Input in) {
        String queue = normalize(in.queueStatus());
        String progress = normalize(in.progressStatus());
        String domain = normalize(in.domainStatus());
        boolean hasBlocker = in.blockedByDomain() != null || in.blockedByActionId() != null || in.blockedByDispatchId() != null;
        boolean leaseValid = in.leaseExpiresAt() != null && in.leaseExpiresAt().isAfter(in.now());

        // R1：progress 活跃(running/starting)但无有效租约(含 null/已过期) → 判 stalled(疑似孤儿)。
        // 这是有意扩展：进程死亡/后端重启后进度文件仍是 running，但无人续租，故不允许显示 running。
        boolean progressActiveNoLease = ACTIVE_PROGRESS.contains(progress) && !leaseValid;

        String status;
        if (isOneOf(queue, "failed", "timed_out", "cancelled", "force_reclaimed")) {
            status = "force_reclaimed".equals(queue) ? "cancelled" : queue;
        } else if (isOneOf(progress, "failed", "timed_out")) {
            status = progress;
        } else if ("paused".equals(queue)) {
            status = "paused";
        } else if ("paused".equals(progress)) {
            status = "paused";
        } else if ("stalled".equals(progress) || progressActiveNoLease) {
            status = "stalled";
        } else if (hasBlocker || "blocked".equals(queue)) {
            status = "blocked";
        } else if (isOneOf(domain, "failed", "timed_out", "stalled", "blocked")) {
            status = domain;
        } else if (isOneOf(queue, "running", "starting")) {
            status = queue;
        } else if (isOneOf(progress, "running", "starting")) {
            status = progress;
        } else if ("queued".equals(queue) || "queued".equals(progress)) {
            status = "queued";
        } else if (!domain.isEmpty()) {
            status = domain;
        } else {
            status = "healthy";
        }

        return new State(status, nextAction(status), blockerLabel(in), rawBlocker(in));
    }

    private static String nextAction(String status) {
        return switch (status) {
            case "paused" -> "resume";
            case "running", "starting" -> "observe_or_terminate";
            case "queued" -> "cancel_queued";
            case "blocked" -> "inspect_blocker";
            case "stalled", "failed", "timed_out" -> "terminate_and_recrawl";
            case "cancelled" -> "recrawl";
            case "healthy" -> "none";
            default -> "inspect";
        };
    }

    private static String blockerLabel(Input in) {
        if (in.blockedByDomain() != null) return "域 " + in.blockedByDomain();
        if (in.blockedByActionId() != null) return "动作 " + in.blockedByActionId();
        if (in.blockedByDispatchId() != null) return "派发 " + in.blockedByDispatchId();
        return null;
    }

    private static String rawBlocker(Input in) {
        if (in.blockedByDomain() != null) return in.blockedByDomain();
        if (in.blockedByActionId() != null) return in.blockedByActionId();
        if (in.blockedByDispatchId() != null) return in.blockedByDispatchId();
        return null;
    }

    private static boolean isOneOf(String value, String... options) {
        for (String option : options) {
            if (option.equals(value)) return true;
        }
        return false;
    }

    private static String normalize(String value) {
        if (value == null) return "";
        String v = value.trim().toLowerCase();
        return switch (v) {
            case "error" -> "failed";
            case "timeout" -> "timed_out";
            case "blocked_cooldown", "locked" -> "blocked";
            default -> v;
        };
    }

    public record State(String status, String nextAction, String blockerLabel, String blocker) {}

    public record Input(
        String queueStatus,
        String progressStatus,
        String domainStatus,
        String blockedByDomain,
        String blockedByActionId,
        String blockedByDispatchId,
        Instant leaseExpiresAt,
        Instant now
    ) {
        public static Builder builder() { return new Builder(); }

        public static final class Builder {
            private String queueStatus, progressStatus, domainStatus;
            private String blockedByDomain, blockedByActionId, blockedByDispatchId;
            private Instant leaseExpiresAt, now;
            public Builder queueStatus(String v) { this.queueStatus = v; return this; }
            public Builder progressStatus(String v) { this.progressStatus = v; return this; }
            public Builder domainStatus(String v) { this.domainStatus = v; return this; }
            public Builder blockedByDomain(String v) { this.blockedByDomain = v; return this; }
            public Builder blockedByActionId(String v) { this.blockedByActionId = v; return this; }
            public Builder blockedByDispatchId(String v) { this.blockedByDispatchId = v; return this; }
            public Builder leaseExpiresAt(Instant v) { this.leaseExpiresAt = v; return this; }
            public Builder now(Instant v) { this.now = v; return this; }
            public Input build() {
                return new Input(queueStatus, progressStatus, domainStatus,
                    blockedByDomain, blockedByActionId, blockedByDispatchId, leaseExpiresAt, now);
            }
        }
    }
}

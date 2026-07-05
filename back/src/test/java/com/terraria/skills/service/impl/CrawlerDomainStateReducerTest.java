package com.terraria.skills.service.impl;

import org.junit.jupiter.api.Test;
import java.time.Instant;
import static org.junit.jupiter.api.Assertions.assertEquals;

class CrawlerDomainStateReducerTest {

    private final CrawlerDomainStateReducer reducer = new CrawlerDomainStateReducer();
    private final Instant now = Instant.parse("2026-06-14T02:00:00Z");

    @Test
    void queueCancelledBecomesReadyInsteadOfCurrentCancelled() {
        CrawlerDomainStateReducer.Input in = CrawlerDomainStateReducer.Input.builder()
            .queueStatus("cancelled").progressStatus("running").now(now).build();
        CrawlerDomainStateReducer.State state = reducer.reduce(in);
        assertEquals("ready", state.status());
        assertEquals("recrawl", state.nextAction());
    }

    @Test
    void forceReclaimedBecomesReadyInsteadOfCurrentCancelled() {
        CrawlerDomainStateReducer.Input in = CrawlerDomainStateReducer.Input.builder()
            .queueStatus("force_reclaimed").now(now).build();
        CrawlerDomainStateReducer.State state = reducer.reduce(in);
        assertEquals("ready", state.status());
        assertEquals("recrawl", state.nextAction());
    }

    @Test
    void forceReclaimedProgressClearsStaleFailedQueue() {
        CrawlerDomainStateReducer.Input in = CrawlerDomainStateReducer.Input.builder()
            .queueStatus("failed")
            .progressStatus("force_reclaimed")
            .now(now)
            .build();
        CrawlerDomainStateReducer.State state = reducer.reduce(in);
        assertEquals("ready", state.status());
        assertEquals("recrawl", state.nextAction());
    }

    @Test
    void forceReclaimedProgressClearsStaleTimedOutQueue() {
        CrawlerDomainStateReducer.Input in = CrawlerDomainStateReducer.Input.builder()
            .queueStatus("timed_out")
            .progressStatus("force_reclaimed")
            .now(now)
            .build();
        CrawlerDomainStateReducer.State state = reducer.reduce(in);
        assertEquals("ready", state.status());
        assertEquals("recrawl", state.nextAction());
    }

    @Test
    void runningWithoutValidLeaseBecomesStalled() {
        CrawlerDomainStateReducer.Input in = CrawlerDomainStateReducer.Input.builder()
            .progressStatus("running")
            .leaseExpiresAt(Instant.parse("2026-06-14T01:00:00Z"))
            .now(now).build();
        assertEquals("stalled", reducer.reduce(in).status());
    }

    @Test
    void runningWithValidLeaseStaysRunning() {
        CrawlerDomainStateReducer.Input in = CrawlerDomainStateReducer.Input.builder()
            .progressStatus("running")
            .leaseExpiresAt(Instant.parse("2026-06-14T02:05:00Z"))
            .now(now).build();
        assertEquals("running", reducer.reduce(in).status());
    }

    @Test
    void runningQueueWithoutLeaseStaysRunning() {
        CrawlerDomainStateReducer.Input in = CrawlerDomainStateReducer.Input.builder()
            .queueStatus("running")
            .progressStatus("running")
            .leaseExpiresAt(null)
            .now(now).build();
        assertEquals("running", reducer.reduce(in).status());
    }

    @Test
    void queuedWithBlockerStaysQueuedAndKeepsBlocker() {
        CrawlerDomainStateReducer.Input in = CrawlerDomainStateReducer.Input.builder()
            .queueStatus("queued").blockedByDomain("bosses").now(now).build();
        CrawlerDomainStateReducer.State state = reducer.reduce(in);
        assertEquals("queued", state.status());
        assertEquals("cancel_queued", state.nextAction());
        assertEquals("域 bosses", state.blockerLabel());
    }

    @Test
    void blockedQueueProducesBlocked() {
        CrawlerDomainStateReducer.Input in = CrawlerDomainStateReducer.Input.builder()
            .queueStatus("blocked").blockedByDomain("bosses").now(now).build();
        assertEquals("blocked", reducer.reduce(in).status());
    }

    @Test
    void healthyWhenNoSignals() {
        CrawlerDomainStateReducer.Input in = CrawlerDomainStateReducer.Input.builder().now(now).build();
        assertEquals("healthy", reducer.reduce(in).status());
    }

    @Test
    void nextActionForStalledIsRecrawl() {
        CrawlerDomainStateReducer.Input in = CrawlerDomainStateReducer.Input.builder()
            .progressStatus("stalled").now(now).build();
        CrawlerDomainStateReducer.State state = reducer.reduce(in);
        assertEquals("stalled", state.status());
        assertEquals("terminate_and_recrawl", state.nextAction());
    }

    @Test
    void nullLeaseAlsoStallsActiveProgress() {
        // R1 契约：lease 为 null 时，running progress 也判 stalled
        CrawlerDomainStateReducer.Input in = CrawlerDomainStateReducer.Input.builder()
            .progressStatus("running").leaseExpiresAt(null).now(now).build();
        assertEquals("stalled", reducer.reduce(in).status());
    }

    @Test
    void pausedNotMisjudgedAsStalledWithoutLease() {
        // paused 即使无租约也应保持 paused，不被 R1 误判
        CrawlerDomainStateReducer.Input in = CrawlerDomainStateReducer.Input.builder()
            .progressStatus("paused").leaseExpiresAt(null).now(now).build();
        assertEquals("paused", reducer.reduce(in).status());
    }

    @Test
    void progressFailedBeatsBlocker() {
        // 第2级(progress failed) 应优先于第6级(blocker)
        CrawlerDomainStateReducer.Input in = CrawlerDomainStateReducer.Input.builder()
            .progressStatus("failed").blockedByDomain("bosses").now(now).build();
        assertEquals("failed", reducer.reduce(in).status());
    }

    @Test
    void normalizeAliasesMapToCanonical() {
        assertEquals("failed", reducer.reduce(
            CrawlerDomainStateReducer.Input.builder().queueStatus("error").now(now).build()).status());
        assertEquals("timed_out", reducer.reduce(
            CrawlerDomainStateReducer.Input.builder().queueStatus("timeout").now(now).build()).status());
        // locked / blocked_cooldown → blocked（经由 queue blocked 分支）
        assertEquals("blocked", reducer.reduce(
            CrawlerDomainStateReducer.Input.builder().queueStatus("locked").now(now).build()).status());
        assertEquals("blocked", reducer.reduce(
            CrawlerDomainStateReducer.Input.builder().queueStatus("blocked_cooldown").now(now).build()).status());
    }

    @Test
    void domainLevelFailedSurfacesWhenQueueAndProgressEmpty() {
        // 第7级：domain 级 failed/blocked（queue/progress 空）
        CrawlerDomainStateReducer.Input in = CrawlerDomainStateReducer.Input.builder()
            .domainStatus("failed").now(now).build();
        assertEquals("failed", reducer.reduce(in).status());
    }

    @Test
    void cancelledNextActionIsRecrawl() {
        CrawlerDomainStateReducer.Input in = CrawlerDomainStateReducer.Input.builder()
            .queueStatus("cancelled").now(now).build();
        assertEquals("recrawl", reducer.reduce(in).nextAction());
    }

    @Test
    void completedProgressOverridesUnknownDomainStateAsReady() {
        CrawlerDomainStateReducer.Input in = CrawlerDomainStateReducer.Input.builder()
            .queueStatus("completed")
            .progressStatus("completed")
            .domainStatus("unknown")
            .now(now)
            .build();
        CrawlerDomainStateReducer.State state = reducer.reduce(in);
        assertEquals("ready", state.status());
        assertEquals("recrawl", state.nextAction());
    }
}

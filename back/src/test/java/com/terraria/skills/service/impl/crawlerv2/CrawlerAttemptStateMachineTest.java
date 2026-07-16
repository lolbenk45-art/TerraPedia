package com.terraria.skills.service.impl.crawlerv2;

import com.terraria.skills.config.CrawlerQueueV2Properties;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CrawlerAttemptStateMachineTest {

    private final CrawlerAttemptStateMachine machine =
        new CrawlerAttemptStateMachine(new CrawlerQueueV2Properties());
    private final Instant enteredAt = Instant.parse("2026-07-11T13:00:00Z");

    @Test
    void shouldAllowOnlyTheApprovedTransitionMatrix() {
        Set<String> allowed = Set.of(
            "queued->starting", "queued->cancelled", "queued->timed_out",
            "retry_wait->starting", "retry_wait->cancelled", "retry_wait->timed_out",
            "starting->running", "starting->cancel_requested", "starting->stalled", "starting->completed", "starting->failed",
            "running->pause_requested", "running->cancel_requested", "running->completed", "running->failed", "running->stalled",
            "pause_requested->paused", "pause_requested->cancel_requested", "pause_requested->stalled", "pause_requested->failed",
            "paused->running", "paused->cancel_requested", "paused->stalled", "paused->failed",
            "cancel_requested->cancelled", "cancel_requested->failed",
            "stalled->starting", "stalled->running", "stalled->paused", "stalled->cancel_requested", "stalled->timed_out", "stalled->failed"
        );

        for (CrawlerQueueV2Status from : CrawlerQueueV2Status.values()) {
            for (CrawlerQueueV2Status to : CrawlerQueueV2Status.values()) {
                assertEquals(
                    allowed.contains(from.value() + "->" + to.value()),
                    machine.canTransition(from, to),
                    from + " -> " + to
                );
            }
        }
    }

    @Test
    void shouldAssignADeadlineToEveryNonTerminalStatus() {
        for (CrawlerQueueV2Status status : CrawlerQueueV2Status.values()) {
            Instant deadline = machine.deadlineFor(
                status,
                enteredAt,
                enteredAt.plusSeconds(10),
                enteredAt.plusSeconds(20)
            );
            if (status.terminal()) {
                assertNull(deadline, status.value());
            } else {
                assertNotNull(deadline, status.value());
                assertTrue(deadline.isAfter(enteredAt), status.value());
            }
        }
        assertEquals(enteredAt.plusSeconds(100), machine.deadlineFor(
            CrawlerQueueV2Status.RUNNING,
            enteredAt,
            enteredAt.plusSeconds(10),
            null
        ));
    }

    @Test
    void shouldRejectTerminalReversalAndMissingDeadline() {
        assertFalse(machine.canTransition(CrawlerQueueV2Status.COMPLETED, CrawlerQueueV2Status.RUNNING));
        assertThrows(IllegalArgumentException.class, () -> machine.requireValidTransition(
            CrawlerQueueV2Status.COMPLETED,
            CrawlerQueueV2Status.RUNNING
        ));
        assertThrows(IllegalArgumentException.class, () -> machine.requireDeadline(
            CrawlerQueueV2Status.RUNNING,
            null
        ));
    }

    @Test
    void shouldDeriveActionsAndOperatorErrorText() {
        assertEquals(List.of("pause", "cancel"), machine.allowedActions(CrawlerQueueV2Status.RUNNING));
        assertEquals(List.of("resume", "cancel"), machine.allowedActions(CrawlerQueueV2Status.PAUSED));
        assertEquals(List.of("retry", "cleanup"), machine.allowedActions(CrawlerQueueV2Status.TIMED_OUT));
        assertEquals(
            "任务超过 90 秒没有更新心跳，已进入异常收敛。",
            CrawlerQueueV2ReasonCode.HEARTBEAT_TIMEOUT.messageZh()
        );
        assertFalse(CrawlerQueueV2ReasonCode.HEARTBEAT_TIMEOUT.suggestedAction().isBlank());
    }
}

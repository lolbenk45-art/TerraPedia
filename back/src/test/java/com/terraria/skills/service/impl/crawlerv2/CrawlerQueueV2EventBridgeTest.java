package com.terraria.skills.service.impl.crawlerv2;

import com.terraria.skills.config.CrawlerQueueV2Properties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyEmitter;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class CrawlerQueueV2EventBridgeTest {

    private static final Instant NOW = Instant.parse("2026-07-11T13:00:00Z");

    private final CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
    private MutableClock clock;
    private CrawlerQueueV2Properties properties;
    private CrawlerQueueV2EventBridge bridge;

    @BeforeEach
    void setUp() {
        properties = new CrawlerQueueV2Properties();
        properties.setSseHeartbeatInterval(Duration.ofSeconds(10));
        clock = new MutableClock(NOW, ZoneOffset.UTC);
        bridge = new CrawlerQueueV2EventBridge(repository, properties, clock);
        when(repository.readEvents(anyString(), eq(100), eq(Duration.ZERO))).thenReturn(
            new CrawlerQueueV2Repository.EventReadResult(false, List.of(), "0-0")
        );
    }

    @Test
    void shouldReplayCommittedEventsAfterTheRequestedCursorInOrder() {
        when(repository.readEvents("10-0", 100, Duration.ZERO)).thenReturn(
            new CrawlerQueueV2Repository.EventReadResult(
                false,
                List.of(
                    envelope("11-0", "attempt.transitioned", 4L),
                    envelope("12-0", "attempt.progressed", 5L)
                ),
                "12-0"
            )
        );
        RecordingEmitter emitter = new RecordingEmitter();

        bridge.subscribe("10-0", () -> emitter);

        assertEquals(List.of("11-0", "12-0"), emitter.eventIds());
        assertEquals(List.of("attempt.transitioned", "attempt.progressed"), emitter.eventNames());
    }

    @Test
    void shouldTellTheClientToReloadWhenTheCursorHasBeenTrimmed() {
        when(repository.readEvents("1-0", 100, Duration.ZERO)).thenReturn(
            new CrawlerQueueV2Repository.EventReadResult(true, List.of(), "20-0")
        );
        RecordingEmitter emitter = new RecordingEmitter();

        bridge.subscribe("1-0", () -> emitter);

        assertEquals(List.of("stream.gap"), emitter.eventNames());
        assertEquals("20-0", emitter.data().get(0).get("nextCursor"));
    }

    @Test
    void shouldRejectCursorOutsideTheExactStreamIdFormat() {
        assertThrows(IllegalArgumentException.class, () -> bridge.subscribe("10", RecordingEmitter::new));
        assertThrows(IllegalArgumentException.class, () -> bridge.subscribe("-1-0", RecordingEmitter::new));
    }

    @Test
    void shouldRemoveCompletedAndTimedOutEmitters() {
        RecordingEmitter completed = new RecordingEmitter();
        RecordingEmitter timedOut = new RecordingEmitter();
        bridge.subscribe("0-0", () -> completed);
        bridge.subscribe("0-0", () -> timedOut);

        completed.completeFromClient();
        assertEquals(1, bridge.subscriberCount());

        timedOut.timeoutFromClient();
        assertEquals(0, bridge.subscriberCount());
    }

    @Test
    void shouldRejectSubscriptionsPastTheConfiguredLimitBeforeAllocatingAnotherEmitter() {
        properties.setSseMaxSubscribers(2);
        RecordingEmitter first = new RecordingEmitter();
        RecordingEmitter second = new RecordingEmitter();
        bridge.subscribe("0-0", () -> first);
        bridge.subscribe("0-0", () -> second);
        clearInvocations(repository);

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> bridge.subscribe("0-0", () -> {
                throw new AssertionError("cap rejection must not allocate an emitter");
            })
        );

        assertEquals(CrawlerQueueV2ReasonCode.SSE_SUBSCRIBER_LIMIT, exception.reasonCode());
        assertEquals(2, bridge.subscriberCount());
        verifyNoInteractions(repository);
    }

    @Test
    void shouldReadRedisOnceAndFanOutOnePollToEverySubscriber() {
        RecordingEmitter first = new RecordingEmitter();
        RecordingEmitter second = new RecordingEmitter();
        bridge.subscribe("0-0", () -> first);
        bridge.subscribe("0-0", () -> second);
        clearInvocations(repository);
        when(repository.readEvents("0-0", 100, Duration.ZERO)).thenReturn(
            new CrawlerQueueV2Repository.EventReadResult(
                false,
                List.of(envelope("1-0", "attempt.progressed", 2L)),
                "1-0"
            )
        );

        bridge.pollAndBroadcast();

        verify(repository, times(1)).readEvents("0-0", 100, Duration.ZERO);
        assertEquals(List.of("1-0"), first.eventIds());
        assertEquals(List.of("1-0"), second.eventIds());
    }

    @Test
    void shouldOnlySendAStreamGapToSubscribersWhoseCursorWasActuallyTrimmed() {
        RecordingEmitter stale = new RecordingEmitter();
        RecordingEmitter current = new RecordingEmitter();
        bridge.subscribe("1-0", () -> stale);
        bridge.subscribe("25-0", () -> current);
        when(repository.readEvents("1-0", 100, Duration.ZERO)).thenReturn(
            new CrawlerQueueV2Repository.EventReadResult(true, List.of(), "20-0")
        );

        bridge.pollAndBroadcast();

        assertEquals(List.of("stream.gap"), stale.eventNames());
        assertEquals(List.of(), current.eventNames());
    }

    @Test
    void shouldOnlyRemoveTheEmitterWhoseEventSendFails() {
        RecordingEmitter failed = new RecordingEmitter();
        RecordingEmitter healthy = new RecordingEmitter();
        bridge.subscribe("0-0", () -> failed);
        bridge.subscribe("0-0", () -> healthy);
        failed.failNextSend();
        when(repository.readEvents("0-0", 100, Duration.ZERO)).thenReturn(
            new CrawlerQueueV2Repository.EventReadResult(
                false,
                List.of(envelope("1-0", "attempt.progressed", 2L)),
                "1-0"
            )
        );

        bridge.pollAndBroadcast();

        assertEquals(1, bridge.subscriberCount());
        assertEquals(List.of("1-0"), healthy.eventIds());
    }

    @Test
    void shouldNotRegisterAnEmitterWhenItsReplaySendFails() {
        when(repository.readEvents("0-0", 100, Duration.ZERO)).thenReturn(
            new CrawlerQueueV2Repository.EventReadResult(
                false,
                List.of(envelope("1-0", "attempt.progressed", 2L)),
                "1-0"
            )
        );
        RecordingEmitter emitter = new RecordingEmitter();
        emitter.failNextSend();

        bridge.subscribe("0-0", () -> emitter);

        assertEquals(0, bridge.subscriberCount());
        assertEquals(true, emitter.completedByBridge());
    }

    @Test
    void shouldSendHeartbeatCommentsOnlyWhenTheConfiguredIntervalElapsed() {
        RecordingEmitter emitter = new RecordingEmitter();
        bridge.subscribe("0-0", () -> emitter);

        clock.advance(Duration.ofSeconds(9));
        bridge.sendHeartbeat();
        assertEquals(0, emitter.heartbeatCount());

        clock.advance(Duration.ofSeconds(1));
        bridge.sendHeartbeat();
        assertEquals(1, emitter.heartbeatCount());

        clock.advance(Duration.ofSeconds(10));
        bridge.sendHeartbeat();
        assertEquals(2, emitter.heartbeatCount());
    }

    @Test
    void shouldEmitStateStoreHealthBeforeClosingOnRepositoryOutage() {
        RecordingEmitter emitter = new RecordingEmitter();
        bridge.subscribe("0-0", () -> emitter);
        when(repository.readEvents("0-0", 100, Duration.ZERO)).thenThrow(
            new CrawlerQueueV2Exception(
                org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE
            )
        );

        bridge.pollAndBroadcast();

        assertEquals(List.of("queue.health-changed"), emitter.eventNames());
        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE, emitter.data().get(0).get("reasonCode"));
        assertEquals(true, emitter.completedByBridge());
        assertEquals(0, bridge.subscriberCount());
    }

    @Test
    void shouldPreserveStructuredStateStoreResetReasonBeforeClosingAnEstablishedSubscriber() {
        RecordingEmitter emitter = new RecordingEmitter();
        bridge.subscribe("0-0", () -> emitter);
        when(repository.readEvents("0-0", 100, Duration.ZERO)).thenThrow(
            new CrawlerQueueV2Exception(
                org.springframework.http.HttpStatus.CONFLICT,
                CrawlerQueueV2ReasonCode.STATE_STORE_RESET
            )
        );

        bridge.pollAndBroadcast();

        assertEquals(List.of("queue.health-changed"), emitter.eventNames());
        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, emitter.data().get(0).get("reasonCode"));
        assertEquals(true, emitter.completedByBridge());
        assertEquals(0, bridge.subscriberCount());
    }

    @Test
    void shouldPropagateStructuredStateStoreResetBeforeOpeningAnSseResponse() {
        when(repository.readEvents("0-0", 100, Duration.ZERO)).thenThrow(
            new CrawlerQueueV2Exception(
                org.springframework.http.HttpStatus.CONFLICT,
                CrawlerQueueV2ReasonCode.STATE_STORE_RESET
            )
        );

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> bridge.subscribe("0-0", RecordingEmitter::new)
        );

        assertEquals(org.springframework.http.HttpStatus.CONFLICT, exception.httpStatus());
        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, exception.reasonCode());
        assertEquals(0, bridge.subscriberCount());
    }

    private static CrawlerQueueV2Repository.EventEnvelope envelope(
        String streamId,
        String type,
        long stateVersion
    ) {
        return new CrawlerQueueV2Repository.EventEnvelope(
            streamId,
            new CrawlerQueueV2Event(
                type,
                "epoch-1",
                "queue-1",
                "attempt-1",
                142L,
                stateVersion,
                CrawlerQueueV2Status.RUNNING,
                null,
                NOW.plusSeconds(stateVersion)
            )
        );
    }

    private static final class RecordingEmitter extends SseEmitter {
        private final List<String> eventIds = new ArrayList<>();
        private final List<String> eventNames = new ArrayList<>();
        private final List<Map<String, Object>> data = new ArrayList<>();
        private final List<String> metadata = new ArrayList<>();
        private Runnable completionCallback = () -> { };
        private Runnable timeoutCallback = () -> { };
        private boolean failNextSend;
        private boolean completedByBridge;

        RecordingEmitter() {
            super(0L);
        }

        @Override
        public synchronized void send(SseEventBuilder builder) throws IOException {
            if (failNextSend) {
                failNextSend = false;
                throw new IOException("synthetic send failure");
            }
            var items = builder.build();
            String headers = items.stream()
                .filter(item -> item.getData() instanceof String)
                .map(item -> (String) item.getData())
                .collect(Collectors.joining());
            Object payload = items.stream()
                .map(ResponseBodyEmitter.DataWithMediaType::getData)
                .filter(value -> !(value instanceof String))
                .findFirst()
                .orElse(Map.of());
            metadata.add(headers);
            eventIds.add(header(headers, "id:"));
            eventNames.add(header(headers, "event:"));
            data.add(toMap(payload));
        }

        @Override
        public synchronized void onCompletion(Runnable callback) {
            completionCallback = callback;
        }

        @Override
        public synchronized void onTimeout(Runnable callback) {
            timeoutCallback = callback;
        }

        @Override
        public synchronized void complete() {
            completedByBridge = true;
            super.complete();
        }

        List<String> eventIds() {
            return List.copyOf(eventIds);
        }

        List<String> eventNames() {
            return List.copyOf(eventNames);
        }

        List<Map<String, Object>> data() {
            return List.copyOf(data);
        }

        int heartbeatCount() {
            return (int) metadata.stream().filter(value -> value.contains("heartbeat")).count();
        }

        boolean completedByBridge() {
            return completedByBridge;
        }

        void completeFromClient() {
            completionCallback.run();
        }

        void timeoutFromClient() {
            timeoutCallback.run();
        }

        void failNextSend() {
            failNextSend = true;
        }

        private static String header(String headers, String prefix) {
            return headers.lines()
                .filter(line -> line.startsWith(prefix))
                .map(line -> line.substring(prefix.length()).trim())
                .findFirst()
                .orElse("");
        }

        private static Map<String, Object> toMap(Object payload) {
            if (payload instanceof Map<?, ?> raw) {
                Map<String, Object> result = new LinkedHashMap<>();
                raw.forEach((key, value) -> result.put(String.valueOf(key), value));
                return result;
            }
            if (payload instanceof CrawlerQueueV2Event event) {
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("type", event.type());
                result.put("stateStoreEpoch", event.stateStoreEpoch());
                result.put("queueId", event.queueId());
                result.put("attemptId", event.attemptId());
                result.put("fenceToken", event.fenceToken());
                result.put("stateVersion", event.stateVersion());
                result.put("status", event.status());
                result.put("reasonCode", event.reasonCode());
                result.put("generatedAt", event.generatedAt());
                return result;
            }
            throw new IllegalArgumentException("unsupported SSE test payload: " + payload);
        }
    }

    private static final class MutableClock extends Clock {
        private Instant current;
        private final ZoneId zone;

        private MutableClock(Instant current, ZoneId zone) {
            this.current = current;
            this.zone = zone;
        }

        @Override
        public ZoneId getZone() {
            return zone;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return new MutableClock(current, zone);
        }

        @Override
        public Instant instant() {
            return current;
        }

        void advance(Duration duration) {
            current = current.plus(duration);
        }
    }
}

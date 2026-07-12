package com.terraria.skills.service.impl.crawlerv2;

import com.terraria.skills.config.CrawlerQueueV2Properties;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * Bridges the immutable V2 Redis Stream to authenticated SSE clients. Replay,
 * registration, and live fan-out share one monitor so an event cannot land in
 * the gap between a client's replay read and its live subscription.
 */
public class CrawlerQueueV2EventBridge {

    private static final int READ_COUNT = 100;
    private static final int DEFAULT_MAX_SUBSCRIBERS = 32;
    private static final Duration NO_BLOCK = Duration.ZERO;

    private final CrawlerQueueV2Repository repository;
    private final CrawlerQueueV2Properties properties;
    private final Clock clock;
    private final Object monitor = new Object();
    private final Map<String, Subscriber> subscribers = new LinkedHashMap<>();
    private Instant lastHeartbeatAt;

    public CrawlerQueueV2EventBridge(
        CrawlerQueueV2Repository repository,
        CrawlerQueueV2Properties properties,
        Clock clock
    ) {
        this.repository = Objects.requireNonNull(repository, "repository");
        this.properties = Objects.requireNonNull(properties, "properties");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.lastHeartbeatAt = clock.instant();
    }

    public SseEmitter subscribe(String after, Supplier<SseEmitter> emitterFactory) {
        validateCursor(after);
        synchronized (monitor) {
            if (subscribers.size() >= maxSubscribers()) {
                throw new CrawlerQueueV2Exception(
                    org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                    CrawlerQueueV2ReasonCode.SSE_SUBSCRIBER_LIMIT
                );
            }
            SseEmitter emitter = Objects.requireNonNull(emitterFactory, "emitterFactory").get();
            if (emitter == null) {
                throw new IllegalArgumentException("SSE emitter 不可为空");
            }
            String subscriberId = UUID.randomUUID().toString();
            Subscriber subscriber = new Subscriber(subscriberId, emitter, after);
            emitter.onCompletion(() -> removeSubscriber(subscriberId, false));
            emitter.onTimeout(() -> removeSubscriber(subscriberId, false));
            CrawlerQueueV2Repository.EventReadResult replay;
            try {
                replay = repository.readEvents(after, READ_COUNT, NO_BLOCK);
            } catch (RuntimeException exception) {
                throw initialSubscriptionFailure(exception);
            }
            if (applyReadResult(subscriber, replay)) {
                subscribers.put(subscriberId, subscriber);
            }
            return emitter;
        }
    }

    public int subscriberCount() {
        synchronized (monitor) {
            return subscribers.size();
        }
    }

    public void pollAndBroadcast() {
        synchronized (monitor) {
            if (subscribers.isEmpty()) {
                return;
            }
            try {
                CrawlerQueueV2Repository.EventReadResult result = repository.readEvents(
                    oldestSubscriberCursor(),
                    READ_COUNT,
                    NO_BLOCK
                );
                for (Subscriber subscriber : new ArrayList<>(subscribers.values())) {
                    if (!subscribers.containsKey(subscriber.id())) {
                        continue;
                    }
                    applyReadResult(subscriber, result);
                }
            } catch (RuntimeException exception) {
                notifyStoreFailureAndClose(new ArrayList<>(subscribers.values()), reasonCodeFor(exception));
            }
        }
    }

    public void sendHeartbeat() {
        synchronized (monitor) {
            if (subscribers.isEmpty()) {
                return;
            }
            Instant now = clock.instant();
            Duration interval = properties.getSseHeartbeatInterval();
            if (interval != null && !interval.isNegative() && !interval.isZero()
                && Duration.between(lastHeartbeatAt, now).compareTo(interval) < 0) {
                return;
            }
            for (Subscriber subscriber : new ArrayList<>(subscribers.values())) {
                try {
                    subscriber.emitter().send(SseEmitter.event().comment("heartbeat"));
                } catch (IOException | IllegalStateException exception) {
                    removeSubscriber(subscriber.id(), true);
                }
            }
            lastHeartbeatAt = now;
        }
    }

    private boolean applyReadResult(
        Subscriber subscriber,
        CrawlerQueueV2Repository.EventReadResult readResult
    ) {
        CrawlerQueueV2Repository.EventReadResult result = readResult == null
            ? new CrawlerQueueV2Repository.EventReadResult(false, List.of(), subscriber.cursor())
            : readResult;
        if (result.gap()) {
            String nextCursor = validCursorOrCurrent(result.nextCursor(), subscriber.cursor());
            if (!isAfter(nextCursor, subscriber.cursor())) {
                return true;
            }
            if (send(subscriber, null, "stream.gap", Map.of("nextCursor", nextCursor))) {
                subscriber.cursor(nextCursor);
                return true;
            }
            return false;
        }
        for (CrawlerQueueV2Repository.EventEnvelope envelope : result.events()) {
            if (envelope == null || !isAfter(envelope.streamId(), subscriber.cursor())) {
                continue;
            }
            if (!send(subscriber, envelope.streamId(), envelope.event().type(), envelope.event())) {
                return false;
            }
            subscriber.cursor(envelope.streamId());
        }
        return true;
    }

    private boolean send(Subscriber subscriber, String streamId, String eventType, Object payload) {
        try {
            SseEmitter.SseEventBuilder event = SseEmitter.event().name(eventType).data(payload);
            if (streamId != null) {
                event.id(streamId);
            }
            subscriber.emitter().send(event);
            return true;
        } catch (IOException | IllegalStateException exception) {
            removeSubscriber(subscriber, true);
            return false;
        }
    }

    private void notifyStoreFailureAndClose(
        List<Subscriber> recipients,
        CrawlerQueueV2ReasonCode reasonCode
    ) {
        CrawlerQueueV2Event health = new CrawlerQueueV2Event(
            "queue.health-changed",
            null,
            null,
            null,
            null,
            null,
            null,
            reasonCode,
            clock.instant()
        );
        for (Subscriber subscriber : recipients) {
            if (send(subscriber, null, health.type(), health)) {
                removeSubscriber(subscriber, true);
            }
        }
    }

    private static CrawlerQueueV2ReasonCode reasonCodeFor(RuntimeException exception) {
        if (exception instanceof CrawlerQueueV2Exception queueException) {
            return queueException.reasonCode();
        }
        return CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE;
    }

    private static CrawlerQueueV2Exception initialSubscriptionFailure(RuntimeException exception) {
        if (exception instanceof CrawlerQueueV2Exception queueException) {
            return queueException;
        }
        return new CrawlerQueueV2Exception(
            org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
            CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE,
            CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE.messageZh(),
            exception
        );
    }

    private void removeSubscriber(Subscriber subscriber, boolean complete) {
        subscribers.remove(subscriber.id());
        if (complete) {
            subscriber.emitter().complete();
        }
    }

    private void removeSubscriber(String subscriberId, boolean complete) {
        Subscriber removed;
        synchronized (monitor) {
            removed = subscribers.remove(subscriberId);
        }
        if (removed != null && complete) {
            removed.emitter().complete();
        }
    }

    private int maxSubscribers() {
        int configured = properties.getSseMaxSubscribers();
        return configured > 0 ? configured : DEFAULT_MAX_SUBSCRIBERS;
    }

    private String oldestSubscriberCursor() {
        String oldest = null;
        for (Subscriber subscriber : subscribers.values()) {
            if (oldest == null || compareStreamIds(subscriber.cursor(), oldest) < 0) {
                oldest = subscriber.cursor();
            }
        }
        return oldest == null ? "0-0" : oldest;
    }

    private static void validateCursor(String cursor) {
        if (!validCursor(cursor)) {
            throw new IllegalArgumentException("SSE cursor 必须是 0-0 或数字-数字");
        }
    }

    private static String validCursorOrCurrent(String candidate, String current) {
        return validCursor(candidate) ? candidate : current;
    }

    private static boolean validCursor(String value) {
        return value != null && value.matches("[0-9]+-[0-9]+");
    }

    private static boolean isAfter(String candidate, String cursor) {
        if (!validCursor(candidate) || !validCursor(cursor)) {
            return false;
        }
        return compareStreamIds(candidate, cursor) > 0;
    }

    private static int compareStreamIds(String left, String right) {
        String[] candidateParts = left.split("-", -1);
        String[] cursorParts = right.split("-", -1);
        int milliseconds = new java.math.BigInteger(candidateParts[0])
            .compareTo(new java.math.BigInteger(cursorParts[0]));
        return milliseconds != 0
            ? milliseconds
            : new java.math.BigInteger(candidateParts[1])
                .compareTo(new java.math.BigInteger(cursorParts[1]));
    }

    private static final class Subscriber {
        private final String id;
        private final SseEmitter emitter;
        private String value;

        private Subscriber(String id, SseEmitter emitter, String value) {
            this.id = id;
            this.emitter = emitter;
            this.value = value;
        }

        private String id() {
            return id;
        }

        private SseEmitter emitter() {
            return emitter;
        }

        private String cursor() {
            return value;
        }

        private void cursor(String value) {
            this.value = value;
        }
    }
}

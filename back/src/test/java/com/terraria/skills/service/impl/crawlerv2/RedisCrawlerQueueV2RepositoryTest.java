package com.terraria.skills.service.impl.crawlerv2;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.script.RedisScript;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class RedisCrawlerQueueV2RepositoryTest {

    private static final Instant NOW = Instant.parse("2026-07-11T13:00:00Z");
    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    @Test
    void shouldCreateQueueUsingOnlyTheV2Namespace() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
            .thenReturn("{\"code\":\"CREATED\",\"queueId\":\"queue-1\",\"attemptId\":\"attempt-1\",\"stateVersion\":1,\"firstLiveMutationAt\":\"2026-07-11T13:00:00Z\"}");
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);

        CrawlerQueueV2Repository.EnqueueResult result = repository.createQueue(command());

        assertEquals(CrawlerQueueV2Repository.EnqueueCode.CREATED, result.code());
        assertEquals(NOW, result.firstLiveMutationAt());
        ArgumentCaptor<List<String>> keys = ArgumentCaptor.forClass(List.class);
        verify(redis).execute(any(RedisScript.class), keys.capture(), any(Object[].class));
        assertTrue(keys.getValue().stream().allMatch(key -> key.startsWith("terrapedia:crawler:wiki-monitor:v2:")));
        assertTrue(keys.getValue().stream().noneMatch(key -> key.contains("dispatch-queue")));
    }

    @Test
    void shouldReturnTheAuthoritativeAttemptWhenDedupeMatches() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
            .thenReturn("{\"code\":\"DEDUPED\",\"queueId\":\"queue-existing\",\"attemptId\":\"attempt-existing\",\"stateVersion\":7,\"firstLiveMutationAt\":\"2026-07-11T12:59:00Z\"}");
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);

        CrawlerQueueV2Repository.EnqueueResult result = repository.createQueue(command());

        assertEquals(CrawlerQueueV2Repository.EnqueueCode.DEDUPED, result.code());
        assertEquals("attempt-existing", result.attemptId());
        assertEquals(7L, result.stateVersion());
        assertEquals(CrawlerQueueV2ReasonCode.DEDUPED_ACTIVE_ATTEMPT, result.reasonCode());
        assertEquals(Instant.parse("2026-07-11T12:59:00Z"), result.firstLiveMutationAt());
    }

    @Test
    void shouldFailClosedWhenRedisCannotExecuteTheMutation() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
            .thenThrow(new IllegalStateException("connection refused"));
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> repository.createQueue(command())
        );

        assertEquals(503, exception.httpStatus().value());
        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE, exception.reasonCode());
    }

    @Test
    void shouldRejectInvalidTtlBeforeCallingRedis() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);
        CrawlerQueueV2Repository.CreateQueueCommand command = command();
        CrawlerQueueV2Repository.CreateQueueCommand invalid = new CrawlerQueueV2Repository.CreateQueueCommand(
            command.expectedEpoch(),
            command.queue(),
            command.attempt(),
            command.readyScore(),
            Duration.ZERO,
            command.event()
        );

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> repository.createQueue(invalid)
        );

        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, exception.reasonCode());
        verifyNoInteractions(redis);
    }

    @Test
    void shouldRejectSubMillisecondTtlBeforeCallingRedis() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);
        CrawlerQueueV2Repository.CreateQueueCommand command = command();
        CrawlerQueueV2Repository.CreateQueueCommand invalid = new CrawlerQueueV2Repository.CreateQueueCommand(
            command.expectedEpoch(),
            command.queue(),
            command.attempt(),
            command.readyScore(),
            Duration.ofNanos(1),
            command.event()
        );

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> repository.createQueue(invalid)
        );

        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, exception.reasonCode());
        verifyNoInteractions(redis);
    }

    @Test
    void shouldRejectTtlBeyondTheRepositorySafetyLimitBeforeCallingRedis() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);
        CrawlerQueueV2Repository.CreateQueueCommand command = command();
        CrawlerQueueV2Repository.CreateQueueCommand invalid = new CrawlerQueueV2Repository.CreateQueueCommand(
            command.expectedEpoch(),
            command.queue(),
            command.attempt(),
            command.readyScore(),
            Duration.ofDays(31),
            command.event()
        );

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> repository.createQueue(invalid)
        );

        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, exception.reasonCode());
        verifyNoInteractions(redis);
    }

    @Test
    void shouldRejectMismatchedAttemptIdentityBeforeCallingRedis() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);
        CrawlerQueueV2Repository.CreateQueueCommand command = command();
        CrawlerQueueV2Attempt mismatched = new CrawlerQueueV2Attempt(
            2, "epoch-old", "queue-other", "attempt-other", null, 1L, CrawlerQueueV2Status.QUEUED,
            "standard", "bosses", List.of("bosses"), "domain-source-bosses", null,
            NOW, NOW, NOW, null, null, null, NOW.plus(Duration.ofHours(2)), null, null,
            0L, null, null, null, null, null, command.attempt().artifacts()
        );
        CrawlerQueueV2Repository.CreateQueueCommand invalid = new CrawlerQueueV2Repository.CreateQueueCommand(
            command.expectedEpoch(),
            command.queue(),
            mismatched,
            command.readyScore(),
            command.dedupeTtl(),
            command.event()
        );

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> repository.createQueue(invalid)
        );

        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, exception.reasonCode());
        verifyNoInteractions(redis);
    }

    @Test
    void shouldRejectUndispatchableInitialIdentityBeforeCallingRedis() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);
        CrawlerQueueV2Repository.CreateQueueCommand command = command();
        CrawlerQueueV2Queue queue = new CrawlerQueueV2Queue(
            2, "epoch-1", "queue-1", "standard", " ", List.of(),
            " ", "standard:domain-source-bosses:fresh", NOW, "admin",
            "attempt-1", List.of("attempt-1"), null
        );
        CrawlerQueueV2Attempt attempt = new CrawlerQueueV2Attempt(
            2, "epoch-1", "queue-1", "attempt-1", null, 1L, CrawlerQueueV2Status.QUEUED,
            "standard", " ", List.of(), " ", null,
            NOW, NOW, NOW, null, null, null, null, null, null,
            0L, null, null, null, null, null, command.attempt().artifacts()
        );
        CrawlerQueueV2Repository.CreateQueueCommand invalid = new CrawlerQueueV2Repository.CreateQueueCommand(
            command.expectedEpoch(),
            queue,
            attempt,
            command.readyScore(),
            command.dedupeTtl(),
            command.event()
        );

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> repository.createQueue(invalid)
        );

        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, exception.reasonCode());
        verifyNoInteractions(redis);
    }

    @Test
    void shouldRejectSuccessfulResultWithoutPositiveIntegralStateVersion() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
            .thenReturn("{\"code\":\"CREATED\",\"queueId\":\"queue-1\",\"attemptId\":\"attempt-1\",\"firstLiveMutationAt\":\"2026-07-11T13:00:00Z\"}");
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> repository.createQueue(command())
        );

        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, exception.reasonCode());
    }

    @Test
    void shouldMapScriptValidationFailureToStructuredConflict() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
            .thenReturn("{\"code\":\"INVALID_COMMAND\"}");
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> repository.createQueue(command())
        );

        assertEquals(409, exception.httpStatus().value());
        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, exception.reasonCode());
    }

    @Test
    void shouldPreflightEveryFallibleCreateQueueOperationBeforeTheFirstWrite() throws Exception {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
            .thenReturn("{\"code\":\"CREATED\",\"queueId\":\"queue-1\",\"attemptId\":\"attempt-1\",\"stateVersion\":1,\"firstLiveMutationAt\":\"2026-07-11T13:00:00Z\"}");
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);

        repository.createQueue(command());

        ArgumentCaptor<RedisScript<String>> script = ArgumentCaptor.forClass(RedisScript.class);
        ArgumentCaptor<List<String>> keys = ArgumentCaptor.forClass(List.class);
        ArgumentCaptor<Object[]> arguments = ArgumentCaptor.forClass(Object[].class);
        verify(redis).execute(script.capture(), keys.capture(), arguments.capture());
        String source = script.getValue().getScriptAsString();
        int firstWrite = source.indexOf("redis.call('DEL', KEYS[6]");
        assertEquals(List.of(
            "terrapedia:crawler:wiki-monitor:v2:meta:engine",
            "terrapedia:crawler:wiki-monitor:v2:meta:epoch",
            "terrapedia:crawler:wiki-monitor:v2:queue:queue-1",
            "terrapedia:crawler:wiki-monitor:v2:attempt:attempt-1",
            "terrapedia:crawler:wiki-monitor:v2:lane:standard:ready",
            "terrapedia:crawler:wiki-monitor:v2:dedupe:standard:domain-source-bosses:fresh",
            "terrapedia:crawler:wiki-monitor:v2:index:attempts:live",
            "terrapedia:crawler:wiki-monitor:v2:index:queues",
            "terrapedia:crawler:wiki-monitor:v2:meta:first-live-mutation-at",
            "terrapedia:crawler:wiki-monitor:v2:events"
        ), keys.getValue());
        assertEquals(10, arguments.getValue().length);
        assertEquals("epoch-1", arguments.getValue()[0]);
        assertEquals(Long.toString(NOW.toEpochMilli()), arguments.getValue()[3]);
        assertEquals(Long.toString(Duration.ofHours(2).toMillis()), arguments.getValue()[4]);
        assertEquals("queue-1", arguments.getValue()[5]);
        assertEquals("attempt-1", arguments.getValue()[6]);
        assertEquals(NOW.toString(), arguments.getValue()[7]);
        assertEquals("terrapedia:crawler:wiki-monitor:v2:attempt:", arguments.getValue()[9]);
        assertEquals("queue-1", objectMapper.readTree((String) arguments.getValue()[1]).path("queueId").asText());
        assertEquals("attempt-1", objectMapper.readTree((String) arguments.getValue()[2]).path("attemptId").asText());
        assertEquals("queue.created", objectMapper.readTree((String) arguments.getValue()[8]).path("type").asText());
        ObjectMapper canonicalMapper = objectMapper.copy().disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        assertEquals(
            objectMapper.readTree(canonicalMapper.writeValueAsString(command().queue())),
            objectMapper.readTree((String) arguments.getValue()[1])
        );
        assertEquals(
            objectMapper.readTree(canonicalMapper.writeValueAsString(command().attempt())),
            objectMapper.readTree((String) arguments.getValue()[2])
        );
        assertEquals(
            objectMapper.readTree(canonicalMapper.writeValueAsString(command().event())),
            objectMapper.readTree((String) arguments.getValue()[8])
        );
        assertTrue(firstWrite > 0);
        assertBeforeFirstWrite(source, "dedupeTtl <= 0", firstWrite);
        assertBeforeFirstWrite(source, "dedupeTtl > MAX_DEDUPE_TTL_MILLIS", firstWrite);
        assertBeforeFirstWrite(source, "local readyType", firstWrite);
        assertBeforeFirstWrite(source, "local eventsType", firstWrite);
        assertBeforeFirstWrite(source, "isValidInstant(firstLiveMutationAt)", firstWrite);
        assertBeforeFirstWrite(source, "existing.stateStoreEpoch == nil", firstWrite);
        assertBeforeFirstWrite(source, "existing.attemptId ~= existingAttemptId", firstWrite);
        assertBeforeFirstWrite(source, "local existingQueueType", firstWrite);
        assertBeforeFirstWrite(source, "existingQueue.currentAttemptId ~= existing.attemptId", firstWrite);
        assertBeforeFirstWrite(source, "local knownStatus", firstWrite);
        assertBeforeFirstWrite(source, "not knownStatus", firstWrite);
        assertBeforeFirstWrite(source, "#attempt.coveredDomains == 0", firstWrite);
        assertBeforeFirstWrite(source, "type(attempt.deadlineAt) ~= 'string'", firstWrite);
        assertBeforeFirstWrite(source, "isBlank(queue.domain)", firstWrite);
        assertBeforeFirstWrite(source, "isBlank(queue.actionId)", firstWrite);
        assertBeforeFirstWrite(source, "isBlank(queue.dedupeKey)", firstWrite);
        assertBeforeFirstWrite(source, "isBlank(left[index])", firstWrite);
        assertFalse(source.substring(firstWrite).contains("redis.call('TYPE'"));
    }

    @Test
    void shouldReadEngineMetadataWithOneCoherentMultiGet() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        ValueOperations<String, String> values = mock(ValueOperations.class);
        List<String> keys = List.of(
            "terrapedia:crawler:wiki-monitor:v2:meta:engine",
            "terrapedia:crawler:wiki-monitor:v2:meta:epoch",
            "terrapedia:crawler:wiki-monitor:v2:meta:active-cutover-id",
            "terrapedia:crawler:wiki-monitor:v2:meta:first-live-mutation-at"
        );
        when(redis.opsForValue()).thenReturn(values);
        when(values.multiGet(eq(keys))).thenReturn(List.of(
            "v2", "epoch-1", "cutover-1", "2026-07-11T13:00:00Z"
        ));
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);

        CrawlerQueueV2Repository.EngineState result = repository.readEngineState();

        assertEquals(CrawlerQueueEngineMode.V2, result.mode());
        assertEquals("epoch-1", result.stateStoreEpoch());
        assertEquals("cutover-1", result.activeCutoverId());
        assertEquals("2026-07-11T13:00:00Z", result.firstLiveMutationAt());
        verify(values).multiGet(eq(keys));
        verify(values, never()).get(any());
    }

    private RedisCrawlerQueueV2Repository repository(StringRedisTemplate redis, String prefix) {
        return new RedisCrawlerQueueV2Repository(
            objectMapper,
            redis,
            Clock.fixed(NOW, ZoneOffset.UTC),
            prefix
        );
    }

    private void assertBeforeFirstWrite(String source, String required, int firstWrite) {
        int index = source.indexOf(required);
        assertTrue(index >= 0, () -> "Lua preflight is missing: " + required);
        assertTrue(index < firstWrite, () -> "Lua preflight occurs after the first write: " + required);
    }

    private CrawlerQueueV2Repository.CreateQueueCommand command() {
        CrawlerQueueV2Artifacts artifacts = new CrawlerQueueV2Artifacts(
            "reports/crawler-monitor/v2/2026-07-11/attempt-1/progress.json",
            "reports/crawler-monitor/v2/2026-07-11/attempt-1/run.log",
            null,
            null
        );
        CrawlerQueueV2Queue queue = new CrawlerQueueV2Queue(
            2, "epoch-1", "queue-1", "standard", "bosses", List.of("bosses"),
            "domain-source-bosses", "standard:domain-source-bosses:fresh", NOW, "admin",
            "attempt-1", List.of("attempt-1"), null
        );
        CrawlerQueueV2Attempt attempt = new CrawlerQueueV2Attempt(
            2, "epoch-1", "queue-1", "attempt-1", null, 1L, CrawlerQueueV2Status.QUEUED,
            "standard", "bosses", List.of("bosses"), "domain-source-bosses", null,
            NOW, NOW, NOW, null, null, null, NOW.plus(Duration.ofHours(2)), null, null,
            0L, null, null, null, null, null, artifacts
        );
        return new CrawlerQueueV2Repository.CreateQueueCommand(
            "epoch-1", queue, attempt, NOW.toEpochMilli(), Duration.ofHours(2),
            new CrawlerQueueV2Event(
                "queue.created", "epoch-1", "queue-1", "attempt-1", null, 1L,
                CrawlerQueueV2Status.QUEUED, null, NOW
            )
        );
    }
}

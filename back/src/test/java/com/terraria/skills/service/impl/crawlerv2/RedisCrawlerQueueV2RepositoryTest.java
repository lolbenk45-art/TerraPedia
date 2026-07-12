package com.terraria.skills.service.impl.crawlerv2;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.core.io.ClassPathResource;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.StreamOperations;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.connection.stream.StreamReadOptions;
import org.springframework.data.redis.core.script.RedisScript;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

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

    @Test
    void shouldPassAllCoveredDomainLeasesToOneAtomicClaim() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
            .thenReturn("{\"code\":\"CLAIMED\",\"attemptId\":\"attempt-1\",\"fenceToken\":142,\"stateVersion\":2}");
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);

        CrawlerQueueV2Repository.ClaimResult result = repository.claim(new CrawlerQueueV2Repository.ClaimCommand(
            "epoch-1", "queue-1", "attempt-1", "standard", "standard:domain-source-bosses:fresh",
            1L, NOW.plusSeconds(10), NOW.plusSeconds(130),
            Duration.ofSeconds(90), List.of("npcs", "bosses"), event("attempt.transitioned", 2L)
        ));

        assertEquals(142L, result.fenceToken());
        ArgumentCaptor<List<String>> keys = ArgumentCaptor.forClass(List.class);
        verify(redis).execute(any(RedisScript.class), keys.capture(), any(Object[].class));
        assertEquals(List.of(
            "terrapedia:crawler:wiki-monitor:v2:meta:engine",
            "terrapedia:crawler:wiki-monitor:v2:meta:epoch",
            "terrapedia:crawler:wiki-monitor:v2:events",
            "terrapedia:crawler:wiki-monitor:v2:meta:fence-sequence",
            "terrapedia:crawler:wiki-monitor:v2:attempt:attempt-1",
            "terrapedia:crawler:wiki-monitor:v2:lane:standard:ready",
            "terrapedia:crawler:wiki-monitor:v2:dedupe:standard:domain-source-bosses:fresh",
            "terrapedia:crawler:wiki-monitor:v2:domain:bosses:lease",
            "terrapedia:crawler:wiki-monitor:v2:domain:npcs:lease",
            "terrapedia:crawler:wiki-monitor:v2:domain:bosses:quarantine",
            "terrapedia:crawler:wiki-monitor:v2:domain:npcs:quarantine"
        ), keys.getValue());
    }

    @Test
    void shouldSurfaceStaleVersionAndStaleFenceWithoutRetrying() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
            .thenReturn("{\"code\":\"STALE_STATE_VERSION\",\"actualStateVersion\":9}")
            .thenReturn("{\"code\":\"STALE_FENCE_TOKEN\"}");
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);

        CrawlerQueueV2Exception staleVersion = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> repository.mutate(mutation(7L, 142L, 8L))
        );
        assertEquals(409, staleVersion.httpStatus().value());
        assertEquals(CrawlerQueueV2ReasonCode.STALE_STATE_VERSION, staleVersion.reasonCode());

        CrawlerQueueV2Exception staleFence = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> repository.mutate(mutation(8L, 141L, 9L))
        );
        assertEquals(409, staleFence.httpStatus().value());
        assertEquals(CrawlerQueueV2ReasonCode.STALE_FENCE_TOKEN, staleFence.reasonCode());
    }

    @Test
    void shouldRejectAProgressSequenceThatDoesNotIncrease() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
            .thenReturn("{\"code\":\"STALE_PROGRESS_SEQUENCE\",\"actualProgressSequence\":12}");
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> repository.mutate(mutation(12L, 142L, 8L))
        );

        assertEquals(409, exception.httpStatus().value());
        assertEquals(CrawlerQueueV2ReasonCode.STALE_FENCE_TOKEN, exception.reasonCode());
    }

    @Test
    void shouldKeepEveryAtomicScriptInsideTheV2IdentityContract() throws Exception {
        Map<String, List<String>> requiredTerms = Map.of(
            "create-queue.lua", List.of("stateStoreEpoch", "attemptId", "stateVersion", "XADD"),
            "claim-attempt.lua", List.of("stateStoreEpoch", "attemptId", "fenceToken", "stateVersion", "XADD"),
            "mutate-attempt.lua", List.of("stateStoreEpoch", "attemptId", "fenceToken", "stateVersion", "XADD"),
            "renew-leases.lua", List.of("stateStoreEpoch", "attemptId", "fenceToken"),
            "create-retry.lua", List.of("stateStoreEpoch", "attemptId", "stateVersion", "XADD"),
            "write-health.lua", List.of("stateStoreEpoch", "XADD")
        );
        for (Map.Entry<String, List<String>> entry : requiredTerms.entrySet()) {
            String source = new ClassPathResource("redis/crawler-queue-v2/" + entry.getKey())
                .getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
            for (String required : entry.getValue()) {
                assertTrue(source.contains(required), () -> entry.getKey() + " is missing " + required);
            }
            assertFalse(source.contains("dispatch-queue"));
            assertFalse(source.contains("wiki-monitor-dispatch"));
            assertFalse(source.contains("restoreRedisFromMirrorIfEmpty"));
        }
    }

    @Test
    void shouldPassTerminalReleaseIdentityAndScoreToOneMutation() throws Exception {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        CrawlerQueueV2Attempt completed = completedAttempt();
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
            .thenReturn("{\"code\":\"MUTATED\",\"attempt\":"
                + objectMapper.copy().disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
                    .writeValueAsString(completed)
                + ",\"streamId\":\"1000-1\"}");
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);

        CrawlerQueueV2Repository.MutationResult result = repository.mutate(terminalMutation());

        assertEquals(CrawlerQueueV2Status.COMPLETED, result.attempt().status());
        assertEquals("1000-1", result.streamId());
        ArgumentCaptor<List<String>> keys = ArgumentCaptor.forClass(List.class);
        ArgumentCaptor<Object[]> arguments = ArgumentCaptor.forClass(Object[].class);
        verify(redis).execute(any(RedisScript.class), keys.capture(), arguments.capture());
        assertEquals(List.of(
            "terrapedia:crawler:wiki-monitor:v2:meta:engine",
            "terrapedia:crawler:wiki-monitor:v2:meta:epoch",
            "terrapedia:crawler:wiki-monitor:v2:attempt:attempt-1",
            "terrapedia:crawler:wiki-monitor:v2:events",
            "terrapedia:crawler:wiki-monitor:v2:index:attempts:live",
            "terrapedia:crawler:wiki-monitor:v2:index:attempts:terminal",
            "terrapedia:crawler:wiki-monitor:v2:lane:standard:ready",
            "terrapedia:crawler:wiki-monitor:v2:dedupe:standard:domain-source-bosses:fresh",
            "terrapedia:crawler:wiki-monitor:v2:domain:bosses:lease"
        ), keys.getValue());
        assertEquals(26, arguments.getValue().length);
        assertEquals("1", arguments.getValue()[19]);
        assertEquals("0", arguments.getValue()[20]);
        assertEquals(Long.toString(NOW.toEpochMilli()), arguments.getValue()[25]);
    }

    @Test
    void shouldReturnFalseWithoutRetryingWhenOneLeaseCannotRenew() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
            .thenReturn("{\"code\":\"LEASE_RENEW_FAILED\"}");
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);

        boolean renewed = repository.renewLeases(new CrawlerQueueV2Repository.RenewLeaseCommand(
            "epoch-1", "queue-1", "attempt-1", 142L,
            List.of("npcs", "bosses"), Duration.ofSeconds(90)
        ));

        assertFalse(renewed);
        ArgumentCaptor<List<String>> keys = ArgumentCaptor.forClass(List.class);
        verify(redis).execute(any(RedisScript.class), keys.capture(), any(Object[].class));
        assertEquals(List.of(
            "terrapedia:crawler:wiki-monitor:v2:meta:engine",
            "terrapedia:crawler:wiki-monitor:v2:meta:epoch",
            "terrapedia:crawler:wiki-monitor:v2:domain:bosses:lease",
            "terrapedia:crawler:wiki-monitor:v2:domain:npcs:lease"
        ), keys.getValue());
    }

    @Test
    void shouldPreflightOwnershipScriptsBeforeTheirFirstWrite() throws Exception {
        assertPreflightBeforeWrite("claim-attempt.lua", "local fenceToken = redis.call('INCR'", List.of(
            "local quarantineStart", "local leaseRaw", "local existingFenceSequence",
            "STATE_STORE_INCONSISTENT"
        ));
        assertPreflightBeforeWrite("mutate-attempt.lua", "redis.call('SET', KEYS[3]", List.of(
            "STALE_STATE_VERSION", "STALE_PROGRESS_SEQUENCE", "local leaseRaw", "local terminalScore"
        ));
        assertPreflightBeforeWrite("renew-leases.lua", "redis.call('PEXPIRE'", List.of(
            "LEASE_RENEW_FAILED", "owner.stateStoreEpoch", "owner.fenceToken"
        ));
        assertPreflightBeforeWrite("create-retry.lua", "redis.call('SET', KEYS[3]", List.of(
            "local existingFirstMutationAt", "storedQueue.currentAttemptId", "priorAttempt.stateVersion"
        ));
    }

    @Test
    void shouldUseANonBlockingStreamReadWhenBlockDurationIsZero() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        StreamOperations<String, Object, Object> streams = mock(StreamOperations.class);
        when(redis.opsForStream()).thenReturn(streams);
        when(streams.read(any(StreamReadOptions.class), any(StreamOffset.class))).thenReturn(List.of());
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);

        assertTrue(repository.readEvents("0-0", 10, Duration.ZERO).isEmpty());

        ArgumentCaptor<StreamReadOptions> options = ArgumentCaptor.forClass(StreamReadOptions.class);
        verify(streams).read(options.capture(), any(StreamOffset.class));
        assertFalse(options.getValue().isBlocking());
    }

    @Test
    void appendEventMustLetLuaDeriveCurrentFencingFieldsAtomically() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
            .thenReturn("{\"code\":\"APPENDED\",\"streamId\":\"1000-2\"}");
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);
        CrawlerQueueV2Event event = new CrawlerQueueV2Event(
            "attempt.progress-rejected", "epoch-1", "queue-1", "attempt-1", 141L, 7L,
            CrawlerQueueV2Status.PAUSED, CrawlerQueueV2ReasonCode.STALE_FENCE_TOKEN, NOW
        );

        repository.appendEvent(event);

        ArgumentCaptor<RedisScript<String>> script = ArgumentCaptor.forClass(RedisScript.class);
        ArgumentCaptor<List<String>> keys = ArgumentCaptor.forClass(List.class);
        ArgumentCaptor<Object[]> arguments = ArgumentCaptor.forClass(Object[].class);
        verify(redis).execute(script.capture(), keys.capture(), arguments.capture());
        assertEquals(List.of(
            "terrapedia:crawler:wiki-monitor:v2:meta:engine",
            "terrapedia:crawler:wiki-monitor:v2:meta:epoch",
            "terrapedia:crawler:wiki-monitor:v2:attempt:attempt-1",
            "terrapedia:crawler:wiki-monitor:v2:events"
        ), keys.getValue());
        assertEquals("epoch-1", arguments.getValue()[0]);
        assertEquals("queue-1", arguments.getValue()[1]);
        assertEquals("attempt-1", arguments.getValue()[2]);
        assertEquals("attempt.progress-rejected", arguments.getValue()[3]);
        assertEquals("STALE_FENCE_TOKEN", arguments.getValue()[4]);
        assertEquals(NOW.toString(), arguments.getValue()[5]);
        assertEquals(6, arguments.getValue().length);
        String source = script.getValue().getScriptAsString();
        assertTrue(source.contains("fenceToken = attempt.fenceToken"));
        assertTrue(source.contains("stateVersion = attempt.stateVersion"));
        assertTrue(source.contains("status = attempt.status"));
        assertTrue(source.contains("redis.call('XADD', KEYS[4], '*', 'payload', cjson.encode(event))"));
        assertFalse(source.contains("event.fenceToken"));
        assertFalse(source.contains("event.stateVersion"));
        assertFalse(source.contains("event.status"));
    }

    @Test
    void appendEventMustAcceptWatcherFailureEvidence() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
            .thenReturn("{\"code\":\"APPENDED\",\"streamId\":\"1000-3\"}");
        RedisCrawlerQueueV2Repository repository = repository(
            redis,
            RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX
        );
        CrawlerQueueV2Event event = new CrawlerQueueV2Event(
            "attempt.watcher-failed", "epoch-1", "queue-1", "attempt-1", 142L, 8L,
            CrawlerQueueV2Status.RUNNING, CrawlerQueueV2ReasonCode.RECONCILER_STALE, NOW
        );

        repository.appendEvent(event);

        ArgumentCaptor<RedisScript<String>> script = ArgumentCaptor.forClass(RedisScript.class);
        ArgumentCaptor<Object[]> arguments = ArgumentCaptor.forClass(Object[].class);
        verify(redis).execute(script.capture(), anyList(), arguments.capture());
        assertEquals("attempt.watcher-failed", arguments.getValue()[3]);
        assertEquals("RECONCILER_STALE", arguments.getValue()[4]);
        String source = script.getValue().getScriptAsString();
        assertTrue(source.contains("ARGV[4] == 'attempt.watcher-failed'"));
        assertTrue(source.contains("ARGV[5] == 'RECONCILER_STALE'"));
    }

    @Test
    void shouldAllowOnlyUnconfirmedTerminationFailureToRetainOwnership() throws Exception {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        CrawlerQueueV2Attempt failed = failedUnconfirmedAttempt();
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
            .thenReturn("{\"code\":\"MUTATED\",\"attempt\":"
                + objectMapper.copy().disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
                    .writeValueAsString(failed)
                + ",\"streamId\":\"1000-3\"}");
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);
        CrawlerQueueV2Repository.MutationCommand command = unconfirmedTerminationMutation();

        CrawlerQueueV2Repository.MutationResult result = repository.mutate(command);

        assertEquals(CrawlerQueueV2Status.FAILED, result.attempt().status());
        assertEquals(CrawlerQueueV2ReasonCode.PROCESS_TERMINATION_UNCONFIRMED, result.attempt().reasonCode());
        ArgumentCaptor<RedisScript<String>> script = ArgumentCaptor.forClass(RedisScript.class);
        ArgumentCaptor<Object[]> arguments = ArgumentCaptor.forClass(Object[].class);
        verify(redis).execute(script.capture(), anyList(), arguments.capture());
        assertEquals("0", arguments.getValue()[19]);
        assertEquals(Long.toString(Duration.ofMinutes(2).toMillis()), arguments.getValue()[20]);
        String source = script.getValue().getScriptAsString();
        assertTrue(source.contains("PROCESS_TERMINATION_UNCONFIRMED"));
        assertTrue(source.contains("PEXPIRE"));
        assertTrue(source.contains("redis.call('PEXPIRE', KEYS[8], ARGV[21])"));
        int firstWrite = source.indexOf("redis.call('SET', KEYS[3]");
        assertBeforeFirstWrite(
            source,
            "retainedUnconfirmedTermination and dedupeOwner and dedupeOwner ~= attempt.attemptId",
            firstWrite
        );
        assertTrue(source.contains(
            "redis.call('SET', KEYS[8], attempt.attemptId, 'PX', ARGV[21])"
        ));
    }

    @Test
    void processStartedMutationMustBeWriteOnceForAnEmptyStartingIdentity() throws Exception {
        String source = new ClassPathResource("redis/crawler-queue-v2/mutate-attempt.lua")
            .getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        int firstWrite = source.indexOf("redis.call('SET', KEYS[3]");

        assertBeforeFirstWrite(source, "ARGV[22] == 'attempt.process-started'", firstWrite);
        assertBeforeFirstWrite(source, "attempt.status ~= 'starting'", firstWrite);
        assertBeforeFirstWrite(source, "attempt.pid ~= nil", firstWrite);
        assertBeforeFirstWrite(source, "attempt.processStartedAt ~= nil", firstWrite);
        assertBeforeFirstWrite(source, "ARGV[18] == ''", firstWrite);
        assertBeforeFirstWrite(source, "ARGV[19] == ''", firstWrite);
    }

    @Test
    void nonProcessStartedMutationMustRejectProcessIdentityBeforeRedis() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);
        CrawlerQueueV2Repository.MutationCommand source = mutation(8L, 142L, 9L);
        CrawlerQueueV2Repository.MutationCommand invalid = new CrawlerQueueV2Repository.MutationCommand(
            source.expectedEpoch(), source.queueId(), source.attemptId(), source.lane(), source.dedupeKey(),
            source.coveredDomains(), source.expectedFenceToken(), source.expectedStateVersion(),
            source.targetStatus(), source.reasonCode(), source.enteredAt(), source.deadlineAt(),
            source.lastHeartbeatAt(), source.progressSequence(), source.phase(), source.current(),
            source.total(), source.workerMessage(), 12345L, NOW.minusSeconds(1),
            source.releaseOwnership(), source.retainedOwnershipTtl(), source.eventType()
        );

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> repository.mutate(invalid)
        );

        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, exception.reasonCode());
        verifyNoInteractions(redis);
    }

    @Test
    void processStartedMutationMustRequireBothPidAndStartInstantBeforeRedis() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);
        CrawlerQueueV2Repository.MutationCommand invalid = new CrawlerQueueV2Repository.MutationCommand(
            "epoch-1", "queue-1", "attempt-1", "standard", "standard:domain-source-bosses:fresh",
            List.of("bosses"), 142L, 2L, CrawlerQueueV2Status.STARTING, null,
            NOW, NOW.plusSeconds(90), null, null, null, null, null, null,
            12345L, null, false, null, "attempt.process-started"
        );

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> repository.mutate(invalid)
        );

        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, exception.reasonCode());
        verifyNoInteractions(redis);
    }

    @Test
    void shouldRejectTerminalMutationWithoutAtomicOwnershipRelease() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);
        CrawlerQueueV2Repository.MutationCommand terminal = terminalMutation();
        CrawlerQueueV2Repository.MutationCommand invalid = new CrawlerQueueV2Repository.MutationCommand(
            terminal.expectedEpoch(), terminal.queueId(), terminal.attemptId(), terminal.lane(),
            terminal.dedupeKey(), terminal.coveredDomains(), terminal.expectedFenceToken(),
            terminal.expectedStateVersion(), terminal.targetStatus(), terminal.reasonCode(),
            terminal.enteredAt(), terminal.deadlineAt(), terminal.lastHeartbeatAt(),
            terminal.progressSequence(), terminal.phase(), terminal.current(), terminal.total(),
            terminal.workerMessage(), terminal.pid(), terminal.processStartedAt(), false, null,
            terminal.eventType()
        );

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> repository.mutate(invalid)
        );

        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, exception.reasonCode());
        verifyNoInteractions(redis);
    }

    private RedisCrawlerQueueV2Repository repository(StringRedisTemplate redis, String prefix) {
        return new RedisCrawlerQueueV2Repository(
            objectMapper,
            redis,
            Clock.fixed(NOW, ZoneOffset.UTC),
            prefix
        );
    }

    private CrawlerQueueV2Event event(String type, long stateVersion) {
        return new CrawlerQueueV2Event(
            type, "epoch-1", "queue-1", "attempt-1", null, stateVersion,
            CrawlerQueueV2Status.STARTING, null, NOW
        );
    }

    private CrawlerQueueV2Repository.MutationCommand mutation(
        long progressSequence,
        long fenceToken,
        long stateVersion
    ) {
        return new CrawlerQueueV2Repository.MutationCommand(
            "epoch-1", "queue-1", "attempt-1", "standard", "standard:domain-source-bosses:fresh",
            List.of("bosses"), fenceToken, stateVersion,
            CrawlerQueueV2Status.RUNNING, null, NOW, NOW.plusSeconds(90), NOW,
            progressSequence, "crawl-pages", 1L, 10L, "running", null,
            null, false, null, "attempt.progressed"
        );
    }

    private CrawlerQueueV2Repository.MutationCommand terminalMutation() {
        return new CrawlerQueueV2Repository.MutationCommand(
            "epoch-1", "queue-1", "attempt-1", "standard", "standard:domain-source-bosses:fresh",
            List.of("bosses"), 142L, 2L, CrawlerQueueV2Status.COMPLETED, null,
            NOW, null, NOW, 1L, "complete", 10L, 10L, "completed", null,
            null, true, null, "attempt.transitioned"
        );
    }

    private CrawlerQueueV2Repository.MutationCommand unconfirmedTerminationMutation() {
        return new CrawlerQueueV2Repository.MutationCommand(
            "epoch-1", "queue-1", "attempt-1", "standard", "standard:domain-source-bosses:fresh",
            List.of("bosses"), 142L, 2L, CrawlerQueueV2Status.FAILED,
            CrawlerQueueV2ReasonCode.PROCESS_TERMINATION_UNCONFIRMED,
            NOW, null, NOW, 1L, "terminating", 1L, 10L, "unconfirmed", null,
            null, false, Duration.ofMinutes(2), "attempt.transitioned"
        );
    }

    private CrawlerQueueV2Attempt completedAttempt() {
        CrawlerQueueV2Attempt source = command().attempt();
        return new CrawlerQueueV2Attempt(
            2, "epoch-1", "queue-1", "attempt-1", 142L, 3L,
            CrawlerQueueV2Status.COMPLETED, source.lane(), source.domain(), source.coveredDomains(),
            source.actionId(), null, source.requestedAt(), source.eligibleAt(), NOW, NOW.minusSeconds(1),
            NOW, NOW, null, 12345L, NOW.minusSeconds(1), 1L, "complete", 10L, 10L,
            "completed", null, source.artifacts()
        );
    }

    private CrawlerQueueV2Attempt failedUnconfirmedAttempt() {
        CrawlerQueueV2Attempt source = command().attempt();
        return new CrawlerQueueV2Attempt(
            2, "epoch-1", "queue-1", "attempt-1", 142L, 3L,
            CrawlerQueueV2Status.FAILED, source.lane(), source.domain(), source.coveredDomains(),
            source.actionId(), null, source.requestedAt(), source.eligibleAt(), NOW, NOW.minusSeconds(1),
            NOW, NOW, null, 12345L, NOW.minusSeconds(1), 1L, "terminating", 1L, 10L,
            "unconfirmed", CrawlerQueueV2ReasonCode.PROCESS_TERMINATION_UNCONFIRMED, source.artifacts()
        );
    }

    private void assertBeforeFirstWrite(String source, String required, int firstWrite) {
        int index = source.indexOf(required);
        assertTrue(index >= 0, () -> "Lua preflight is missing: " + required);
        assertTrue(index < firstWrite, () -> "Lua preflight occurs after the first write: " + required);
    }

    private void assertPreflightBeforeWrite(
        String fileName,
        String firstWriteText,
        List<String> requiredTerms
    ) throws Exception {
        String source = new ClassPathResource("redis/crawler-queue-v2/" + fileName)
            .getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        int firstWrite = source.indexOf(firstWriteText);
        assertTrue(firstWrite > 0, () -> fileName + " has no expected first write");
        for (String required : requiredTerms) {
            int index = source.indexOf(required);
            assertTrue(index >= 0, () -> fileName + " is missing " + required);
            assertTrue(index < firstWrite, () -> fileName + " checks " + required + " after its first write");
        }
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

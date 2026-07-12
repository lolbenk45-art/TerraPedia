package com.terraria.skills.service.impl.crawlerv2;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.connection.RedisPassword;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RedisCrawlerQueueV2RepositoryIntegrationTest {

    private static final Instant NOW = Instant.parse("2026-07-11T13:00:00Z");

    private final ObjectMapper objectMapper = new ObjectMapper()
        .registerModule(new JavaTimeModule())
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    private LettuceConnectionFactory connectionFactory;
    private StringRedisTemplate redis;
    private RedisCrawlerQueueV2Repository repository;
    private String prefix;

    @BeforeEach
    void setUp() {
        String host = System.getenv("TERRAPEDIA_TEST_REDIS_HOST");
        String database = System.getenv("TERRAPEDIA_TEST_REDIS_DB");
        Assumptions.assumeTrue(host != null && !host.isBlank());
        Assumptions.assumeTrue(database != null && !database.isBlank());

        RedisStandaloneConfiguration configuration = new RedisStandaloneConfiguration(
            host,
            Integer.parseInt(System.getenv().getOrDefault("TERRAPEDIA_TEST_REDIS_PORT", "6379"))
        );
        configuration.setDatabase(Integer.parseInt(database));
        String password = System.getenv("TERRAPEDIA_TEST_REDIS_PASSWORD");
        if (password != null && !password.isBlank()) {
            configuration.setPassword(RedisPassword.of(password));
        }
        connectionFactory = new LettuceConnectionFactory(configuration);
        connectionFactory.afterPropertiesSet();
        connectionFactory.start();
        redis = new StringRedisTemplate(connectionFactory);
        redis.afterPropertiesSet();

        prefix = RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX + "test:" + UUID.randomUUID() + ":";
        repository = new RedisCrawlerQueueV2Repository(
            objectMapper,
            redis,
            Clock.fixed(NOW, ZoneOffset.UTC),
            prefix
        );
        redis.opsForValue().set(prefix + "meta:engine", "v2");
        redis.opsForValue().set(prefix + "meta:epoch", "epoch-current");
    }

    @AfterEach
    void tearDown() {
        if (redis != null && prefix != null) {
            Set<String> keys = redis.keys(prefix + "*");
            if (keys != null && !keys.isEmpty()) {
                redis.delete(keys);
            }
        }
        if (connectionFactory != null) {
            connectionFactory.destroy();
        }
    }

    @Test
    void shouldIgnoreOldEpochDedupeLeaseAndQuarantineEvidence() throws Exception {
        CrawlerQueueV2Repository.CreateQueueCommand command = createCommand(
            "queue-current", "attempt-current", List.of("bosses", "npcs")
        );
        CrawlerQueueV2Attempt oldAttempt = attempt(
            "epoch-old", "queue-old", "attempt-old", List.of("bosses", "npcs"),
            CrawlerQueueV2Status.RUNNING, 7L, 91L, null
        );
        redis.opsForValue().set(prefix + "attempt:attempt-old", objectMapper.writeValueAsString(oldAttempt));
        redis.opsForValue().set(prefix + "dedupe:" + command.queue().dedupeKey(), "attempt-old");

        CrawlerQueueV2Repository.EnqueueResult enqueue = repository.createQueue(command);

        assertEquals(CrawlerQueueV2Repository.EnqueueCode.CREATED, enqueue.code());
        String oldLease = objectMapper.writeValueAsString(new LeaseEvidence(
            "epoch-old", "queue-old", "attempt-old", 91L
        ));
        String oldQuarantine = objectMapper.writeValueAsString(new QuarantineEvidence(
            "epoch-old", "attempt-old", NOW.plusSeconds(300)
        ));
        redis.opsForValue().set(prefix + "domain:bosses:lease", oldLease);
        redis.opsForValue().set(prefix + "domain:npcs:quarantine", oldQuarantine);

        CrawlerQueueV2Repository.ClaimResult claim = repository.claim(claimCommand(command));

        assertEquals(CrawlerQueueV2Repository.ClaimCode.CLAIMED, claim.code());
        assertTrue(claim.fenceToken() > 0L);
        assertTrue(redis.opsForValue().get(prefix + "domain:bosses:lease").contains("attempt-current"));
        assertTrue(redis.opsForValue().get(prefix + "domain:npcs:lease").contains("attempt-current"));
    }

    @Test
    void shouldKeepMultiDomainClaimAllOrNothingAndFenceEveryMutation() throws Exception {
        CrawlerQueueV2Repository.CreateQueueCommand command = createCommand(
            "queue-current", "attempt-current", List.of("bosses", "npcs")
        );
        repository.createQueue(command);
        redis.opsForValue().set(
            prefix + "domain:bosses:quarantine",
            objectMapper.writeValueAsString(new QuarantineEvidence(
                "epoch-current", "attempt-quarantined", NOW.plusSeconds(300)
            ))
        );

        CrawlerQueueV2Repository.ClaimResult quarantined = repository.claim(claimCommand(command));

        assertEquals(CrawlerQueueV2Repository.ClaimCode.QUARANTINED, quarantined.code());
        assertEquals("attempt-quarantined", quarantined.ownerAttemptId());
        assertNull(redis.opsForValue().get(prefix + "domain:npcs:lease"));
        redis.delete(prefix + "domain:bosses:quarantine");
        redis.opsForValue().set(
            prefix + "domain:npcs:lease",
            objectMapper.writeValueAsString(new LeaseEvidence(
                "epoch-current", "queue-other", "attempt-other", 77L
            ))
        );

        CrawlerQueueV2Repository.ClaimResult conflict = repository.claim(claimCommand(command));

        assertEquals(CrawlerQueueV2Repository.ClaimCode.OWNERSHIP_CONFLICT, conflict.code());
        assertEquals("attempt-other", conflict.ownerAttemptId());
        assertNull(redis.opsForValue().get(prefix + "domain:bosses:lease"));

        redis.delete(prefix + "domain:npcs:lease");
        CrawlerQueueV2Repository.ClaimResult claimed = repository.claim(claimCommand(command));
        String currentLease = redis.opsForValue().get(prefix + "domain:bosses:lease");
        redis.opsForValue().set(
            prefix + "domain:npcs:lease",
            objectMapper.writeValueAsString(new LeaseEvidence(
                "epoch-current", "queue-other", "attempt-other", 77L
            )),
            Duration.ofSeconds(90)
        );
        Long beforeFailedRenew = redis.getExpire(prefix + "domain:bosses:lease", TimeUnit.MILLISECONDS);
        assertFalse(repository.renewLeases(new CrawlerQueueV2Repository.RenewLeaseCommand(
            "epoch-current", "queue-current", "attempt-current", claimed.fenceToken(),
            List.of("bosses", "npcs"), Duration.ofSeconds(90)
        )));
        Long afterFailedRenew = redis.getExpire(prefix + "domain:bosses:lease", TimeUnit.MILLISECONDS);
        assertTrue(afterFailedRenew <= beforeFailedRenew);
        redis.opsForValue().set(prefix + "domain:npcs:lease", currentLease, Duration.ofSeconds(90));
        assertTrue(repository.renewLeases(new CrawlerQueueV2Repository.RenewLeaseCommand(
            "epoch-current", "queue-current", "attempt-current", claimed.fenceToken(),
            List.of("bosses", "npcs"), Duration.ofSeconds(90)
        )));
        CrawlerQueueV2Exception staleVersion = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> repository.mutate(mutationCommand(
                command, claimed.fenceToken(), 1L, CrawlerQueueV2Status.RUNNING, 1L, false
            ))
        );
        assertEquals(CrawlerQueueV2ReasonCode.STALE_STATE_VERSION, staleVersion.reasonCode());
        CrawlerQueueV2Exception staleFence = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> repository.mutate(mutationCommand(
                command, claimed.fenceToken() + 1L, 2L, CrawlerQueueV2Status.RUNNING, 1L, false
            ))
        );
        assertEquals(
            CrawlerQueueV2ReasonCode.STALE_FENCE_TOKEN,
            staleFence.reasonCode(),
            staleFence.getMessage()
        );
        redis.delete(List.of(
            prefix + "domain:bosses:lease",
            prefix + "domain:npcs:lease"
        ));
        CrawlerQueueV2Exception missingFence = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> repository.mutate(mutationCommand(
                command, null, 2L, CrawlerQueueV2Status.RUNNING, 1L, false
            ))
        );
        assertEquals(CrawlerQueueV2ReasonCode.STALE_FENCE_TOKEN, missingFence.reasonCode());
        redis.opsForValue().set(prefix + "domain:bosses:lease", currentLease, Duration.ofSeconds(90));
        redis.opsForValue().set(prefix + "domain:npcs:lease", currentLease, Duration.ofSeconds(90));

        CrawlerQueueV2Exception invalidTransition = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> repository.mutate(mutationCommand(
                command, claimed.fenceToken(), 2L, CrawlerQueueV2Status.PAUSED, 1L, false
            ))
        );
        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, invalidTransition.reasonCode());

        CrawlerQueueV2Repository.MutationResult running = repository.mutate(mutationCommand(
            command, claimed.fenceToken(), 2L, CrawlerQueueV2Status.RUNNING, 1L, false
        ));
        assertEquals(3L, running.attempt().stateVersion());
        CrawlerQueueV2Exception staleProgress = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> repository.mutate(mutationCommand(
                command, claimed.fenceToken(), 3L, CrawlerQueueV2Status.RUNNING, 1L, false
            ))
        );
        assertEquals(CrawlerQueueV2ReasonCode.STALE_FENCE_TOKEN, staleProgress.reasonCode());

        CrawlerQueueV2Repository.MutationResult terminal = repository.mutate(
            mutationCommand(command, claimed.fenceToken(), 3L, CrawlerQueueV2Status.COMPLETED, 2L, true)
        );
        assertEquals(CrawlerQueueV2Status.COMPLETED, terminal.attempt().status());
        assertFalse(redis.hasKey(prefix + "domain:bosses:lease"));
        assertFalse(redis.hasKey(prefix + "domain:npcs:lease"));
        assertFalse(redis.hasKey(prefix + "dedupe:" + command.queue().dedupeKey()));
        assertFalse(redis.opsForSet().isMember(prefix + "index:attempts:live", "attempt-current"));

        CrawlerQueueV2Repository.MutationResult retry = repository.createRetry(retryCommand(command));
        assertEquals("attempt-retry", retry.attempt().attemptId());
        assertEquals(CrawlerQueueV2Status.QUEUED, retry.attempt().status());
        repository.writeReconcilerHealth(
            new CrawlerQueueV2Repository.ReconcilerHealth(
                NOW.plusSeconds(40), 2L, 1L, 0L, 0L, 0L, null
            ),
            new CrawlerQueueV2Event(
                "queue.health-changed", "epoch-current", null, null, null, null,
                null, null, NOW.plusSeconds(40)
            )
        );
        assertTrue(redis.hasKey(prefix + "health:reconciler"));
        List<CrawlerQueueV2Repository.EventEnvelope> events = repository.readEvents(
            "0-0", 20, Duration.ofMillis(1)
        );
        assertTrue(events.size() >= 5);
        assertEquals("queue.created", events.get(0).event().type());
        assertEquals("queue.health-changed", events.get(events.size() - 1).event().type());
        for (int index = 1; index < events.size(); index++) {
            assertFalse(events.get(index - 1).streamId().equals(events.get(index).streamId()));
        }
    }

    @Test
    void shouldLeaveNoPartialWritesWhenLuaPreflightFails() {
        CrawlerQueueV2Repository.CreateQueueCommand command = createCommand(
            "queue-current", "attempt-current", List.of("bosses", "npcs")
        );
        redis.opsForList().leftPush(prefix + "events", "wrong-type");

        CrawlerQueueV2Exception createFailure = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> repository.createQueue(command)
        );

        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, createFailure.reasonCode());
        assertFalse(redis.hasKey(prefix + "queue:queue-current"));
        assertFalse(redis.hasKey(prefix + "attempt:attempt-current"));
        assertFalse(redis.hasKey(prefix + "dedupe:" + command.queue().dedupeKey()));
        assertFalse(redis.hasKey(prefix + "lane:standard:ready"));
        redis.delete(prefix + "events");
        repository.createQueue(command);
        redis.opsForList().leftPush(prefix + "domain:npcs:quarantine", "wrong-type");

        CrawlerQueueV2Exception claimFailure = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> repository.claim(claimCommand(command))
        );

        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, claimFailure.reasonCode());
        assertFalse(redis.hasKey(prefix + "meta:fence-sequence"));
        assertFalse(redis.hasKey(prefix + "domain:bosses:lease"));
        assertEquals(
            CrawlerQueueV2Status.QUEUED,
            repository.findAttempt("attempt-current").orElseThrow().status()
        );
    }

    private CrawlerQueueV2Repository.ClaimCommand claimCommand(
        CrawlerQueueV2Repository.CreateQueueCommand command
    ) {
        return new CrawlerQueueV2Repository.ClaimCommand(
            "epoch-current",
            command.queue().queueId(),
            command.attempt().attemptId(),
            command.attempt().lane(),
            command.queue().dedupeKey(),
            1L,
            NOW.plusSeconds(10),
            NOW.plusSeconds(130),
            Duration.ofSeconds(90),
            command.attempt().coveredDomains(),
            new CrawlerQueueV2Event(
                "attempt.transitioned", "epoch-current", command.queue().queueId(),
                command.attempt().attemptId(), null, 2L,
                CrawlerQueueV2Status.STARTING, null, NOW.plusSeconds(10)
            )
        );
    }

    private CrawlerQueueV2Repository.MutationCommand mutationCommand(
        CrawlerQueueV2Repository.CreateQueueCommand command,
        Long fenceToken,
        long stateVersion,
        CrawlerQueueV2Status targetStatus,
        long progressSequence,
        boolean releaseOwnership
    ) {
        boolean terminal = targetStatus.terminal();
        return new CrawlerQueueV2Repository.MutationCommand(
            "epoch-current",
            command.queue().queueId(),
            command.attempt().attemptId(),
            command.attempt().lane(),
            command.queue().dedupeKey(),
            command.attempt().coveredDomains(),
            fenceToken,
            stateVersion,
            targetStatus,
            null,
            NOW.plusSeconds(20),
            terminal ? null : NOW.plusSeconds(110),
            NOW.plusSeconds(20),
            progressSequence,
            "crawl-pages",
            10L,
            10L,
            terminal ? "completed" : "running",
            12345L,
            NOW.plusSeconds(10),
            releaseOwnership,
            null,
            targetStatus == CrawlerQueueV2Status.RUNNING && stateVersion >= 3L
                ? "attempt.progressed"
                : "attempt.transitioned"
        );
    }

    private CrawlerQueueV2Repository.CreateRetryCommand retryCommand(
        CrawlerQueueV2Repository.CreateQueueCommand command
    ) {
        CrawlerQueueV2Queue queue = new CrawlerQueueV2Queue(
            2, "epoch-current", command.queue().queueId(), command.queue().lane(),
            command.queue().domain(), command.queue().coveredDomains(), command.queue().actionId(),
            command.queue().dedupeKey(), command.queue().requestedAt(), command.queue().requestedBy(),
            "attempt-retry", List.of("attempt-current", "attempt-retry"), null
        );
        CrawlerQueueV2Attempt attempt = new CrawlerQueueV2Attempt(
            2, "epoch-current", command.queue().queueId(), "attempt-retry", null, 1L,
            CrawlerQueueV2Status.QUEUED, command.attempt().lane(), command.attempt().domain(),
            command.attempt().coveredDomains(), command.attempt().actionId(), "attempt-current",
            NOW.plusSeconds(30), NOW.plusSeconds(30), NOW.plusSeconds(30), null, null, null,
            NOW.plusSeconds(150), null, null, 0L, null, null, null, null, null,
            new CrawlerQueueV2Artifacts(
                "reports/crawler-monitor/v2/attempt-retry/progress.json",
                "reports/crawler-monitor/v2/attempt-retry/run.log", null, null
            )
        );
        return new CrawlerQueueV2Repository.CreateRetryCommand(
            "epoch-current", queue, attempt, 4L, NOW.plusSeconds(30).toEpochMilli(),
            Duration.ofMinutes(10),
            new CrawlerQueueV2Event(
                "attempt.created", "epoch-current", queue.queueId(), attempt.attemptId(),
                null, 1L, CrawlerQueueV2Status.QUEUED, null, NOW.plusSeconds(30)
            )
        );
    }

    private CrawlerQueueV2Repository.CreateQueueCommand createCommand(
        String queueId,
        String attemptId,
        List<String> coveredDomains
    ) {
        CrawlerQueueV2Queue queue = new CrawlerQueueV2Queue(
            2, "epoch-current", queueId, "standard", "bosses", coveredDomains,
            "domain-source-bosses", "standard:domain-source-bosses:fresh", NOW,
            "integration-test", attemptId, List.of(attemptId), null
        );
        CrawlerQueueV2Attempt attempt = attempt(
            "epoch-current", queueId, attemptId, coveredDomains,
            CrawlerQueueV2Status.QUEUED, 1L, null, NOW.plusSeconds(120)
        );
        return new CrawlerQueueV2Repository.CreateQueueCommand(
            "epoch-current", queue, attempt, NOW.toEpochMilli(), Duration.ofMinutes(10),
            new CrawlerQueueV2Event(
                "queue.created", "epoch-current", queueId, attemptId, null, 1L,
                CrawlerQueueV2Status.QUEUED, null, NOW
            )
        );
    }

    private CrawlerQueueV2Attempt attempt(
        String epoch,
        String queueId,
        String attemptId,
        List<String> coveredDomains,
        CrawlerQueueV2Status status,
        long stateVersion,
        Long fenceToken,
        Instant deadlineAt
    ) {
        return new CrawlerQueueV2Attempt(
            2, epoch, queueId, attemptId, fenceToken, stateVersion, status,
            "standard", "bosses", coveredDomains, "domain-source-bosses", null,
            NOW, NOW, NOW, null, null, status == CrawlerQueueV2Status.RUNNING ? NOW : null,
            deadlineAt, null, null, 0L, null, null, null, null, null,
            new CrawlerQueueV2Artifacts(
                "reports/crawler-monitor/v2/" + attemptId + "/progress.json",
                "reports/crawler-monitor/v2/" + attemptId + "/run.log",
                null,
                null
            )
        );
    }

    private record LeaseEvidence(
        String stateStoreEpoch,
        String queueId,
        String attemptId,
        long fenceToken
    ) {}

    private record QuarantineEvidence(
        String stateStoreEpoch,
        String attemptId,
        Instant expiresAt
    ) {}
}

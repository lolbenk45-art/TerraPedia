package com.terraria.skills.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.mockito.ArgumentCaptor;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.data.redis.core.ListOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.script.RedisScript;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WikiMonitorDispatchQueueRepositoryTest {

    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};
    private static final Instant BASE_TIME = Instant.parse("2026-06-21T00:00:00Z");

    @TempDir
    private Path repoRoot;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void jsonFallbackMaintainsFifoPositionsAndMirrorWithoutPersistingDerivedFields() throws Exception {
        WikiMonitorDispatchQueueRepository repository = jsonRepository(BASE_TIME);

        WikiMonitorQueueItem first = newItem("standard", "items", "wiki-core-refresh", BASE_TIME);
        WikiMonitorQueueItem second = newItem("standard", "bosses", "domain-source-bosses", BASE_TIME.plusSeconds(1));

        WikiMonitorDispatchQueueRepository.EnqueueResult firstResult = repository.enqueue(first, null);
        WikiMonitorDispatchQueueRepository.EnqueueResult secondResult = repository.enqueue(second, null);

        assertTrue(firstResult.created());
        assertTrue(secondResult.created());
        List<WikiMonitorQueueItem> items = repository.listItems();
        assertEquals(List.of(first.getQueueId(), second.getQueueId()), items.stream().map(WikiMonitorQueueItem::getQueueId).toList());
        assertEquals(1, repository.positionFor(first.getQueueId()).orElseThrow().position());
        assertEquals(2, repository.positionFor(second.getQueueId()).orElseThrow().lanePosition());

        repository.markTerminal(first.getQueueId(), "completed", BASE_TIME.plusSeconds(5), "完成");

        assertEquals(1, repository.positionFor(second.getQueueId()).orElseThrow().position());
        assertTrue(repository.findItem(first.getQueueId()).orElseThrow().isTerminal());
        String mirrorJson = Files.readString(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        assertFalse(mirrorJson.contains("\"position\""));
        assertFalse(mirrorJson.contains("\"lanePosition\""));
        assertFalse(mirrorJson.contains("\"skipped\""));

        Map<String, Object> mirror = objectMapper.readValue(mirrorJson, MAP_TYPE);
        assertEquals(1, mirror.get("queuedCount"));
        assertEquals(1, mirror.get("completedCount"));
        assertNotNull(mirror.get("generatedAt"));
    }

    @Test
    void jsonFallbackHandlesDedupeCooldownCancellationClaimsRunningTerminalAndPruning() throws Exception {
        WikiMonitorDispatchQueueRepository repository = jsonRepository(BASE_TIME);
        Instant cooldownUntil = BASE_TIME.plus(Duration.ofMinutes(30));
        repository.recordCooldown("standard", "wiki-core-refresh", "dispatch-completed", BASE_TIME, cooldownUntil);

        WikiMonitorQueueItem blocked = newItem("standard", "items", "wiki-core-refresh", BASE_TIME.plusSeconds(1));
        WikiMonitorDispatchQueueRepository.EnqueueResult blockedResult = repository.enqueue(blocked, cooldownUntil);
        WikiMonitorDispatchQueueRepository.EnqueueResult duplicateBlockedResult =
            repository.enqueue(newItem("standard", "npcs", "wiki-core-refresh", BASE_TIME.plusSeconds(2)), cooldownUntil);

        assertTrue(blockedResult.created());
        assertFalse(duplicateBlockedResult.created());
        assertEquals(blocked.getQueueId(), duplicateBlockedResult.item().getQueueId());
        assertEquals("blocked_cooldown", blockedResult.item().getStatus());
        assertEquals(cooldownUntil.toString(), repository.cooldownUntilFor("standard", "wiki-core-refresh").orElseThrow().toString());
        assertTrue(repository.dedupeLookup("standard", "wiki-core-refresh").isPresent());

        WikiMonitorQueueItem cancellable = newItem("standard", "bosses", "domain-source-bosses", BASE_TIME.plusSeconds(3));
        repository.enqueue(cancellable, null);
        assertTrue(repository.cancelQueued(cancellable.getQueueId(), "取消").cancelled());
        assertEquals("cancelled", repository.findItem(cancellable.getQueueId()).orElseThrow().getStatus());
        assertTrue(repository.dedupeLookup("standard", "domain-source-bosses").isEmpty());

        WikiMonitorQueueItem running = newItem("domain_smoke", "all", "wiki-monitor-domain-smoke", BASE_TIME.plusSeconds(4));
        repository.enqueue(running, null);
        WikiMonitorDispatchQueueRepository.ClaimResult claim =
            repository.claimForStart(running.getQueueId(), "queue-drain:domain_smoke:test-host:2026-06-21T00:00:04Z");
        assertTrue(claim.claimed());
        WikiMonitorQueueItem starting = repository.findItem(running.getQueueId()).orElseThrow();
        assertEquals("starting", starting.getStatus());
        assertNotNull(starting.getClaimOwner());
        assertNotNull(starting.getClaimedAt());
        assertNotNull(starting.getClaimExpiresAt());

        repository.markRunning(
            running.getQueueId(),
            "dispatch-running",
            1234L,
            BASE_TIME.plusSeconds(5),
            BASE_TIME.plusSeconds(5),
            new WikiMonitorDispatchQueueRepository.QueuePaths(
                "reports/progress.json",
                "reports/report.json",
                "reports/lock.json",
                "reports/output",
                "reports/log.txt"
            )
        );
        WikiMonitorQueueItem markedRunning = repository.findByDispatchId("dispatch-running").orElseThrow();
        assertEquals(running.getQueueId(), markedRunning.getQueueId());
        assertEquals("reports/log.txt", markedRunning.getLogPath());
        assertNull(markedRunning.getClaimOwner());
        assertNull(markedRunning.getClaimedAt());
        assertNull(markedRunning.getClaimExpiresAt());
        assertEquals(1234L, markedRunning.getPid());

        repository.mirrorSnapshot();
        Map<String, Object> runningMirror = readMirror();
        assertTrue(((Map<?, ?>) runningMirror.get("dispatches")).containsKey("dispatch-running"));
        assertTrue(((Map<?, ?>) runningMirror.get("dedupe")).containsKey("terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:domain_smoke:wiki-monitor-domain-smoke:all"));

        assertFalse(repository.cancelQueued(running.getQueueId(), "运行中不能取消队列").cancelled());
        assertTrue(((Map<?, ?>) readMirror().get("dedupe")).containsKey("terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:domain_smoke:wiki-monitor-domain-smoke:all"));
        assertTrue(repository.findByDispatchId("dispatch-running").isPresent());
        WikiMonitorDispatchQueueRepository.TransitionResult invalidTerminal =
            repository.markTerminal(running.getQueueId(), "running", BASE_TIME.plusSeconds(7), "无效终态");
        assertFalse(invalidTerminal.changed());
        assertTrue(((Map<?, ?>) readMirror().get("dedupe")).containsKey("terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:domain_smoke:wiki-monitor-domain-smoke:all"));
        assertTrue(repository.findByDispatchId("dispatch-running").isPresent());

        repository.markTerminal(running.getQueueId(), "failed", BASE_TIME.plusSeconds(8), "失败");
        assertTrue(repository.findByDispatchId("dispatch-running").isEmpty());
        assertFalse(((Map<?, ?>) readMirror().get("dedupe")).containsKey("terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:domain_smoke:wiki-monitor-domain-smoke:all"));

        WikiMonitorQueueItem expiredStarting = newItem("standard", "buffs", "buff-page-immunity-refresh", BASE_TIME.minus(Duration.ofDays(10)));
        repository.enqueue(expiredStarting, null);
        repository.claimForStart(expiredStarting.getQueueId(), "expired-starting");
        WikiMonitorQueueItem expiredRunning = newItem("standard", "recipes", "recipe-reference-sync", BASE_TIME.minus(Duration.ofDays(10)));
        repository.enqueue(expiredRunning, null);
        repository.claimForStart(expiredRunning.getQueueId(), "expired-running");
        repository.markRunning(expiredRunning.getQueueId(), "dispatch-old-running", 4321L, BASE_TIME.minus(Duration.ofDays(10)), BASE_TIME.minus(Duration.ofDays(10)), null);
        for (int i = 0; i < 105; i++) {
            WikiMonitorQueueItem terminal = newItem("standard", "old-" + i, "old-action-" + i, BASE_TIME.minus(Duration.ofDays(10)).plusSeconds(i));
            repository.enqueue(terminal, null);
            repository.markTerminal(terminal.getQueueId(), "failed", BASE_TIME.minus(Duration.ofDays(10)).plusSeconds(i), "旧终态");
        }

        repository.pruneTerminalItems(BASE_TIME);

        assertTrue(repository.findItem(expiredStarting.getQueueId()).isPresent());
        assertTrue(repository.findItem(expiredRunning.getQueueId()).isPresent());
        long terminalCount = repository.listItems().stream().filter(WikiMonitorQueueItem::isTerminal).count();
        assertEquals(100, terminalCount);
    }

    @Test
    void startingJsonContainsClaimFieldsAndRunningAndTerminalClearThem() throws Exception {
        WikiMonitorDispatchQueueRepository repository = jsonRepository(BASE_TIME);
        WikiMonitorQueueItem item = newItem("standard", "items", "wiki-core-refresh", BASE_TIME);
        repository.enqueue(item, null);

        repository.claimForStart(item.getQueueId(), "claim-owner");

        String startingJson = Files.readString(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        assertTrue(startingJson.contains("\"claimOwner\""));
        assertTrue(startingJson.contains("\"claimedAt\""));
        assertTrue(startingJson.contains("\"claimExpiresAt\""));

        repository.markRunning(item.getQueueId(), "dispatch-1", 111L, BASE_TIME.plusSeconds(1), BASE_TIME.plusSeconds(1), null);
        String runningJson = Files.readString(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        assertFalse(runningJson.contains("\"claimOwner\""));
        assertFalse(runningJson.contains("\"claimedAt\""));
        assertFalse(runningJson.contains("\"claimExpiresAt\""));

        repository.markTerminal(item.getQueueId(), "completed", BASE_TIME.plusSeconds(2), "完成");
        String terminalJson = Files.readString(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        assertFalse(terminalJson.contains("\"claimOwner\""));
        assertFalse(terminalJson.contains("\"claimedAt\""));
        assertFalse(terminalJson.contains("\"claimExpiresAt\""));
        assertEquals(cooldown(BASE_TIME.plusSeconds(2)), repository.cooldownUntilFor("standard", "wiki-core-refresh").orElseThrow());
    }

    @Test
    void jsonFallbackMutationsAndDrainMutexAreLocked() throws Exception {
        WikiMonitorDispatchQueueRepository repository = jsonRepository(BASE_TIME);
        WikiMonitorQueueItem item = newItem("standard", "items", "wiki-core-refresh", BASE_TIME);
        repository.enqueue(item, null);

        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger claimed = new AtomicInteger();
        Runnable claimer = () -> {
            ready.countDown();
            try {
                start.await(5, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            if (repository.claimForStart(item.getQueueId(), Thread.currentThread().getName()).claimed()) {
                claimed.incrementAndGet();
            }
        };
        Thread first = new Thread(claimer, "first-claimer");
        Thread second = new Thread(claimer, "second-claimer");
        first.start();
        second.start();
        assertTrue(ready.await(5, TimeUnit.SECONDS));
        start.countDown();
        first.join(5000);
        second.join(5000);

        assertEquals(1, claimed.get());

        AtomicInteger entered = new AtomicInteger();
        CountDownLatch enteredFirst = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        Thread lockHolder = new Thread(() -> repository.withDrainLock("first", "standard", () -> {
            entered.incrementAndGet();
            enteredFirst.countDown();
            try {
                releaseFirst.await(5, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }));
        lockHolder.start();
        assertTrue(enteredFirst.await(5, TimeUnit.SECONDS));
        boolean secondEntered = repository.withDrainLock("second", "standard", () -> entered.incrementAndGet());
        releaseFirst.countDown();
        lockHolder.join(5000);

        assertFalse(secondEntered);
        assertEquals(1, entered.get());

        CountDownLatch waitingDrainEntered = new CountDownLatch(1);
        Thread waitableDrain = new Thread(() -> {
            boolean enteredAfterRelease = repository.withDrainLock("third", "standard", true, () -> {
                entered.incrementAndGet();
                waitingDrainEntered.countDown();
            });
            assertTrue(enteredAfterRelease);
        }, "waitable-drain");
        CountDownLatch heldAgain = new CountDownLatch(1);
        CountDownLatch releaseAgain = new CountDownLatch(1);
        Thread secondLockHolder = new Thread(() -> repository.withDrainLock("second-holder", "standard", () -> {
            heldAgain.countDown();
            try {
                releaseAgain.await(5, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }), "second-drain-holder");
        secondLockHolder.start();
        assertTrue(heldAgain.await(5, TimeUnit.SECONDS));
        waitableDrain.start();
        releaseAgain.countDown();
        secondLockHolder.join(5000);
        waitableDrain.join(5000);

        assertTrue(waitingDrainEntered.await(5, TimeUnit.SECONDS));
        assertEquals(2, entered.get());

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(objectMapper, repoRoot);
        assertNotNull(service.getOverview().getWikiMonitor());
    }

    @Test
    @SuppressWarnings("unchecked")
    void redisEnqueueAndClaimUseScriptsAndDedupeTtl() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        ListOperations<String, String> listOperations = mock(ListOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(redisTemplate.opsForList()).thenReturn(listOperations);
        when(redisTemplate.execute(any(RedisScript.class), anyList(), any(Object[].class))).thenReturn("created", "claimed");
        when(valueOperations.get(anyString())).thenReturn(null);
        when(listOperations.range(anyString(), eq(0L), eq(-1L))).thenReturn(new ArrayList<>());

        WikiMonitorDispatchQueueRepository repository = new WikiMonitorDispatchQueueRepository(
            objectMapper,
            repoRoot,
            redisTemplate,
            Clock.fixed(BASE_TIME, ZoneOffset.UTC)
        );
        WikiMonitorQueueItem item = newItem("standard", "items", "wiki-core-refresh", BASE_TIME);

        repository.enqueue(item, null);
        repository.claimForStart(item.getQueueId(), "owner");

        ArgumentCaptor<Object[]> argsCaptor = ArgumentCaptor.forClass(Object[].class);
        verify(redisTemplate, atLeastOnce()).execute(any(RedisScript.class), anyList(), argsCaptor.capture());
        assertTrue(argsCaptor.getAllValues().stream()
            .anyMatch(args -> args.length == 3 && "86400".equals(args[2])));
        verify(redisTemplate, never()).expire(anyString(), anyLong(), any(TimeUnit.class));
    }

    @Test
    @SuppressWarnings("unchecked")
    void redisListItemsRestoresQueueFromMirrorWhenRedisIdsAreEmpty() throws Exception {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        ListOperations<String, String> listOperations = mock(ListOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(redisTemplate.opsForList()).thenReturn(listOperations);
        when(valueOperations.setIfAbsent(
            eq("terrapedia:crawler:wiki-monitor:dispatch-queue:restore-lock"),
            anyString(),
            eq(30L),
            eq(TimeUnit.SECONDS)
        )).thenReturn(true);
        AtomicBoolean restoredIds = new AtomicBoolean(false);
        when(listOperations.range("terrapedia:crawler:wiki-monitor:dispatch-queue:ids", 0, -1))
            .thenAnswer(invocation -> restoredIds.get() ? List.of("queue-from-mirror") : List.of());
        when(listOperations.rightPush("terrapedia:crawler:wiki-monitor:dispatch-queue:ids", "queue-from-mirror"))
            .thenAnswer(invocation -> {
                restoredIds.set(true);
                return 1L;
            });

        writeMirror(Map.ofEntries(
            Map.entry("generatedAt", "2026-06-21T00:00:00Z"),
            Map.entry("items", List.of(Map.ofEntries(
                Map.entry("queueId", "queue-from-mirror"),
                Map.entry("dispatchId", "dispatch-from-mirror"),
                Map.entry("lane", "standard"),
                Map.entry("domain", "town_npc_maintenance"),
                Map.entry("coveredDomains", List.of("town_npc_maintenance")),
                Map.entry("actionId", "domain-source-town-npc-maintenance"),
                Map.entry("status", "running"),
                Map.entry("requestedAt", "2026-06-21T00:00:00Z"),
                Map.entry("startedAt", "2026-06-21T00:01:00Z"),
                Map.entry("pid", 12345L),
                Map.entry("processStartedAt", "2026-06-21T00:01:00Z"),
                Map.entry("resumeMode", "resume"),
                Map.entry("message", "dispatch running")
            ))),
            Map.entry("dedupe", Map.of(
                "terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:standard:domain-source-town-npc-maintenance:resumeMode:resume",
                Map.of("queueId", "queue-from-mirror", "expiresAt", "2026-06-22T00:00:00Z")
            )),
            Map.entry("dispatches", Map.of("dispatch-from-mirror", "queue-from-mirror")),
            Map.entry("cooldowns", Map.of(
                "terrapedia:crawler:wiki-monitor:dispatch-queue:cooldown:standard:domain-source-town-npc-maintenance",
                Map.of(
                    "lane", "standard",
                    "actionId", "domain-source-town-npc-maintenance",
                    "completedDispatchId", "dispatch-completed",
                    "completedAt", "2026-06-20T23:00:00Z",
                    "cooldownUntil", "2026-06-20T23:30:00Z"
                )
            ))
        ));
        WikiMonitorQueueItem restored = newItem("standard", "town_npc_maintenance", "domain-source-town-npc-maintenance", BASE_TIME);
        restored.setQueueId("queue-from-mirror");
        restored.setDispatchId("dispatch-from-mirror");
        restored.setStatus("running");
        restored.setStartedAt(Instant.parse("2026-06-21T00:01:00Z"));
        restored.setPid(12345L);
        restored.setProcessStartedAt(Instant.parse("2026-06-21T00:01:00Z"));
        restored.setResumeMode("resume");
        when(valueOperations.get("terrapedia:crawler:wiki-monitor:dispatch-queue:item:queue-from-mirror"))
            .thenReturn(null)
            .thenReturn(queueJson(restored));

        WikiMonitorDispatchQueueRepository repository = new WikiMonitorDispatchQueueRepository(
            objectMapper,
            repoRoot,
            redisTemplate,
            Clock.fixed(BASE_TIME, ZoneOffset.UTC)
        );

        List<WikiMonitorQueueItem> items = repository.listItems();

        assertEquals(1, items.size());
        assertEquals("queue-from-mirror", items.get(0).getQueueId());
        assertEquals("running", items.get(0).getStatus());
        verify(listOperations).rightPush("terrapedia:crawler:wiki-monitor:dispatch-queue:ids", "queue-from-mirror");
        verify(valueOperations).set(eq("terrapedia:crawler:wiki-monitor:dispatch-queue:item:queue-from-mirror"), anyString());
        verify(valueOperations).set("terrapedia:crawler:wiki-monitor:dispatch-queue:dispatch:dispatch-from-mirror", "queue-from-mirror");
        verify(valueOperations).set(
            "terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:standard:domain-source-town-npc-maintenance:resumeMode:resume",
            "queue-from-mirror",
            86400L,
            TimeUnit.SECONDS
        );
        verify(valueOperations).set(eq("terrapedia:crawler:wiki-monitor:dispatch-queue:cooldown:standard:domain-source-town-npc-maintenance"), anyString());
    }

    @Test
    @SuppressWarnings("unchecked")
    void redisMirrorSnapshotDoesNotRestoreStaleMirrorWhenRedisIdsAreEmpty() throws Exception {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        ListOperations<String, String> listOperations = mock(ListOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(redisTemplate.opsForList()).thenReturn(listOperations);
        when(listOperations.range("terrapedia:crawler:wiki-monitor:dispatch-queue:ids", 0, -1)).thenReturn(List.of());
        writeMirror(Map.of(
            "generatedAt", "2026-06-21T00:00:00Z",
            "items", List.of(Map.of(
                "queueId", "stale-queue",
                "lane", "standard",
                "domain", "bosses",
                "actionId", "domain-source-bosses",
                "status", "queued",
                "requestedAt", "2026-06-21T00:00:00Z"
            ))
        ));
        WikiMonitorDispatchQueueRepository repository = new WikiMonitorDispatchQueueRepository(
            objectMapper,
            repoRoot,
            redisTemplate,
            Clock.fixed(BASE_TIME, ZoneOffset.UTC)
        );

        WikiMonitorDispatchQueueRepository.QueueSnapshot snapshot = repository.mirrorSnapshot();

        assertTrue(snapshot.items().isEmpty());
        assertTrue(((List<?>) readMirror().get("items")).isEmpty());
        verify(listOperations, never()).rightPush(anyString(), anyString());
        verify(valueOperations, never()).set(eq("terrapedia:crawler:wiki-monitor:dispatch-queue:item:stale-queue"), anyString());
    }

    @Test
    @SuppressWarnings("unchecked")
    void redisMirrorSnapshotPersistsCooldownsForMirrorRestore() throws Exception {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        ListOperations<String, String> listOperations = mock(ListOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(redisTemplate.opsForList()).thenReturn(listOperations);
        when(listOperations.range("terrapedia:crawler:wiki-monitor:dispatch-queue:ids", 0, -1)).thenReturn(List.of());
        String cooldownKey = "terrapedia:crawler:wiki-monitor:dispatch-queue:cooldown:standard:domain-source-town-npc-maintenance";
        when(redisTemplate.keys("terrapedia:crawler:wiki-monitor:dispatch-queue:cooldown:*")).thenReturn(Set.of(cooldownKey));
        when(valueOperations.get(cooldownKey)).thenReturn(objectMapper.findAndRegisterModules().writeValueAsString(
            new WikiMonitorDispatchQueueRepository.CooldownEntry(
                "standard",
                "domain-source-town-npc-maintenance",
                "dispatch-completed",
                BASE_TIME,
                BASE_TIME.plus(Duration.ofMinutes(30))
            )
        ));
        WikiMonitorDispatchQueueRepository repository = new WikiMonitorDispatchQueueRepository(
            objectMapper,
            repoRoot,
            redisTemplate,
            Clock.fixed(BASE_TIME, ZoneOffset.UTC)
        );

        repository.mirrorSnapshot();

        Map<String, Object> mirror = readMirror();
        assertTrue(((Map<?, ?>) mirror.get("cooldowns")).containsKey(cooldownKey));
    }

    @Test
    @SuppressWarnings("unchecked")
    void redisEnqueueCleansDedupeWhenScriptThrows() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(redisTemplate.execute(any(RedisScript.class), anyList(), any(Object[].class)))
            .thenThrow(new IllegalStateException("redis script interrupted"));

        WikiMonitorDispatchQueueRepository repository = new WikiMonitorDispatchQueueRepository(
            objectMapper,
            repoRoot,
            redisTemplate,
            Clock.fixed(BASE_TIME, ZoneOffset.UTC)
        );
        WikiMonitorQueueItem item = newItem("standard", "items", "wiki-core-refresh", BASE_TIME);

        assertThrows(IllegalStateException.class, () -> repository.enqueue(item, null));

        verify(redisTemplate).delete("terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:standard:wiki-core-refresh");
    }

    @Test
    @SuppressWarnings("unchecked")
    void redisPruneTerminalItemsRemovesTerminalItemKeysAndFifoIds() throws Exception {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        ListOperations<String, String> listOperations = mock(ListOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(redisTemplate.opsForList()).thenReturn(listOperations);

        WikiMonitorQueueItem running = newItem("standard", "running", "running-action", BASE_TIME.minus(Duration.ofDays(10)));
        running.setStatus("running");
        running.setDispatchId("dispatch-running");
        List<String> ids = new ArrayList<>();
        WikiMonitorQueueItem oldestTerminal = null;
        WikiMonitorQueueItem newestTerminal = null;
        for (int i = 0; i < 101; i++) {
            WikiMonitorQueueItem terminal = newItem("standard", "old-" + i, "old-action-" + i, BASE_TIME.minus(Duration.ofDays(10)).plusSeconds(i));
            terminal.setStatus("failed");
            terminal.setCompletedAt(BASE_TIME.minus(Duration.ofDays(10)).plusSeconds(i));
            terminal.setDispatchId("dispatch-old-" + i);
            if (i == 0) {
                oldestTerminal = terminal;
            }
            if (i == 100) {
                newestTerminal = terminal;
            }
            ids.add(terminal.getQueueId());
            when(valueOperations.get("terrapedia:crawler:wiki-monitor:dispatch-queue:item:" + terminal.getQueueId()))
                .thenReturn(queueJson(terminal));
        }
        ids.add(running.getQueueId());
        when(listOperations.range(anyString(), eq(0L), eq(-1L))).thenReturn(ids);
        when(valueOperations.get("terrapedia:crawler:wiki-monitor:dispatch-queue:item:" + running.getQueueId()))
            .thenReturn(queueJson(running));

        WikiMonitorDispatchQueueRepository repository = new WikiMonitorDispatchQueueRepository(
            objectMapper,
            repoRoot,
            redisTemplate,
            Clock.fixed(BASE_TIME, ZoneOffset.UTC)
        );

        repository.pruneTerminalItems(BASE_TIME);

        verify(redisTemplate).delete("terrapedia:crawler:wiki-monitor:dispatch-queue:item:" + oldestTerminal.getQueueId());
        verify(redisTemplate).delete("terrapedia:crawler:wiki-monitor:dispatch-queue:dispatch:" + oldestTerminal.getDispatchId());
        verify(listOperations).remove("terrapedia:crawler:wiki-monitor:dispatch-queue:ids", 0, oldestTerminal.getQueueId());
        verify(redisTemplate, never()).delete("terrapedia:crawler:wiki-monitor:dispatch-queue:item:" + newestTerminal.getQueueId());
        verify(redisTemplate, never()).delete("terrapedia:crawler:wiki-monitor:dispatch-queue:item:" + running.getQueueId());
    }

    @Test
    @SuppressWarnings("unchecked")
    void redisDrainLockReleasesOnlyMatchingOwnerThroughScript() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.setIfAbsent(
            eq("terrapedia:crawler:wiki-monitor:dispatch-queue:drain-lock"),
            anyString(),
            eq(30L),
            eq(TimeUnit.SECONDS)
        )).thenReturn(true);

        WikiMonitorDispatchQueueRepository repository = new WikiMonitorDispatchQueueRepository(
            objectMapper,
            repoRoot,
            redisTemplate,
            Clock.fixed(BASE_TIME, ZoneOffset.UTC)
        );

        assertTrue(repository.withDrainLock("test", "standard", () -> {}));

        verify(redisTemplate, never()).delete("terrapedia:crawler:wiki-monitor:dispatch-queue:drain-lock");
        verify(redisTemplate).execute(any(RedisScript.class), eq(List.of("terrapedia:crawler:wiki-monitor:dispatch-queue:drain-lock")), any(Object[].class));
    }

    @Test
    void redisClaimReturnsSkippedWhenCasScriptDoesNotWin() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.get(anyString())).thenReturn(null);
        when(redisTemplate.execute(any(RedisScript.class), anyList(), any(Object[].class))).thenReturn("conflict");

        WikiMonitorDispatchQueueRepository repository = new WikiMonitorDispatchQueueRepository(
            objectMapper,
            repoRoot,
            redisTemplate,
            Clock.fixed(BASE_TIME, ZoneOffset.UTC)
        );

        WikiMonitorDispatchQueueRepository.ClaimResult result = repository.claimForStart("queue-1", "owner");

        assertFalse(result.claimed());
        assertEquals("conflict", result.status());
    }

    @Test
    void serviceConstructorsRemainCompatible() throws Exception {
        Clock clock = Clock.fixed(BASE_TIME, ZoneOffset.UTC);
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = mock(CrawlerMonitorServiceImpl.ProcessLauncher.class);

        assertNotNull(new CrawlerMonitorServiceImpl(objectMapper, repoRoot));
        assertNotNull(new CrawlerMonitorServiceImpl(objectMapper, repoRoot, clock));
        assertNotNull(new CrawlerMonitorServiceImpl(objectMapper, repoRoot, clock, (StringRedisTemplate) null));
        assertNotNull(new CrawlerMonitorServiceImpl(objectMapper, repoRoot, clock, launcher));
        assertNotNull(new CrawlerMonitorServiceImpl(objectMapper, repoRoot, clock, null, launcher));
    }

    private WikiMonitorDispatchQueueRepository jsonRepository(Instant now) {
        return new WikiMonitorDispatchQueueRepository(
            objectMapper,
            repoRoot,
            null,
            Clock.fixed(now, ZoneOffset.UTC)
        );
    }

    private WikiMonitorQueueItem newItem(String lane, String domain, String actionId, Instant requestedAt) {
        WikiMonitorQueueItem item = new WikiMonitorQueueItem();
        item.setQueueId("wiki-monitor-queue-" + requestedAt.toEpochMilli() + "-" + domain + "-" + actionId);
        item.setLane(lane);
        item.setDomain(domain);
        item.setCoveredDomains(List.of(domain));
        item.setActionId(actionId);
        item.setRequestedAt(requestedAt);
        item.setRequestedBy("admin");
        item.setMessage("已加入队列");
        return item;
    }

    private Instant cooldown(Instant completedAt) {
        return completedAt.plus(Duration.ofMinutes(30));
    }

    private Map<String, Object> readMirror() throws Exception {
        return objectMapper.readValue(
            Files.readString(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json")),
            MAP_TYPE
        );
    }

    private void writeMirror(Map<String, Object> mirror) throws Exception {
        Path path = repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json");
        Files.createDirectories(path.getParent());
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(path.toFile(), mirror);
    }

    private String queueJson(WikiMonitorQueueItem item) throws Exception {
        return objectMapper.findAndRegisterModules().writeValueAsString(item);
    }
}

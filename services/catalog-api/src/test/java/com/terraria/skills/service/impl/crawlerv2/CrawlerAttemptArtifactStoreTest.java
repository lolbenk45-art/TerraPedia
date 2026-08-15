package com.terraria.skills.service.impl.crawlerv2;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.terraria.skills.config.CrawlerQueueV2Properties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.io.IOException;
import java.lang.reflect.Modifier;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CrawlerAttemptArtifactStoreTest {

    private static final Instant NOW = Instant.parse("2026-07-11T13:00:00Z");

    @TempDir
    Path repoRoot;

    @Test
    void shouldCreateOneDirectoryPerAttemptAndWriteManifestAtomically() throws Exception {
        CrawlerAttemptArtifactStore store = store();

        CrawlerAttemptArtifactStore.PreparedArtifacts prepared = store.prepare(
            "epoch-1", "queue-1", "attempt-1", "bosses", "domain-source-bosses", NOW
        );

        assertEquals(
            repoRoot.resolve("reports/crawler-monitor/v2/2026-07-11/attempt-1").normalize(),
            prepared.directory()
        );
        assertTrue(Files.exists(prepared.directory().resolve("attempt-manifest.json")));
        try (var files = Files.list(prepared.directory())) {
            assertTrue(files.noneMatch(path -> path.getFileName().toString().endsWith(".tmp")));
        }
        CrawlerAttemptManifest manifest = store.readManifest("attempt-1").orElseThrow();
        assertEquals("queue-1", manifest.queueId());
        assertEquals("attempt-1", manifest.attemptId());
        assertEquals(prepared.progressPath(), manifest.progressPath());
        assertEquals(prepared.logPath(), manifest.logPath());
    }

    @Test
    void shouldPersistTheExactAttemptArtifactsInTheImmutableManifest() {
        CrawlerAttemptArtifactStore store = store();
        String base = "reports/crawler-monitor/v2/2026-07-11/attempt-backend/";
        CrawlerQueueV2Artifacts artifacts = new CrawlerQueueV2Artifacts(
            base + "progress.json",
            base + "run.log",
            base + "report.json",
            null
        );

        CrawlerAttemptArtifactStore.PreparedArtifacts prepared = store.prepare(
            "epoch-1",
            "queue-1",
            "attempt-backend",
            "npcs",
            "wiki-npcs-refresh",
            NOW,
            artifacts
        );

        CrawlerAttemptManifest manifest = store.readManifest("attempt-backend").orElseThrow();
        assertEquals(artifacts.progressPath(), prepared.progressPath());
        assertEquals(artifacts.logPath(), prepared.logPath());
        assertEquals(artifacts.progressPath(), manifest.progressPath());
        assertEquals(artifacts.logPath(), manifest.logPath());
        assertEquals(artifacts.reportPath(), manifest.reportPath());
        assertEquals(artifacts.outputPath(), manifest.outputPath());
    }

    @Test
    void shouldPersistAnAttemptScopedOperationPlanWithoutLeavingTemporaryFiles() throws Exception {
        CrawlerAttemptArtifactStore store = store();
        CrawlerAttemptArtifactStore.PreparedArtifacts prepared = store.prepare(
            "epoch-1", "queue-1", "attempt-plan", "items", "wiki-items-force-refresh", NOW
        );
        CrawlerOperationPlanSnapshot plan = new CrawlerOperationPlanSnapshot(
            "force",
            "wiki-items-force-refresh",
            "强制重抓物品模块",
            "force",
            true,
            "Module:Iteminfo/data",
            "覆盖物品模块来源和标准化文件",
            "none",
            1L,
            null,
            true,
            false,
            null,
            "destructive",
            NOW
        );

        store.writeOperationPlan("attempt-plan", plan);

        assertEquals(plan, store.readOperationPlan("attempt-plan").orElseThrow());
        assertTrue(Files.exists(prepared.directory().resolve("operation-plan.json")));
        try (var files = Files.list(prepared.directory())) {
            assertTrue(files.noneMatch(path -> path.getFileName().toString().endsWith(".tmp")));
        }
    }

    @Test
    void shouldRejectNonCanonicalAttemptArtifactPaths() {
        CrawlerAttemptArtifactStore store = store();
        String base = "reports/crawler-monitor/v2/2026-07-11/attempt-invalid/";
        CrawlerQueueV2Artifacts invalid = new CrawlerQueueV2Artifacts(
            base + "progress.json",
            base + "run.log",
            "reports/backend-refresh/shared-report.json",
            null
        );

        assertThrows(IllegalArgumentException.class, () -> store.prepare(
            "epoch-1",
            "queue-1",
            "attempt-invalid",
            "npcs",
            "wiki-npcs-refresh",
            NOW,
            invalid
        ));
    }

    @Test
    void shouldReadLegacyManifestWithoutProcessIdentityFields() throws Exception {
        ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
        CrawlerAttemptArtifactStore store = store(objectMapper, new CrawlerQueueV2Properties());
        CrawlerAttemptArtifactStore.PreparedArtifacts prepared = store.prepare(
            "epoch-1", "queue-1", "attempt-1", "bosses", "domain-source-bosses", NOW
        );
        Path manifestPath = prepared.directory().resolve("attempt-manifest.json");
        ObjectNode legacyManifest = (ObjectNode) objectMapper.readTree(manifestPath.toFile());
        legacyManifest.remove(List.of("pid", "processStartedAt"));
        objectMapper.writeValue(manifestPath.toFile(), legacyManifest);

        CrawlerAttemptManifest manifest = store.readManifest("attempt-1").orElseThrow();

        assertNull(manifest.pid());
        assertNull(manifest.processStartedAt());
        assertEquals("attempt-1", manifest.attemptId());
    }

    @Test
    void malformedProgressMustUseDedicatedPayloadFailure() throws Exception {
        CrawlerAttemptArtifactStore store = store();
        CrawlerAttemptArtifactStore.PreparedArtifacts prepared = store.prepare(
            "epoch-1", "queue-1", "attempt-1", "bosses", "domain-source-bosses", NOW
        );
        Files.writeString(prepared.directory().resolve("progress.json"), "{broken-json");

        assertThrows(
            CrawlerAttemptArtifactStore.InvalidProgressPayloadException.class,
            () -> store.readProgress("attempt-1")
        );
    }

    @Test
    void progressPathSecurityFailureMustRemainASecurityFailure() {
        CrawlerAttemptArtifactStore store = store();
        CrawlerAttemptArtifactStore.PreparedArtifacts prepared = store.prepare(
            "epoch-1", "queue-1", "attempt-1", "bosses", "domain-source-bosses", NOW
        );
        CrawlerAttemptManifest manifest = store.readManifest("attempt-1").orElseThrow();
        store.writeManifest(withArtifactPaths(
            manifest,
            prepared.logPath(),
            manifest.logPath(),
            manifest.reportPath(),
            manifest.outputPath()
        ));

        assertThrows(SecurityException.class, () -> store.readProgress("attempt-1"));
    }

    @Test
    void progressIoFailureMustRemainAnArtifactFailure() throws Exception {
        CrawlerAttemptArtifactStore store = store();
        CrawlerAttemptArtifactStore.PreparedArtifacts prepared = store.prepare(
            "epoch-1", "queue-1", "attempt-1", "bosses", "domain-source-bosses", NOW
        );
        Files.createDirectory(prepared.directory().resolve("progress.json"));

        assertThrows(IllegalStateException.class, () -> store.readProgress("attempt-1"));
    }

    @Test
    void shouldReportAvailableEmptyMissingExpiredAndForbiddenLogs() throws Exception {
        CrawlerAttemptArtifactStore store = store();
        CrawlerAttemptArtifactStore.PreparedArtifacts prepared = store.prepare(
            "epoch-1", "queue-1", "attempt-1", "bosses", "domain-source-bosses", NOW
        );

        assertEquals(CrawlerAttemptLogAvailability.MISSING, store.logMetadata("attempt-1", NOW).availability());
        Files.createFile(prepared.directory().resolve("run.log"));
        assertEquals(CrawlerAttemptLogAvailability.EMPTY, store.logMetadata("attempt-1", NOW).availability());
        Files.writeString(prepared.directory().resolve("run.log"), "INFO started\n");
        assertEquals(CrawlerAttemptLogAvailability.AVAILABLE, store.logMetadata("attempt-1", NOW).availability());

        assertThrows(
            IllegalArgumentException.class,
            () -> store.expireArtifacts("attempt-1", NOW.plusSeconds(8 * 86_400L))
        );
        store.writeManifest(withStatus(
            store.readManifest("attempt-1").orElseThrow(),
            CrawlerQueueV2Status.COMPLETED,
            NOW
        ));
        store.expireArtifacts("attempt-1", NOW.plusSeconds(8 * 86_400L));
        CrawlerAttemptLogMetadata expired = store.logMetadata("attempt-1", NOW.plusSeconds(8 * 86_400L));
        assertEquals(CrawlerAttemptLogAvailability.EXPIRED, expired.availability());
        assertEquals(CrawlerQueueV2ReasonCode.LOG_EXPIRED, expired.reasonCode());

        CrawlerAttemptManifest escaped = store.readManifest("attempt-1").orElseThrow()
            .withLogPath("../../outside.log");
        store.writeManifest(escaped);
        assertEquals(CrawlerAttemptLogAvailability.FORBIDDEN, store.logMetadata("attempt-1", NOW).availability());
    }

    @Test
    void shouldReadLogByAttemptAndAdvanceByteOffset() throws Exception {
        CrawlerAttemptArtifactStore store = store();
        CrawlerAttemptArtifactStore.PreparedArtifacts prepared = store.prepare(
            "epoch-1", "queue-1", "attempt-1", "bosses", "domain-source-bosses", NOW
        );
        Files.writeString(prepared.directory().resolve("run.log"), "first\nsecond\n");

        CrawlerAttemptArtifactStore.LogChunk first = store.readLog("attempt-1", 0, 6, NOW);
        CrawlerAttemptArtifactStore.LogChunk second = store.readLog(
            "attempt-1", first.nextOffset(), 64, NOW
        );

        assertEquals(0, first.offset());
        assertEquals(6, first.nextOffset());
        assertEquals("first\n", first.content());
        assertTrue(first.truncated());
        assertEquals("second\n", second.content());
        assertFalse(second.truncated());
        assertThrows(IllegalArgumentException.class, () -> store.readLog("attempt-1", -1, 6, NOW));
    }

    @Test
    void shouldKeepUtf8CharactersWholeAcrossByteChunks() throws Exception {
        CrawlerAttemptArtifactStore store = store();
        CrawlerAttemptArtifactStore.PreparedArtifacts prepared = store.prepare(
            "epoch-1", "queue-1", "attempt-1", "bosses", "domain-source-bosses", NOW
        );
        Files.writeString(prepared.directory().resolve("run.log"), "中A");

        CrawlerAttemptArtifactStore.LogChunk first = store.readLog("attempt-1", 0, 1, NOW);
        CrawlerAttemptArtifactStore.LogChunk second = store.readLog(
            "attempt-1", first.nextOffset(), 1, NOW
        );

        assertEquals("中", first.content());
        assertEquals(3, first.nextOffset());
        assertTrue(first.truncated());
        assertEquals("A", second.content());
        assertEquals(4, second.nextOffset());
    }

    @Test
    void shouldKeepEvidenceOnCancelAndAllowCleanupOnlyForTerminalAttempts() throws Exception {
        CrawlerAttemptArtifactStore store = store();
        CrawlerAttemptArtifactStore.PreparedArtifacts prepared = store.prepare(
            "epoch-1", "queue-1", "attempt-1", "bosses", "domain-source-bosses", NOW
        );
        store.writeOperationPlan("attempt-1", new CrawlerOperationPlanSnapshot(
            "fresh", "domain-source-bosses", "重新抓取 Boss 页面", "fresh", true,
            "Boss source snapshot pages", "更新 Boss 来源、报告和断点文件", "none",
            null, null, true, true, "data/generated/resume/domain-source-bosses.resume.json",
            "summary", NOW
        ));
        Files.writeString(prepared.directory().resolve("progress.json"), "{\"status\":\"running\"}\n");
        Files.writeString(prepared.directory().resolve("run.log"), "WARN cancelled\n");

        assertThrows(IllegalArgumentException.class, () -> store.cleanupArtifacts(
            "attempt-1", CrawlerQueueV2Status.CANCELLED, "admin", NOW
        ));
        assertTrue(Files.exists(prepared.directory().resolve("run.log")));
        assertThrows(IllegalArgumentException.class, () -> store.cleanupArtifacts(
            "attempt-1", CrawlerQueueV2Status.RUNNING, "admin", NOW
        ));
        assertTrue(Files.exists(prepared.directory().resolve("run.log")));

        store.writeManifest(withStatus(
            store.readManifest("attempt-1").orElseThrow(),
            CrawlerQueueV2Status.CANCELLED,
            NOW
        ));

        CrawlerAttemptArtifactStore.CleanupResult result = store.cleanupArtifacts(
            "attempt-1", CrawlerQueueV2Status.CANCELLED, "admin", NOW
        );
        assertTrue(result.deletedPaths().contains(prepared.logPath()));
        assertFalse(Files.exists(prepared.directory().resolve("run.log")));
        assertFalse(Files.exists(prepared.directory().resolve("operation-plan.json")));
        assertTrue(Files.exists(prepared.directory().resolve("attempt-manifest.json")));
        CrawlerAttemptManifest cleaned = store.readManifest("attempt-1").orElseThrow();
        assertEquals("admin", cleaned.cleanedBy());
        assertEquals(CrawlerQueueV2Status.CANCELLED, cleaned.status());
        assertThrows(IllegalStateException.class, () -> store.cleanupArtifacts(
            "attempt-1", CrawlerQueueV2Status.CANCELLED, "second-admin", NOW.plusSeconds(1)
        ));
        CrawlerAttemptManifest afterRepeatedCleanup = store.readManifest("attempt-1").orElseThrow();
        assertEquals("admin", afterRepeatedCleanup.cleanedBy());
        assertEquals(cleaned.cleanedPaths(), afterRepeatedCleanup.cleanedPaths());
    }

    @Test
    void shouldCleanupAttemptEvidenceWithoutDeletingSharedCrawlerOutput() throws Exception {
        CrawlerAttemptArtifactStore store = store();
        CrawlerAttemptArtifactStore.PreparedArtifacts prepared = store.prepare(
            "epoch-1", "queue-armor", "attempt-armor", "armor_sets",
            "domain-source-armor-sets", NOW
        );
        Path progress = prepared.directory().resolve("progress.json");
        Path log = prepared.directory().resolve("run.log");
        Path report = repoRoot.resolve("reports/wiki-armorsetbonuses-refresh-2026-07-14.json");
        Path output = repoRoot.resolve("data/terraPedia/raw/wiki/module__armorsetbonuses.latest.json");
        Files.createDirectories(report.getParent());
        Files.createDirectories(output.getParent());
        Files.writeString(progress, "{\"status\":\"completed\"}\n");
        Files.writeString(log, "done\n");
        Files.writeString(report, "{}\n");
        Files.writeString(output, "{}\n");
        CrawlerAttemptManifest manifest = withArtifactPaths(
            store.readManifest("attempt-armor").orElseThrow(),
            prepared.progressPath(),
            prepared.logPath(),
            report.toString(),
            output.toString()
        );
        store.writeManifest(withStatus(manifest, CrawlerQueueV2Status.COMPLETED, NOW));

        CrawlerAttemptArtifactStore.CleanupResult result = store.cleanupArtifacts(
            "attempt-armor", CrawlerQueueV2Status.COMPLETED, "admin", NOW
        );

        assertFalse(Files.exists(progress));
        assertFalse(Files.exists(log));
        assertTrue(Files.exists(report));
        assertTrue(Files.exists(output));
        assertFalse(result.deletedPaths().contains(report.toString()));
        assertFalse(result.deletedPaths().contains(output.toString()));
    }

    @Test
    void shouldRetainNewestHundredOrSevenDaysAndNeverExpireNonTerminalAttempts() throws Exception {
        CrawlerQueueV2Properties belowMinimum = new CrawlerQueueV2Properties();
        belowMinimum.setTerminalRetentionCount(1);
        belowMinimum.setTerminalRetentionAge(Duration.ofDays(1));
        CrawlerAttemptArtifactStore store = store(belowMinimum);
        List<CrawlerQueueV2Attempt> attempts = new ArrayList<>();
        Instant oldBase = NOW.minus(Duration.ofDays(20));

        for (int index = 0; index < 100; index++) {
            String attemptId = "terminal-recent-" + index;
            Instant completedAt = NOW.minus(Duration.ofHours(100L - index));
            CrawlerAttemptArtifactStore.PreparedArtifacts prepared = store.prepare(
                "epoch-1", "queue-" + attemptId, attemptId,
                "bosses", "domain-source-bosses", completedAt
            );
            Files.writeString(prepared.directory().resolve("run.log"), "done\n");
            attempts.add(attempt(attemptId, CrawlerQueueV2Status.COMPLETED, completedAt));
        }

        String ageProtectedAttemptId = "terminal-age-protected";
        Instant ageProtectedCompletedAt = NOW.minus(Duration.ofDays(6));
        CrawlerAttemptArtifactStore.PreparedArtifacts ageProtected = store.prepare(
            "epoch-1", "queue-" + ageProtectedAttemptId, ageProtectedAttemptId,
            "bosses", "domain-source-bosses", ageProtectedCompletedAt
        );
        Files.writeString(ageProtected.directory().resolve("run.log"), "age protected\n");
        attempts.add(attempt(
            ageProtectedAttemptId,
            CrawlerQueueV2Status.FAILED,
            ageProtectedCompletedAt
        ));

        for (int index = 0; index < 2; index++) {
            String attemptId = "terminal-expired-" + index;
            Instant completedAt = oldBase.plusSeconds(index);
            CrawlerAttemptArtifactStore.PreparedArtifacts prepared = store.prepare(
                "epoch-1", "queue-" + attemptId, attemptId,
                "bosses", "domain-source-bosses", completedAt
            );
            Files.writeString(prepared.directory().resolve("run.log"), "expired\n");
            attempts.add(attempt(attemptId, CrawlerQueueV2Status.COMPLETED, completedAt));
        }

        String runningAttemptId = "running-old";
        CrawlerAttemptArtifactStore.PreparedArtifacts running = store.prepare(
            "epoch-1", "queue-" + runningAttemptId, runningAttemptId,
            "bosses", "domain-source-bosses", oldBase
        );
        Files.writeString(running.directory().resolve("run.log"), "still running\n");
        attempts.add(attempt(runningAttemptId, CrawlerQueueV2Status.RUNNING, null));

        CrawlerAttemptArtifactStore.RetentionResult result = store.applyRetention(attempts, NOW);

        assertEquals(List.of("terminal-expired-0", "terminal-expired-1"), result.expiredAttemptIds());
        assertTrue(result.retainedAttemptIds().contains(ageProtectedAttemptId));
        assertTrue(result.retainedAttemptIds().contains(runningAttemptId));
        assertEquals(
            CrawlerAttemptLogAvailability.EXPIRED,
            store.logMetadata("terminal-expired-0", NOW).availability()
        );
        assertTrue(Files.exists(running.directory().resolve("run.log")));
    }

    @Test
    void shouldKeepOldNonTerminalMissingLogAsMissingWithoutRetentionDeadline() {
        CrawlerAttemptArtifactStore store = store();
        Instant requestedAt = NOW.minus(Duration.ofDays(8));
        store.prepare(
            "epoch-1", "queue-1", "attempt-1", "bosses", "domain-source-bosses", requestedAt
        );

        CrawlerAttemptManifest manifest = store.readManifest("attempt-1").orElseThrow();
        assertNull(manifest.retentionExpiresAt());
        assertEquals(
            CrawlerAttemptLogAvailability.MISSING,
            store.logMetadata("attempt-1", NOW).availability()
        );
    }

    @Test
    void shouldRejectImmutableManifestIdentityDrift() {
        CrawlerAttemptArtifactStore store = store();
        store.prepare("epoch-1", "queue-1", "attempt-1", "bosses", "action-1", NOW);
        CrawlerAttemptManifest manifest = store.readManifest("attempt-1").orElseThrow();

        assertThrows(IllegalArgumentException.class, () -> store.writeManifest(withIdentity(
            manifest, 3, manifest.stateStoreEpoch(), manifest.queueId(), manifest.fenceToken(),
            manifest.domain(), manifest.actionId()
        )));
        assertThrows(IllegalArgumentException.class, () -> store.writeManifest(withIdentity(
            manifest, manifest.contractVersion(), "epoch-2", manifest.queueId(), manifest.fenceToken(),
            manifest.domain(), manifest.actionId()
        )));
        assertThrows(IllegalArgumentException.class, () -> store.writeManifest(withIdentity(
            manifest, manifest.contractVersion(), manifest.stateStoreEpoch(), "queue-2", manifest.fenceToken(),
            manifest.domain(), manifest.actionId()
        )));
        assertThrows(IllegalArgumentException.class, () -> store.writeManifest(withIdentity(
            manifest, manifest.contractVersion(), manifest.stateStoreEpoch(), manifest.queueId(),
            manifest.fenceToken(), "items", manifest.actionId()
        )));
        assertThrows(IllegalArgumentException.class, () -> store.writeManifest(withIdentity(
            manifest, manifest.contractVersion(), manifest.stateStoreEpoch(), manifest.queueId(),
            manifest.fenceToken(), manifest.domain(), "action-2"
        )));

        CrawlerAttemptManifest fenced = withIdentity(
            manifest, manifest.contractVersion(), manifest.stateStoreEpoch(), manifest.queueId(),
            1L, manifest.domain(), manifest.actionId()
        );
        store.writeManifest(fenced);
        assertEquals(1L, store.readManifest("attempt-1").orElseThrow().fenceToken());
        assertThrows(IllegalArgumentException.class, () -> store.writeManifest(withIdentity(
            fenced, fenced.contractVersion(), fenced.stateStoreEpoch(), fenced.queueId(),
            2L, fenced.domain(), fenced.actionId()
        )));

        CrawlerAttemptManifest processRecorded = withManifestProcessIdentity(
            fenced,
            12345L,
            NOW.minusSeconds(1)
        );
        store.writeManifest(processRecorded);
        assertEquals(12345L, store.readManifest("attempt-1").orElseThrow().pid());
        assertThrows(IllegalArgumentException.class, () -> store.writeManifest(
            withManifestProcessIdentity(processRecorded, 54321L, NOW)
        ));
        assertThrows(IllegalArgumentException.class, () -> store.writeManifest(
            withManifestProcessIdentity(processRecorded, null, null)
        ));
    }

    @Test
    void shouldPreflightAllEvidenceBeforeDeletingAnyFile() throws Exception {
        CrawlerAttemptArtifactStore store = store();
        CrawlerAttemptArtifactStore.PreparedArtifacts prepared = store.prepare(
            "epoch-1", "queue-1", "attempt-1", "bosses", "domain-source-bosses", NOW
        );
        Files.writeString(prepared.directory().resolve("progress.json"), "{}\n");
        Files.createDirectory(prepared.directory().resolve("run.log"));
        Files.writeString(prepared.directory().resolve("run.log/blocker"), "not a log file\n");
        store.writeManifest(withStatus(
            store.readManifest("attempt-1").orElseThrow(),
            CrawlerQueueV2Status.FAILED,
            NOW
        ));

        assertThrows(IllegalStateException.class, () -> store.cleanupArtifacts(
            "attempt-1", CrawlerQueueV2Status.FAILED, "admin", NOW
        ));

        assertTrue(Files.exists(prepared.directory().resolve("progress.json")));
        CrawlerAttemptManifest manifest = store.readManifest("attempt-1").orElseThrow();
        assertNull(manifest.cleanedAt());
        assertTrue(manifest.cleanedPaths().isEmpty());
    }

    @Test
    void shouldRejectSymbolicLinkLogsWithoutReadingTheirTarget() throws Exception {
        CrawlerAttemptArtifactStore store = store();
        CrawlerAttemptArtifactStore.PreparedArtifacts prepared = store.prepare(
            "epoch-1", "queue-1", "attempt-1", "bosses", "domain-source-bosses", NOW
        );
        Path outside = repoRoot.resolve("outside.log");
        Files.writeString(outside, "outside secret\n");
        Files.createSymbolicLink(prepared.directory().resolve("run.log"), outside);

        assertEquals(
            CrawlerAttemptLogAvailability.FORBIDDEN,
            store.logMetadata("attempt-1", NOW).availability()
        );
        assertThrows(SecurityException.class, () -> store.readLog("attempt-1", 0, 64, NOW));
    }

    @Test
    void shouldSerializeConcurrentCleanupAndPreserveTheFirstAudit() throws Exception {
        CoordinatedCleanupObjectMapper objectMapper = new CoordinatedCleanupObjectMapper();
        CrawlerAttemptArtifactStore store = store(objectMapper, new CrawlerQueueV2Properties());
        CrawlerAttemptArtifactStore.PreparedArtifacts prepared = store.prepare(
            "epoch-1", "queue-1", "attempt-1", "bosses", "domain-source-bosses", NOW
        );
        Files.writeString(prepared.directory().resolve("progress.json"), "{}\n");
        Files.writeString(prepared.directory().resolve("run.log"), "done\n");
        store.writeManifest(withStatus(
            store.readManifest("attempt-1").orElseThrow(),
            CrawlerQueueV2Status.COMPLETED,
            NOW
        ));

        var executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            var first = executor.submit(() -> cleanupFailure(store, "admin-a", ready, start));
            var second = executor.submit(() -> cleanupFailure(store, "admin-b", ready, start));
            assertTrue(ready.await(1, TimeUnit.SECONDS));
            start.countDown();
            List<Throwable> failures = Arrays.asList(first.get(), second.get());

            assertEquals(1, failures.stream().filter(failure -> failure == null).count());
            assertEquals(1, failures.stream().filter(IllegalStateException.class::isInstance).count());
        } finally {
            executor.shutdownNow();
        }
        CrawlerAttemptManifest manifest = store.readManifest("attempt-1").orElseThrow();
        assertEquals(2, manifest.cleanedPaths().size());
        assertTrue(manifest.cleanedPaths().contains(prepared.progressPath()));
        assertTrue(manifest.cleanedPaths().contains(prepared.logPath()));
        assertTrue(List.of("admin-a", "admin-b").contains(manifest.cleanedBy()));
    }

    @Test
    void shouldSerializeEveryArtifactMutationEntryPoint() throws Exception {
        assertSynchronized("prepare", String.class, String.class, String.class,
            String.class, String.class, Instant.class);
        assertSynchronized("writeManifest", CrawlerAttemptManifest.class);
        assertSynchronized("cleanupArtifacts", String.class, CrawlerQueueV2Status.class,
            String.class, Instant.class);
        assertSynchronized("expireArtifacts", String.class, Instant.class);
        assertSynchronized("applyRetention", List.class, Instant.class);
    }

    @Test
    void shouldValidateAllRetentionIdentityBeforeExpiringAnyAttempt() throws Exception {
        CrawlerAttemptArtifactStore store = store();
        List<CrawlerQueueV2Attempt> attempts = new ArrayList<>();
        Instant oldBase = NOW.minus(Duration.ofDays(20));
        Path oldestLog = null;
        for (int index = 0; index < 101; index++) {
            String attemptId = "valid-" + index;
            Instant completedAt = oldBase.plusSeconds(index);
            CrawlerAttemptArtifactStore.PreparedArtifacts prepared = store.prepare(
                "epoch-1", "queue-" + attemptId, attemptId,
                "bosses", "domain-source-bosses", completedAt
            );
            Files.writeString(prepared.directory().resolve("run.log"), "done\n");
            if (index == 0) {
                oldestLog = prepared.directory().resolve("run.log");
            }
            attempts.add(attempt(attemptId, CrawlerQueueV2Status.COMPLETED, completedAt));
        }
        String mismatchId = "identity-mismatch";
        Instant mismatchCompletedAt = oldBase.plusSeconds(200);
        store.prepare(
            "epoch-1", "queue-" + mismatchId, mismatchId,
            "bosses", "domain-source-bosses", mismatchCompletedAt
        );
        CrawlerQueueV2Attempt mismatch = withQueueId(
            attempt(mismatchId, CrawlerQueueV2Status.COMPLETED, mismatchCompletedAt),
            "queue-wrong"
        );
        attempts.add(mismatch);

        assertThrows(IllegalArgumentException.class, () -> store.applyRetention(attempts, NOW));

        assertTrue(Files.exists(oldestLog));
        assertNull(store.readManifest("valid-0").orElseThrow().artifactsExpiredAt());
    }

    @Test
    void shouldRejectArtifactRoleAliasesBeforePreviewOrCleanup() throws Exception {
        CrawlerAttemptArtifactStore store = store();
        CrawlerAttemptArtifactStore.PreparedArtifacts prepared = store.prepare(
            "epoch-1", "queue-1", "attempt-1", "bosses", "domain-source-bosses", NOW
        );
        Files.writeString(prepared.directory().resolve("progress.json"), "progress\n");
        Files.writeString(prepared.directory().resolve("run.log"), "log\n");
        CrawlerAttemptManifest terminal = withStatus(
            store.readManifest("attempt-1").orElseThrow(),
            CrawlerQueueV2Status.COMPLETED,
            NOW
        );
        store.writeManifest(withArtifactPaths(
            terminal,
            prepared.progressPath(),
            prepared.progressPath(),
            prepared.logPath(),
            null
        ));

        assertEquals(
            CrawlerAttemptLogAvailability.FORBIDDEN,
            store.logMetadata("attempt-1", NOW).availability()
        );
        assertThrows(IllegalStateException.class, () -> store.cleanupArtifacts(
            "attempt-1", CrawlerQueueV2Status.COMPLETED, "admin", NOW
        ));
        assertTrue(Files.exists(prepared.directory().resolve("progress.json")));
        assertTrue(Files.exists(prepared.directory().resolve("run.log")));
    }

    @Test
    void shouldRejectInvalidAttemptIdentity() {
        CrawlerAttemptArtifactStore store = store();

        assertThrows(IllegalArgumentException.class, () -> store.prepare(
            "epoch-1", "queue-1", "../attempt-1", "bosses", "domain-source-bosses", NOW
        ));
        assertThrows(IllegalArgumentException.class, () -> store.readManifest("attempt/1"));
    }

    private CrawlerQueueV2Attempt attempt(
        String attemptId,
        CrawlerQueueV2Status status,
        Instant completedAt
    ) {
        return new CrawlerQueueV2Attempt(
            2, "epoch-1", "queue-" + attemptId, attemptId, 1L, 2L, status,
            "standard", "bosses", List.of("bosses"), "domain-source-bosses", null,
            NOW, NOW, NOW, NOW, completedAt, NOW, status.terminal() ? null : NOW.plusSeconds(90),
            null, null, 1L, "test", 1L, 1L, "test", null,
            new CrawlerQueueV2Artifacts(null, null, null, null)
        );
    }

    private CrawlerAttemptArtifactStore store() {
        return store(new CrawlerQueueV2Properties());
    }

    private CrawlerAttemptArtifactStore store(CrawlerQueueV2Properties properties) {
        return store(
            new ObjectMapper().registerModule(new JavaTimeModule()),
            properties
        );
    }

    private CrawlerAttemptArtifactStore store(
        ObjectMapper objectMapper,
        CrawlerQueueV2Properties properties
    ) {
        return new CrawlerAttemptArtifactStore(
            objectMapper,
            repoRoot,
            Clock.fixed(NOW, ZoneOffset.UTC),
            properties
        );
    }

    private CrawlerAttemptManifest withStatus(
        CrawlerAttemptManifest manifest,
        CrawlerQueueV2Status status,
        Instant completedAt
    ) {
        return new CrawlerAttemptManifest(
            manifest.contractVersion(), manifest.stateStoreEpoch(), manifest.queueId(), manifest.attemptId(),
            manifest.fenceToken(), manifest.domain(), manifest.actionId(), status, manifest.startedAt(),
            completedAt, manifest.reasonCode(), manifest.exitCode(), manifest.pid(), manifest.processStartedAt(),
            manifest.progressPath(), manifest.logPath(),
            manifest.reportPath(), manifest.outputPath(), manifest.retentionExpiresAt(),
            manifest.artifactsExpiredAt(), manifest.cleanedAt(), manifest.cleanedBy(), manifest.cleanedPaths()
        );
    }

    private CrawlerAttemptManifest withIdentity(
        CrawlerAttemptManifest manifest,
        int contractVersion,
        String stateStoreEpoch,
        String queueId,
        Long fenceToken,
        String domain,
        String actionId
    ) {
        return new CrawlerAttemptManifest(
            contractVersion, stateStoreEpoch, queueId, manifest.attemptId(), fenceToken, domain, actionId,
            manifest.status(), manifest.startedAt(), manifest.completedAt(), manifest.reasonCode(),
            manifest.exitCode(), manifest.pid(), manifest.processStartedAt(), manifest.progressPath(),
            manifest.logPath(), manifest.reportPath(),
            manifest.outputPath(), manifest.retentionExpiresAt(), manifest.artifactsExpiredAt(),
            manifest.cleanedAt(), manifest.cleanedBy(), manifest.cleanedPaths()
        );
    }

    private CrawlerAttemptManifest withArtifactPaths(
        CrawlerAttemptManifest manifest,
        String progressPath,
        String logPath,
        String reportPath,
        String outputPath
    ) {
        return new CrawlerAttemptManifest(
            manifest.contractVersion(), manifest.stateStoreEpoch(), manifest.queueId(), manifest.attemptId(),
            manifest.fenceToken(), manifest.domain(), manifest.actionId(), manifest.status(), manifest.startedAt(),
            manifest.completedAt(), manifest.reasonCode(), manifest.exitCode(), manifest.pid(),
            manifest.processStartedAt(), progressPath, logPath,
            reportPath, outputPath, manifest.retentionExpiresAt(), manifest.artifactsExpiredAt(),
            manifest.cleanedAt(), manifest.cleanedBy(), manifest.cleanedPaths()
        );
    }

    private CrawlerAttemptManifest withManifestProcessIdentity(
        CrawlerAttemptManifest manifest,
        Long pid,
        Instant processStartedAt
    ) {
        return new CrawlerAttemptManifest(
            manifest.contractVersion(), manifest.stateStoreEpoch(), manifest.queueId(), manifest.attemptId(),
            manifest.fenceToken(), manifest.domain(), manifest.actionId(), manifest.status(), manifest.startedAt(),
            manifest.completedAt(), manifest.reasonCode(), manifest.exitCode(), pid, processStartedAt,
            manifest.progressPath(), manifest.logPath(), manifest.reportPath(), manifest.outputPath(),
            manifest.retentionExpiresAt(), manifest.artifactsExpiredAt(), manifest.cleanedAt(),
            manifest.cleanedBy(), manifest.cleanedPaths()
        );
    }

    private CrawlerQueueV2Attempt withQueueId(CrawlerQueueV2Attempt attempt, String queueId) {
        return new CrawlerQueueV2Attempt(
            attempt.contractVersion(), attempt.stateStoreEpoch(), queueId, attempt.attemptId(),
            attempt.fenceToken(), attempt.stateVersion(), attempt.status(), attempt.lane(), attempt.domain(),
            attempt.coveredDomains(), attempt.actionId(), attempt.retryOfAttemptId(), attempt.requestedAt(),
            attempt.eligibleAt(), attempt.enteredAt(), attempt.startedAt(), attempt.completedAt(),
            attempt.lastHeartbeatAt(), attempt.deadlineAt(), attempt.pid(), attempt.processStartedAt(),
            attempt.progressSequence(), attempt.phase(), attempt.current(), attempt.total(),
            attempt.workerMessage(), attempt.reasonCode(), attempt.artifacts()
        );
    }

    private Throwable cleanupFailure(
        CrawlerAttemptArtifactStore store,
        String operator,
        CountDownLatch ready,
        CountDownLatch start
    ) {
        try {
            ready.countDown();
            if (!start.await(1, TimeUnit.SECONDS)) {
                return new IllegalStateException("concurrent cleanup did not start");
            }
            store.cleanupArtifacts(
                "attempt-1", CrawlerQueueV2Status.COMPLETED, operator, NOW
            );
            return null;
        } catch (InterruptedException failure) {
            Thread.currentThread().interrupt();
            return failure;
        } catch (Throwable failure) {
            return failure;
        }
    }

    private void assertSynchronized(String methodName, Class<?>... parameterTypes) throws Exception {
        assertTrue(Modifier.isSynchronized(
            CrawlerAttemptArtifactStore.class
                .getMethod(methodName, parameterTypes)
                .getModifiers()
        ));
    }

    private static final class CoordinatedCleanupObjectMapper extends ObjectMapper {
        private final CountDownLatch cleanupWrites = new CountDownLatch(2);

        private CoordinatedCleanupObjectMapper() {
            registerModule(new JavaTimeModule());
        }

        @Override
        public void writeValue(File resultFile, Object value) throws IOException {
            if (value instanceof CrawlerAttemptManifest manifest && manifest.cleanedAt() != null) {
                cleanupWrites.countDown();
                try {
                    cleanupWrites.await(1, TimeUnit.SECONDS);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IOException("cleanup coordination interrupted", exception);
                }
            }
            super.writeValue(resultFile, value);
        }
    }
}

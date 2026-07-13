package com.terraria.skills.service.impl.crawlerv2;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

class CrawlerLegacySnapshotReaderTest {

    private static final Instant NOW = Instant.parse("2026-07-11T13:00:00Z");

    @TempDir
    Path repoRoot;

    @Test
    void capturesOnlyBoundedReadOnlyLegacyEvidenceInAnImmutableManifest() throws Exception {
        writeSources("""
            {"items":[{"queueId":"queue-running","dispatchId":"dispatch-running","status":"running","pid":12345,
            "processStartedAt":"2026-07-11T12:00:00Z"}]}
            """, "{}", "{}");

        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        Cursor<String> cursor = mock(Cursor.class);
        when(redis.scan(org.mockito.ArgumentMatchers.any(ScanOptions.class))).thenReturn(cursor);
        when(cursor.hasNext()).thenReturn(false);

        CrawlerLegacySnapshotReader.LegacySnapshot snapshot = reader(redis)
            .snapshot("cutover-1", "abc123", NOW);

        assertEquals("cutover-1", snapshot.cutoverId());
        assertEquals(1, snapshot.queueItems().size());
        assertEquals(12345L, snapshot.recordedProcesses().get(0).pid());
        assertFalse(snapshot.manifestSha256().isBlank());
        assertTrue(Files.exists(repoRoot.resolve(snapshot.manifestPath())));
    }

    @Test
    void mergesLatestAndLockProcessIdentityOnlyWhenTheirDispatchEvidenceMatches() throws Exception {
        writeSources("""
            {"items":[{"queueId":"queue-running","dispatchId":"dispatch-running","domain":"bosses",
            "actionId":"domain-source-bosses","status":"running"}]}
            """, """
            {"queueId":"queue-running","dispatchId":"dispatch-running","domain":"bosses",
            "actionId":"domain-source-bosses","status":"running","pid":12345}
            """, """
            {"queueId":"queue-running","dispatchId":"dispatch-running","domain":"bosses",
            "actionId":"domain-source-bosses","pid":12345,"startedAt":"2026-07-11T12:00:00Z"}
            """);

        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        Cursor<String> cursor = mock(Cursor.class);
        when(redis.scan(org.mockito.ArgumentMatchers.any(ScanOptions.class))).thenReturn(cursor);
        when(cursor.hasNext()).thenReturn(false);

        CrawlerLegacySnapshotReader.LegacySnapshot snapshot = reader(redis)
            .snapshot("cutover-1", "abc123", NOW);

        assertEquals(1, snapshot.recordedProcesses().size());
        CrawlerLegacySnapshotReader.RecordedProcess process = snapshot.recordedProcesses().get(0);
        assertEquals("queue-running", process.queueId());
        assertEquals(12345L, process.pid());
        assertEquals(Instant.parse("2026-07-11T12:00:00Z"), process.processStartedAt());
        assertTrue(snapshot.sourceErrors().isEmpty());
    }

    @Test
    void neverOverwritesAnExistingSnapshotForTheSameCutoverId() throws Exception {
        writeSources("""
            {"items":[{"queueId":"queue-first","status":"completed"}]}
            """, "{}", "{}");
        CrawlerLegacySnapshotReader reader = reader(mock(StringRedisTemplate.class));
        CrawlerLegacySnapshotReader.LegacySnapshot first = reader.snapshot("cutover-1", "abc123", NOW);

        writeSources("""
            {"items":[{"queueId":"queue-second","status":"completed"}]}
            """, "{}", "{}");
        CrawlerLegacySnapshotReader.LegacySnapshot repeated = reader.snapshot("cutover-1", "abc123", NOW.plusSeconds(1));

        assertEquals(first.manifestSha256(), repeated.manifestSha256());
        assertEquals("queue-first", repeated.queueItems().get(0).queueId());
        assertNotEquals("queue-second", repeated.queueItems().get(0).queueId());
    }

    @Test
    void persistsAnImmutableAbortDecisionForAnUnconfirmedLegacyProcess() throws Exception {
        writeSources("""
            {"items":[{"queueId":"queue-running","status":"running","pid":12345,
            "processStartedAt":"2026-07-11T12:00:00Z"}]}
            """, "{}", "{}");
        CrawlerLegacySnapshotReader reader = reader(mock(StringRedisTemplate.class));
        CrawlerLegacySnapshotReader.LegacySnapshot snapshot = reader.snapshot("cutover-1", "abc123", NOW);

        reader.recordAborted(snapshot, CrawlerQueueV2ReasonCode.LEGACY_PROCESS_UNCONFIRMED);

        Path aborted = repoRoot.resolve("reports/crawler-monitor/v2/cutovers/cutover-1/cutover-aborted.json");
        assertTrue(Files.exists(aborted));
        String content = Files.readString(aborted);
        assertTrue(content.contains("\"status\":\"aborted\""));
        assertTrue(content.contains("\"reasonCode\":\"LEGACY_PROCESS_UNCONFIRMED\""));
    }

    @Test
    void recordsRequiredSourceFailuresWithoutTreatingThemAsAnEmptyQueue() throws Exception {
        Files.createDirectories(repoRoot.resolve("reports/crawler-monitor"));
        Files.writeString(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), "{}");

        CrawlerLegacySnapshotReader.LegacySnapshot snapshot = reader(mock(StringRedisTemplate.class))
            .snapshot("cutover-1", "abc123", NOW);

        assertFalse(snapshot.sourceErrors().isEmpty());
        assertTrue(snapshot.sourceErrors().stream().anyMatch(error -> error.contains("wiki-monitor-dispatch.latest.json")));
    }

    @Test
    void acceptsAnAbsentIdleLockWhenAllRequiredLegacyEvidenceIsTerminal() throws Exception {
        writeSources("""
            {"items":[{"queueId":"queue-completed","dispatchId":"dispatch-completed","status":"completed"}]}
            """, """
            {"queueId":"queue-completed","dispatchId":"dispatch-completed","status":"completed"}
            """, "{}");
        Files.delete(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"));

        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        Cursor<String> cursor = mock(Cursor.class);
        when(redis.scan(org.mockito.ArgumentMatchers.any(ScanOptions.class))).thenReturn(cursor);
        when(cursor.hasNext()).thenReturn(false);

        CrawlerLegacySnapshotReader.LegacySnapshot snapshot = reader(redis)
            .snapshot("cutover-idle-lock", "abc123", NOW);

        assertTrue(snapshot.sourceErrors().isEmpty());
        assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", snapshot.lockSha256());
        assertTrue(snapshot.nonTerminalItems().isEmpty());
    }

    @Test
    void recordsRedisScanFailureAsCutoverBlockingEvidence() throws Exception {
        writeSources("{}", "{}", "{}");
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.scan(org.mockito.ArgumentMatchers.any())).thenThrow(new IllegalStateException("redis offline"));

        CrawlerLegacySnapshotReader.LegacySnapshot snapshot = reader(redis).snapshot("cutover-1", "abc123", NOW);

        assertTrue(snapshot.sourceErrors().stream().anyMatch(error -> error.contains("legacy Redis scan unavailable")));
    }

    @Test
    void recordsANullRedisScanCursorAsCutoverBlockingEvidence() throws Exception {
        writeSources("{}", "{}", "{}");
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.scan(org.mockito.ArgumentMatchers.any())).thenReturn(null);

        CrawlerLegacySnapshotReader.LegacySnapshot snapshot = reader(redis).snapshot("cutover-1", "abc123", NOW);

        assertTrue(snapshot.sourceErrors().stream().anyMatch(error -> error.contains("legacy Redis scan returned null cursor")));
    }

    @Test
    void scansOnlyTheConfiguredFixtureLegacyPrefix() throws Exception {
        writeSources("{}", "{}", "{}");
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        Cursor<String> cursor = mock(Cursor.class);
        when(redis.scan(org.mockito.ArgumentMatchers.any(ScanOptions.class))).thenReturn(cursor);
        when(cursor.hasNext()).thenReturn(false);

        new CrawlerLegacySnapshotReader(
            new ObjectMapper().registerModule(new JavaTimeModule()),
            redis,
            repoRoot,
            Clock.fixed(NOW, ZoneOffset.UTC),
            "terrapedia:crawler:wiki-monitor:dispatch-queue:test:fixture:"
        ).snapshot("cutover-fixture", "abc123", NOW);

        org.mockito.ArgumentCaptor<ScanOptions> options = org.mockito.ArgumentCaptor.forClass(ScanOptions.class);
        verify(redis).scan(options.capture());
        assertEquals("terrapedia:crawler:wiki-monitor:dispatch-queue:test:fixture:*", options.getValue().getPattern());
    }

    private CrawlerLegacySnapshotReader reader(StringRedisTemplate redis) {
        return new CrawlerLegacySnapshotReader(
            new ObjectMapper().registerModule(new JavaTimeModule()),
            redis,
            repoRoot,
            Clock.fixed(NOW, ZoneOffset.UTC)
        );
    }

    private void writeSources(String mirror, String latest, String lock) throws IOException {
        Path reports = repoRoot.resolve("reports/crawler-monitor");
        Files.createDirectories(reports);
        Files.writeString(reports.resolve("wiki-monitor-dispatch-queue.latest.json"), mirror);
        Files.writeString(reports.resolve("wiki-monitor-dispatch.latest.json"), latest);
        Files.writeString(reports.resolve("wiki-monitor-dispatch.lock.json"), lock);
    }
}

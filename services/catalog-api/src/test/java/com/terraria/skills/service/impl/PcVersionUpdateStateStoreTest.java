package com.terraria.skills.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PcVersionUpdateStateStoreTest {

    @TempDir
    Path tempDir;

    private PcVersionUpdateStateStore newStore() {
        return new PcVersionUpdateStateStore(
            new ObjectMapper(),
            Clock.fixed(Instant.parse("2026-10-23T12:00:00Z"), ZoneOffset.UTC)
        );
    }

    @Test
    void missingStateUsesPinnedBaselineAndCanBeReadByANewStoreInstance() {
        PcVersionUpdateStateStore first = newStore();
        Map<String, Object> initial = first.readState(tempDir);

        assertEquals("pc-version-update-state/v1", initial.get("schemaVersion"));
        assertEquals(0L, ((Number) initial.get("stateRevision")).longValue());
        assertEquals("1.4.5.8", initial.get("lastEvaluatedDesktopVersion"));
        assertEquals(List.of(), initial.get("candidates"));

        Map<String, Object> merged = first.mergeProbeReport(tempDir, report(
            "1.4.5.8", "1.4.5.9", List.of(release("1.4.5.9", mappedBulletin("bulletin-a", "Last Prism")))
        ));
        Map<String, Object> reloaded = newStore().readState(tempDir);

        assertEquals("1.4.5.9", merged.get("lastEvaluatedDesktopVersion"));
        assertEquals(
            ((Number) merged.get("stateRevision")).longValue(),
            ((Number) reloaded.get("stateRevision")).longValue()
        );
        assertEquals(merged.get("candidates"), reloaded.get("candidates"));
    }

    @Test
    void mergesNewReleasesWithoutReplacingOlderPendingOrInformationalCandidates() {
        PcVersionUpdateStateStore store = newStore();
        store.mergeProbeReport(tempDir, report("1.4.5.8", "1.4.5.9", List.of(release(
            "1.4.5.9",
            mappedBulletin("bulletin-a", "Last Prism"),
            unmappedBulletin("bulletin-b")
        ))));

        Map<String, Object> afterNewRelease = store.mergeProbeReport(tempDir, report(
            "1.4.5.9", "1.4.5.10", List.of(release("1.4.5.10", mappedBulletin("bulletin-c", "Bee Gun")))
        ));
        List<Map<String, Object>> candidates = candidates(afterNewRelease);

        assertEquals("1.4.5.10", afterNewRelease.get("lastEvaluatedDesktopVersion"));
        assertEquals(3, candidates.size());
        assertEquals("pending", candidate(candidates, "bulletin-a").get("handlingStatus"));
        assertEquals("informational", candidate(candidates, "bulletin-b").get("handlingStatus"));
        assertEquals("pending", candidate(candidates, "bulletin-c").get("handlingStatus"));
    }

    @Test
    void manualHandlingPersistsAndStaleRevisionsCannotOverwriteIt() {
        PcVersionUpdateStateStore store = newStore();
        store.mergeProbeReport(tempDir, report("1.4.5.8", "1.4.5.9", List.of(release(
            "1.4.5.9", mappedBulletin("bulletin-a", "Last Prism"), unmappedBulletin("bulletin-b")
        ))));
        Map<String, Object> state = store.readState(tempDir);
        String mappedId = String.valueOf(candidate(candidates(state), "bulletin-a").get("candidateId"));
        String unmappedId = String.valueOf(candidate(candidates(state), "bulletin-b").get("candidateId"));

        Map<String, Object> handled = store.updateHandling(
            tempDir, mappedId, "handled", 1L, "admin", "Checked against the release", "2026-10-23T12:00:00Z"
        );
        Map<String, Object> handledCandidate = candidate(candidates(handled), "bulletin-a");

        assertEquals("handled", handledCandidate.get("handlingStatus"));
        assertEquals("admin", handledCandidate.get("handledBy"));
        assertEquals("2026-10-23T12:00:00Z", handledCandidate.get("handledAt"));
        assertEquals("Checked against the release", handledCandidate.get("handlingNote"));
        assertEquals("handled", candidate(candidates(newStore().readState(tempDir)), "bulletin-a").get("handlingStatus"));
        assertThrows(PcVersionUpdateStateStore.StateRevisionConflictException.class, () -> store.updateHandling(
            tempDir, mappedId, "pending", 1L, "admin", null, "2026-10-23T12:00:00Z"
        ));
        assertThrows(IllegalArgumentException.class, () -> store.updateHandling(
            tempDir, unmappedId, "handled", 2L, "admin", null, "2026-10-23T12:00:00Z"
        ));
    }

    @Test
    void exactReportReplayAndBulletinReorderingDoNotDuplicateOrResetAcknowledgement() {
        PcVersionUpdateStateStore store = newStore();
        Map<String, Object> initialReport = report("1.4.5.8", "1.4.5.9", List.of(release(
            "1.4.5.9", mappedBulletin("bulletin-a", "Last Prism"), mappedBulletin("bulletin-b", "Bee Gun")
        )));
        Map<String, Object> initialState = store.mergeProbeReport(tempDir, initialReport);
        String beeGunId = String.valueOf(candidate(candidates(initialState), "bulletin-b").get("candidateId"));
        store.updateHandling(tempDir, beeGunId, "handled", 1L, "admin", null, "2026-10-23T12:00:00Z");

        Map<String, Object> reorderedReplay = report("1.4.5.8", "1.4.5.9", List.of(release(
            "1.4.5.9", mappedBulletin("bulletin-b", "Bee Gun"), mappedBulletin("bulletin-a", "Last Prism")
        )));
        Map<String, Object> replayed = store.mergeProbeReport(tempDir, reorderedReplay);

        assertEquals(2, candidates(replayed).size());
        assertEquals("handled", candidate(candidates(replayed), "bulletin-b").get("handlingStatus"));
        assertEquals("admin", candidate(candidates(replayed), "bulletin-b").get("handledBy"));
    }

    @Test
    void corruptStateAndInvalidReportFailClosedWithoutAdvancingTheCursor() throws Exception {
        PcVersionUpdateStateStore store = newStore();
        Path statePath = tempDir.resolve("reports/crawler-monitor/pc-version-update-triage/state.json");
        Files.createDirectories(statePath.getParent());
        Files.writeString(statePath, "{not json");

        assertThrows(IllegalStateException.class, () -> store.readState(tempDir));
        assertThrows(IllegalStateException.class, () -> store.mergeProbeReport(tempDir, report(
            "1.4.5.8", "1.4.5.9", List.of(release("1.4.5.9", mappedBulletin("bulletin-a", "Last Prism")))
        )));

        Path cleanRoot = Files.createDirectories(tempDir.resolve("clean-root"));
        assertThrows(IllegalArgumentException.class, () -> store.mergeProbeReport(cleanRoot, report(
            "1.4.5.8", "1.4.5.10", List.of()
        )));
        assertEquals("{not json", Files.readString(statePath));
    }

    @Test
    void incompleteReleasePagesFailClosedWithoutAdvancingTheCursor() {
        PcVersionUpdateStateStore store = newStore();
        Map<String, Object> incomplete = new java.util.LinkedHashMap<>(report(
            "1.4.5.8",
            "1.4.5.11",
            List.of(
                release("1.4.5.9", mappedBulletin("bulletin-a", "Last Prism")),
                release("1.4.5.11", mappedBulletin("bulletin-c", "Bee Gun"))
            )
        ));
        incomplete.put("plannedReleaseVersions", List.of("1.4.5.9", "1.4.5.10", "1.4.5.11"));

        assertThrows(IllegalArgumentException.class, () -> store.mergeProbeReport(tempDir, incomplete));
        assertEquals("1.4.5.8", store.readState(tempDir).get("lastEvaluatedDesktopVersion"));
        assertEquals(0L, ((Number) store.readState(tempDir).get("stateRevision")).longValue());
    }

    @Test
    void probeClaimIsIndependentAndOnlyOneProbeCanOwnTheLock() throws Exception {
        PcVersionUpdateStateStore store = newStore();
        try (PcVersionUpdateStateStore.ProbeClaim claim = store.tryAcquireProbeClaim(tempDir)) {
            assertNotNull(claim);
            assertNull(store.tryAcquireProbeClaim(tempDir));
            Map<String, Object> state = store.mergeProbeReport(tempDir, report(
                "1.4.5.8", "1.4.5.9", List.of(release("1.4.5.9", mappedBulletin("bulletin-a", "Last Prism")))
            ));
            String candidateId = String.valueOf(candidate(candidates(state), "bulletin-a").get("candidateId"));
            Map<String, Object> handled = store.updateHandling(
                tempDir, candidateId, "handled", 1L, "admin", null, "2026-10-23T12:00:00Z"
            );
            assertEquals("handled", candidate(candidates(handled), "bulletin-a").get("handlingStatus"));
        }
        try (PcVersionUpdateStateStore.ProbeClaim claim = store.tryAcquireProbeClaim(tempDir)) {
            assertNotNull(claim);
        }
    }

    @Test
    void freshRunningProgressPreventsASecondProbeAfterTheBackendProcessRestarts() {
        PcVersionUpdateStateStore store = newStore();
        store.publishProbeProgress(tempDir, Map.of(
            "actionId", "pc-version-update-probe",
            "status", "running",
            "lastHeartbeatAt", "2026-10-23T12:00:00Z"
        ));

        assertTrue(store.hasRecentRunningProbe(tempDir, java.time.Duration.ofMinutes(20)));

        store.publishProbeProgress(tempDir, Map.of(
            "actionId", "pc-version-update-probe",
            "status", "completed",
            "lastHeartbeatAt", "2026-10-23T12:00:00Z"
        ));
        assertFalse(store.hasRecentRunningProbe(tempDir, java.time.Duration.ofMinutes(20)));
    }

    private static Map<String, Object> report(String cursor, String current, List<Map<String, Object>> releases) {
        return Map.ofEntries(
            Map.entry("schemaVersion", "pc-version-update-probe/v1"),
            Map.entry("actionId", "pc-version-update-probe"),
            Map.entry("runId", "run-20261023-001"),
            Map.entry("targetPlatform", "Desktop/PC"),
            Map.entry("baselineVersion", "1.4.5.8"),
            Map.entry("lastEvaluatedDesktopVersion", cursor),
            Map.entry("currentDesktopVersion", current),
            Map.entry("plannedReleaseVersions", releases.stream().map(release -> release.get("version")).toList()),
            Map.entry("currentVersionSource", source("Template:Current versions", 10, 100)),
            Map.entry("historySource", source("Desktop version history", 20, 200)),
            Map.entry("generatedAt", "2026-10-23T12:00:00Z"),
            Map.entry("releases", releases)
        );
    }

    private static Map<String, Object> release(String version, Map<String, Object>... bulletins) {
        return Map.of(
            "version", version,
            "source", source(version, 30, 300),
            "bulletins", List.of(bulletins)
        );
    }

    private static Map<String, Object> mappedBulletin(String bulletinId, String displayName) {
        return Map.of(
            "bulletinId", bulletinId,
            "sectionTitle", "Changes",
            "text", "Changed " + displayName,
            "mappingStatus", "mapped",
            "category", "content_change",
            "impactStatus", "unspecified_by_release_note",
            "targets", List.of(Map.of(
                "domain", "items",
                "entityType", "item",
                "displayName", displayName,
                "stableIdentity", Map.of("kind", "item_internal_name", "value", displayName.replace(" ", "")),
                "impactFields", List.of(),
                "impactStatus", "unspecified_by_release_note"
            ))
        );
    }

    private static Map<String, Object> unmappedBulletin(String bulletinId) {
        return Map.of(
            "bulletinId", bulletinId,
            "sectionTitle", "Bug Fixes",
            "text", "Fixed an unlinked behavior",
            "mappingStatus", "unmapped",
            "mappingReason", "no-wiki-link",
            "category", "bug_fix",
            "targets", List.of()
        );
    }

    private static Map<String, Object> source(String title, int pageId, int revisionId) {
        return Map.of(
            "pageTitle", title,
            "pageId", pageId,
            "revisionId", revisionId,
            "revisionTimestamp", "2026-10-01T00:00:00Z",
            "pageUrl", "https://terraria.wiki.gg/wiki/" + title.replace(' ', '_')
        );
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> candidates(Map<String, Object> state) {
        return (List<Map<String, Object>>) state.get("candidates");
    }

    private static Map<String, Object> candidate(List<Map<String, Object>> candidates, String bulletinId) {
        return candidates.stream()
            .filter(value -> bulletinId.equals(value.get("bulletinId")))
            .findFirst()
            .orElseThrow();
    }
}

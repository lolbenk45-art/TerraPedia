package com.terraria.skills.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.channels.OverlappingFileLockException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermission;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;
import java.util.regex.Pattern;

@Component
public class PcVersionUpdateStateStore {

    public static final String BASELINE_VERSION = "1.4.5.8";
    public static final String STATE_SCHEMA_VERSION = "pc-version-update-state/v1";
    public static final String PROBE_ACTION_ID = "pc-version-update-probe";

    private static final Path TRIAGE_DIR = Path.of("reports", "crawler-monitor", "pc-version-update-triage");
    private static final Path STATE_FILE = TRIAGE_DIR.resolve("state.json");
    private static final Path STATE_LOCK_FILE = TRIAGE_DIR.resolve("state.lock");
    private static final Path PROBE_LOCK_FILE = TRIAGE_DIR.resolve("probe.lock");
    private static final Path RELEASE_DIR = TRIAGE_DIR.resolve("releases");
    private static final TypeReference<LinkedHashMap<String, Object>> MAP_TYPE = new TypeReference<>() {};
    private static final Pattern VERSION_PATTERN = Pattern.compile("^[0-9]+(?:\\.[0-9]+)+$");
    private static final Set<String> DOMAINS = Set.of(
        "items", "npcs", "projectiles", "armor_sets", "buffs", "audio", "bosses", "shimmer"
    );
    private static final ConcurrentHashMap<Path, ReentrantLock> LOCAL_LOCKS = new ConcurrentHashMap<>();

    private final ObjectMapper objectMapper;
    private final Clock clock;

    public PcVersionUpdateStateStore(ObjectMapper objectMapper) {
        this(objectMapper, Clock.systemUTC());
    }

    PcVersionUpdateStateStore(ObjectMapper objectMapper, Clock clock) {
        this.objectMapper = objectMapper;
        this.clock = clock == null ? Clock.systemUTC() : clock;
    }

    public Map<String, Object> readState(Path repoRoot) {
        Path root = normalizeRepoRoot(repoRoot);
        Path statePath = containedPath(root, STATE_FILE);
        try {
            assertNoSymlinkedAncestors(statePath, root);
            if (!Files.exists(statePath, LinkOption.NOFOLLOW_LINKS)) {
                return initialState();
            }
            return validateState(readMap(statePath));
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to read PC version update state", exception);
        }
    }

    public Path resolveSafeRepositoryPath(Path repoRoot, Path relativePath) {
        Path root = normalizeRepoRoot(repoRoot);
        Path resolved = containedPath(root, relativePath);
        try {
            assertNoSymlinkedAncestors(resolved, root);
            return resolved;
        } catch (IOException exception) {
            throw new IllegalStateException("PC version path is not safe", exception);
        }
    }

    public Map<String, Object> readProbeProgress(Path repoRoot) {
        Path root = normalizeRepoRoot(repoRoot);
        Path progressPath = containedPath(root, TRIAGE_DIR.resolve("progress.latest.json"));
        try {
            assertNoSymlinkedAncestors(progressPath, root);
            if (!Files.exists(progressPath, LinkOption.NOFOLLOW_LINKS)) return null;
            if (!Files.isRegularFile(progressPath, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(progressPath)) {
                throw new IOException("PC version probe progress path is not a regular file");
            }
            Map<String, Object> progress = readMap(progressPath);
            if (!PROBE_ACTION_ID.equals(progress.get("actionId"))) {
                throw new IOException("PC version probe progress action identity is invalid");
            }
            return progress;
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to read PC version probe progress", exception);
        }
    }

    public Map<String, Object> readProbeReport(Path repoRoot, Path relativeReportPath) {
        Path root = normalizeRepoRoot(repoRoot);
        Path reportPath = containedPath(root, relativeReportPath);
        try {
            assertNoSymlinkedAncestors(reportPath, root);
            if (!Files.isRegularFile(reportPath, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(reportPath)) {
                throw new IOException("PC version probe report path is not a regular file");
            }
            Map<String, Object> report = readMap(reportPath);
            if (!PROBE_ACTION_ID.equals(report.get("actionId"))) {
                throw new IOException("PC version probe report action identity is invalid");
            }
            return report;
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to read PC version probe report", exception);
        }
    }

    public void publishProbeProgress(Path repoRoot, Map<String, Object> progress) {
        if (progress == null || !PROBE_ACTION_ID.equals(progress.get("actionId"))) {
            throw new IllegalArgumentException("PC version probe progress action identity is invalid");
        }
        Path root = normalizeRepoRoot(repoRoot);
        writeAtomicJson(root, containedPath(root, TRIAGE_DIR.resolve("progress.latest.json")), progress, true);
    }

    public boolean hasRecentRunningProbe(Path repoRoot, Duration staleAfter) {
        Path root = normalizeRepoRoot(repoRoot);
        Path progressPath = containedPath(root, TRIAGE_DIR.resolve("progress.latest.json"));
        try {
            assertNoSymlinkedAncestors(progressPath, root);
            if (!Files.exists(progressPath, LinkOption.NOFOLLOW_LINKS)) return false;
            if (!Files.isRegularFile(progressPath, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(progressPath)) {
                throw new IllegalStateException("PC version probe progress path is not a regular file");
            }
            Map<String, Object> progress = readMap(progressPath);
            if (!PROBE_ACTION_ID.equals(progress.get("actionId"))) {
                throw new IllegalStateException("PC version probe progress action identity is invalid");
            }
            if (!"running".equalsIgnoreCase(string(progress.get("status")))) return false;
            Instant heartbeat = Instant.parse(string(progress.get("lastHeartbeatAt")));
            Duration age = Duration.between(heartbeat, Instant.now(clock));
            return !age.isNegative() && staleAfter != null && age.compareTo(staleAfter) <= 0;
        } catch (IOException | RuntimeException exception) {
            throw new IllegalStateException("Unable to verify existing PC version probe progress", exception);
        }
    }

    public Map<String, Object> mergeProbeReport(Path repoRoot, Map<String, Object> report) {
        Path root = normalizeRepoRoot(repoRoot);
        validateProbeReport(report);
        return withFileLock(root, STATE_LOCK_FILE, () -> {
            Map<String, Object> state = readStateInternal(root);
            String cursor = string(state.get("lastEvaluatedDesktopVersion"));
            String reportCurrent = string(report.get("currentDesktopVersion"));
            if (compareVersions(reportCurrent, cursor) <= 0) {
                return state;
            }
            String reportCursor = string(report.get("lastEvaluatedDesktopVersion"));
            if (!cursor.equals(reportCursor)) {
                throw new IllegalStateException("PC version probe cursor is stale: expected " + cursor + " but received " + reportCursor);
            }

            List<Map<String, Object>> releases = mapList(report.get("releases"), "release list");
            if (releases.isEmpty()) {
                throw new IllegalArgumentException("PC version advanced but the probe report contains no release pages");
            }
            List<Map<String, Object>> candidates = candidateList(state.get("candidates"));
            LinkedHashMap<String, Map<String, Object>> candidatesById = new LinkedHashMap<>();
            for (Map<String, Object> candidate : candidates) {
                candidatesById.put(string(candidate.get("candidateId")), candidate);
            }

            List<Map<String, Object>> orderedReleases = new ArrayList<>(releases);
            orderedReleases.sort(Comparator.comparing(release -> string(release.get("version")), PcVersionUpdateStateStore::compareVersions));
            String priorVersion = cursor;
            for (Map<String, Object> release : orderedReleases) {
                String version = requireVersion(release.get("version"), "release version");
                if (compareVersions(version, priorVersion) <= 0 || compareVersions(version, reportCurrent) > 0) {
                    throw new IllegalArgumentException("PC release pages are duplicated, out of order, or beyond the current version");
                }
                Map<String, Object> source = validateSource(release.get("source"), version);
                String reportPath = writeReleaseReport(root, report, release, source);
                List<Map<String, Object>> bulletins = mapList(release.get("bulletins"), "release bulletin list");
                for (Map<String, Object> bulletin : bulletins) {
                    mergeBulletin(candidatesById, bulletin, version, source, reportPath, report);
                }
                priorVersion = version;
            }

            LinkedHashMap<String, Object> next = new LinkedHashMap<>(state);
            next.put("stateRevision", revision(state) + 1L);
            next.put("lastEvaluatedDesktopVersion", reportCurrent);
            next.put("updatedAt", Instant.now(clock).toString());
            next.put("candidates", new ArrayList<>(candidatesById.values()));
            LinkedHashMap<String, Object> lastProbe = new LinkedHashMap<>();
            lastProbe.put("actionId", PROBE_ACTION_ID);
            lastProbe.put("status", "completed");
            lastProbe.put("generatedAt", report.get("generatedAt"));
            lastProbe.put("currentDesktopVersion", reportCurrent);
            lastProbe.put("lastEvaluatedDesktopVersion", reportCurrent);
            lastProbe.put("identityCatalogProvenance", report.get("identityCatalogProvenance"));
            next.put("lastProbe", lastProbe);
            writeState(root, next);
            return next;
        });
    }

    public Map<String, Object> updateHandling(
        Path repoRoot,
        String candidateId,
        String requestedStatus,
        long expectedStateRevision,
        String operator,
        String note,
        String handledAt
    ) {
        Path root = normalizeRepoRoot(repoRoot);
        String status = requestedStatus == null ? "" : requestedStatus.trim().toLowerCase(Locale.ROOT);
        if (!Set.of("pending", "handled").contains(status)) {
            throw new IllegalArgumentException("Handling status must be pending or handled");
        }
        if (operator == null || operator.isBlank()) {
            throw new IllegalArgumentException("Handling operator is required");
        }
        if (note != null && note.length() > 300) {
            throw new IllegalArgumentException("Handling note is too long");
        }
        if (status.equals("handled") && (handledAt == null || handledAt.isBlank())) {
            throw new IllegalArgumentException("Handled timestamp is required");
        }

        return withFileLock(root, STATE_LOCK_FILE, () -> {
            Map<String, Object> state = readStateInternal(root);
            long currentRevision = revision(state);
            if (expectedStateRevision != currentRevision) {
                throw new StateRevisionConflictException(expectedStateRevision, currentRevision);
            }
            List<Map<String, Object>> candidates = candidateList(state.get("candidates"));
            Map<String, Object> selected = candidates.stream()
                .filter(candidate -> String.valueOf(candidateId).equals(candidate.get("candidateId")))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("PC version update candidate was not found"));
            if (!Boolean.TRUE.equals(selected.get("handlingAllowed"))) {
                throw new IllegalArgumentException("Informational PC version update rows cannot be marked handled");
            }

            LinkedHashMap<String, Object> updatedCandidate = new LinkedHashMap<>(selected);
            updatedCandidate.put("handlingStatus", status);
            updatedCandidate.put("handlingNote", note == null || note.isBlank() ? null : note.trim());
            if (status.equals("handled")) {
                updatedCandidate.put("handledBy", operator.trim());
                updatedCandidate.put("handledAt", handledAt);
            } else {
                updatedCandidate.put("handledBy", null);
                updatedCandidate.put("handledAt", null);
            }
            candidates.set(candidates.indexOf(selected), updatedCandidate);

            LinkedHashMap<String, Object> next = new LinkedHashMap<>(state);
            next.put("stateRevision", currentRevision + 1L);
            next.put("updatedAt", Instant.now(clock).toString());
            next.put("candidates", candidates);
            writeState(root, next);
            return next;
        });
    }

    public ProbeClaim tryAcquireProbeClaim(Path repoRoot) {
        Path root = normalizeRepoRoot(repoRoot);
        Path lockPath = containedPath(root, PROBE_LOCK_FILE);
        prepareParent(lockPath, root);
        ReentrantLock localLock = LOCAL_LOCKS.computeIfAbsent(lockPath, ignored -> new ReentrantLock());
        if (!localLock.tryLock()) return null;
        FileChannel channel = null;
        try {
            assertNoSymlinkedAncestors(lockPath, root);
            channel = FileChannel.open(lockPath, StandardOpenOption.CREATE, StandardOpenOption.WRITE);
            FileLock lock;
            try {
                lock = channel.tryLock();
            } catch (OverlappingFileLockException exception) {
                channel.close();
                localLock.unlock();
                return null;
            }
            if (lock == null) {
                channel.close();
                localLock.unlock();
                return null;
            }
            return new ProbeClaim(lockPath, localLock, channel, lock);
        } catch (IOException | RuntimeException exception) {
            closeQuietly(channel);
            localLock.unlock();
            throw new IllegalStateException("Failed to acquire PC version probe claim", exception);
        }
    }

    private Map<String, Object> readStateInternal(Path root) {
        Path statePath = containedPath(root, STATE_FILE);
        try {
            assertNoSymlinkedAncestors(statePath, root);
            if (!Files.exists(statePath, LinkOption.NOFOLLOW_LINKS)) return initialState();
            return validateState(readMap(statePath));
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to read PC version update state", exception);
        }
    }

    private LinkedHashMap<String, Object> initialState() {
        LinkedHashMap<String, Object> state = new LinkedHashMap<>();
        state.put("schemaVersion", STATE_SCHEMA_VERSION);
        state.put("stateRevision", 0L);
        state.put("lastEvaluatedDesktopVersion", BASELINE_VERSION);
        state.put("updatedAt", null);
        state.put("candidates", new ArrayList<>());
        return state;
    }

    private Map<String, Object> validateState(Map<String, Object> state) {
        if (!STATE_SCHEMA_VERSION.equals(state.get("schemaVersion"))) {
            throw new IllegalStateException("PC version update state schema version is invalid");
        }
        if (revision(state) < 0L) throw new IllegalStateException("PC version update state revision is invalid");
        try {
            String cursor = requireVersion(state.get("lastEvaluatedDesktopVersion"), "state version cursor");
            if (compareVersions(cursor, BASELINE_VERSION) < 0) {
                throw new IllegalArgumentException("State version cursor predates the pinned baseline");
            }
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException("PC version update state cursor is invalid", exception);
        }
        Object rawCandidates = state.get("candidates");
        if (!(rawCandidates instanceof List<?>)) {
            throw new IllegalStateException("PC version update state candidates are invalid");
        }
        Set<String> candidateIds = new java.util.HashSet<>();
        for (Map<String, Object> candidate : candidateList(rawCandidates)) {
            String candidateId = string(candidate.get("candidateId"));
            if (candidateId.isBlank() || !candidateIds.add(candidateId)) {
                throw new IllegalStateException("PC version update state contains a missing or duplicate candidate ID");
            }
            boolean handlingAllowed = Boolean.TRUE.equals(candidate.get("handlingAllowed"));
            String handlingStatus = string(candidate.get("handlingStatus"));
            if (handlingAllowed) {
                if (!Set.of("pending", "handled").contains(handlingStatus)) {
                    throw new IllegalStateException("PC version update state has an invalid handling status");
                }
                try {
                    validateTarget(asMap(candidate.get("target"), "candidate target"));
                } catch (IllegalArgumentException exception) {
                    throw new IllegalStateException("PC version update state candidate target is invalid", exception);
                }
            } else if (!"informational".equals(handlingStatus) || candidate.get("target") != null) {
                throw new IllegalStateException("PC version update informational candidate has invalid handling state");
            }
        }
        return deepCopy(state);
    }

    private void validateProbeReport(Map<String, Object> report) {
        if (report == null || !"pc-version-update-probe/v1".equals(report.get("schemaVersion"))
            || !PROBE_ACTION_ID.equals(report.get("actionId"))
            || !"Desktop/PC".equals(report.get("targetPlatform"))
            || !BASELINE_VERSION.equals(report.get("baselineVersion"))) {
            throw new IllegalArgumentException("PC version probe report identity is invalid");
        }
        String cursor = requireVersion(report.get("lastEvaluatedDesktopVersion"), "report cursor");
        String current = requireVersion(report.get("currentDesktopVersion"), "report current version");
        if (compareVersions(current, cursor) < 0) {
            throw new IllegalArgumentException("PC version probe report current version predates its cursor");
        }
        validateSource(report.get("currentVersionSource"), "Template:Current versions");
        validateSource(report.get("historySource"), "Desktop version history");
        List<?> plannedValues = report.get("plannedReleaseVersions") instanceof List<?> values
            ? values
            : null;
        if (plannedValues == null) {
            throw new IllegalArgumentException("PC version probe planned release list is invalid");
        }
        List<String> plannedVersions = new ArrayList<>();
        String previous = cursor;
        for (Object value : plannedValues) {
            String version = requireVersion(value, "planned release version");
            if (compareVersions(version, previous) <= 0 || compareVersions(version, current) > 0) {
                throw new IllegalArgumentException("PC version probe planned releases are duplicated, out of order, or outside the version range");
            }
            plannedVersions.add(version);
            previous = version;
        }
        List<Map<String, Object>> releases = mapList(report.get("releases"), "release list");
        List<String> actualVersions = new ArrayList<>();
        for (Map<String, Object> release : releases) {
            actualVersions.add(requireVersion(release.get("version"), "release version"));
        }
        if (!plannedVersions.equals(actualVersions)) {
            throw new IllegalArgumentException("PC version probe release pages do not match the complete planned release list");
        }
        if (compareVersions(current, cursor) > 0
            && (plannedVersions.isEmpty() || !current.equals(plannedVersions.get(plannedVersions.size() - 1)))) {
            throw new IllegalArgumentException("PC version probe release pages do not reach the current Desktop version");
        }
    }

    private Map<String, Object> validateSource(Object value, String expectedTitle) {
        Map<String, Object> source = asMap(value, "source evidence");
        if (!expectedTitle.equals(source.get("pageTitle"))) {
            throw new IllegalArgumentException("PC version source evidence page title is invalid");
        }
        requirePositiveLong(source.get("pageId"), "source page ID");
        requirePositiveLong(source.get("revisionId"), "source revision ID");
        if (isBlank(source.get("revisionTimestamp")) || isBlank(source.get("pageUrl"))) {
            throw new IllegalArgumentException("PC version source evidence is missing provenance");
        }
        return source;
    }

    private void mergeBulletin(
        Map<String, Map<String, Object>> candidatesById,
        Map<String, Object> bulletin,
        String version,
        Map<String, Object> releaseSource,
        String reportPath,
        Map<String, Object> report
    ) {
        String bulletinId = string(bulletin.get("bulletinId"));
        if (bulletinId.isBlank()) throw new IllegalArgumentException("PC version bulletin ID is missing");
        List<Map<String, Object>> targets = mapList(bulletin.get("targets"), "bulletin target list");
        String mappingStatus = string(bulletin.get("mappingStatus"));
        if (targets.isEmpty()) {
            putCandidate(candidatesById, buildCandidate(
                bulletin, version, releaseSource, reportPath, report, null, mappingStatus, false
            ));
            return;
        }
        if (!"mapped".equals(mappingStatus)) {
            throw new IllegalArgumentException("Unmapped PC version bulletin cannot contain target identities");
        }
        for (Map<String, Object> target : targets) {
            validateTarget(target);
            putCandidate(candidatesById, buildCandidate(
                bulletin, version, releaseSource, reportPath, report, target, mappingStatus, true
            ));
        }
    }

    private Map<String, Object> buildCandidate(
        Map<String, Object> bulletin,
        String version,
        Map<String, Object> releaseSource,
        String reportPath,
        Map<String, Object> report,
        Map<String, Object> target,
        String mappingStatus,
        boolean handlingAllowed
    ) {
        String targetKey = target == null ? "informational" : stableTargetKey(target);
        String candidateId = sha256(version + "\n" + string(bulletin.get("bulletinId")) + "\n" + targetKey);
        LinkedHashMap<String, Object> candidate = new LinkedHashMap<>();
        candidate.put("candidateId", candidateId);
        candidate.put("releaseVersion", version);
        candidate.put("bulletinId", bulletin.get("bulletinId"));
        candidate.put("sectionTitle", bulletin.get("sectionTitle"));
        candidate.put("sectionIndex", bulletin.get("sectionIndex"));
        candidate.put("position", bulletin.get("position"));
        candidate.put("sourceLine", bulletin.get("sourceLine"));
        candidate.put("rawText", bulletin.get("rawText"));
        candidate.put("text", bulletin.get("text"));
        candidate.put("category", bulletin.get("category"));
        candidate.put("mappingStatus", mappingStatus);
        candidate.put("mappingReason", bulletin.get("mappingReason"));
        candidate.put("impactStatus", target == null ? bulletin.get("impactStatus") : target.get("impactStatus"));
        candidate.put("target", target);
        candidate.put("handlingAllowed", handlingAllowed);
        candidate.put("handlingStatus", handlingAllowed ? "pending" : "informational");
        candidate.put("handledBy", null);
        candidate.put("handledAt", null);
        candidate.put("handlingNote", null);
        candidate.put("releaseSource", releaseSource);
        candidate.put("identityCatalogProvenance", report.get("identityCatalogProvenance"));
        candidate.put("releaseReportPath", reportPath);
        candidate.put("generatedAt", report.get("generatedAt"));
        return candidate;
    }

    private void putCandidate(Map<String, Map<String, Object>> candidatesById, Map<String, Object> incoming) {
        String id = string(incoming.get("candidateId"));
        Map<String, Object> existing = candidatesById.get(id);
        if (existing != null) {
            incoming.put("handlingStatus", existing.get("handlingStatus"));
            incoming.put("handledBy", existing.get("handledBy"));
            incoming.put("handledAt", existing.get("handledAt"));
            incoming.put("handlingNote", existing.get("handlingNote"));
        }
        candidatesById.put(id, incoming);
    }

    private void validateTarget(Map<String, Object> target) {
        String domain = string(target.get("domain"));
        if (!DOMAINS.contains(domain)) throw new IllegalArgumentException("PC version target domain is not supported");
        Map<String, Object> identity = asMap(target.get("stableIdentity"), "stable target identity");
        if (isBlank(identity.get("kind")) || isBlank(identity.get("value"))) {
            throw new IllegalArgumentException("PC version target stable identity is incomplete");
        }
        if (isBlank(target.get("entityType")) || isBlank(target.get("displayName"))) {
            throw new IllegalArgumentException("PC version target display identity is incomplete");
        }
        if (!(target.get("impactFields") instanceof List<?>)) {
            throw new IllegalArgumentException("PC version target impact fields are invalid");
        }
        if (target.containsKey("impactFields") && ((List<?>) target.get("impactFields")).isEmpty()
            && !"unspecified_by_release_note".equals(target.get("impactStatus"))) {
            throw new IllegalArgumentException("PC version target with unspecified fields must carry an explicit status");
        }
    }

    private String writeReleaseReport(
        Path root,
        Map<String, Object> probeReport,
        Map<String, Object> release,
        Map<String, Object> source
    ) {
        String version = string(release.get("version"));
        String revision = String.valueOf(source.get("revisionId"));
        String runId = string(probeReport.get("runId"));
        if (runId.isBlank() || !runId.matches("[A-Za-z0-9-]{1,80}")) {
            throw new IllegalArgumentException("PC version probe report run ID is invalid");
        }
        String relative = RELEASE_DIR.resolve(version + "-r" + revision + "-" + runId + ".json").toString().replace('\\', '/');
        Path reportPath = root.resolve(relative).normalize();
        LinkedHashMap<String, Object> immutableReport = new LinkedHashMap<>();
        immutableReport.put("schemaVersion", "pc-version-update-release/v1");
        immutableReport.put("actionId", PROBE_ACTION_ID);
        immutableReport.put("targetPlatform", "Desktop/PC");
        immutableReport.put("releaseVersion", version);
        immutableReport.put("probeGeneratedAt", probeReport.get("generatedAt"));
        immutableReport.put("release", release);
        immutableReport.put("identityCatalogProvenance", probeReport.get("identityCatalogProvenance"));
        writeImmutableJson(root, reportPath, immutableReport);
        return relative;
    }

    private Map<String, Object> withFileLock(Path root, Path relativeLockPath, Supplier<Map<String, Object>> operation) {
        Path lockPath = containedPath(root, relativeLockPath);
        prepareParent(lockPath, root);
        ReentrantLock localLock = LOCAL_LOCKS.computeIfAbsent(lockPath, ignored -> new ReentrantLock());
        localLock.lock();
        try {
            assertNoSymlinkedAncestors(lockPath, root);
            try (FileChannel channel = FileChannel.open(lockPath, StandardOpenOption.CREATE, StandardOpenOption.WRITE);
                 FileLock ignored = channel.lock()) {
                return operation.get();
            }
        } catch (IOException | OverlappingFileLockException exception) {
            throw new IllegalStateException("Failed to lock PC version update state", exception);
        } finally {
            localLock.unlock();
        }
    }

    private void writeState(Path root, Map<String, Object> state) {
        Path path = containedPath(root, STATE_FILE);
        writeAtomicJson(root, path, state, true);
    }

    private void writeImmutableJson(Path root, Path path, Map<String, Object> payload) {
        try {
            assertNoSymlinkedAncestors(path, root);
            Files.createDirectories(path.getParent());
            assertNoSymlinkedAncestors(path, root);
            if (Files.exists(path, LinkOption.NOFOLLOW_LINKS)) {
                JsonNode existing = objectMapper.readTree(path.toFile());
                JsonNode expected = objectMapper.valueToTree(payload);
                if (!existing.equals(expected)) throw new IOException("immutable PC version report collision");
                return;
            }
            writeAtomicJson(root, path, payload, false);
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to publish immutable PC version release report", exception);
        }
    }

    private void writeAtomicJson(Path root, Path path, Map<String, Object> payload, boolean replace) {
        Path temporary = null;
        try {
            assertNoSymlinkedAncestors(path, root);
            Files.createDirectories(path.getParent());
            assertNoSymlinkedAncestors(path, root);
            if (Files.isSymbolicLink(path)) throw new IOException("PC version state path must not be symbolic-linked");
            temporary = Files.createTempFile(path.getParent(), ".pc-version-update-", ".tmp");
            byte[] bytes = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(payload);
            try (FileChannel channel = FileChannel.open(temporary, StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING)) {
                ByteBuffer buffer = ByteBuffer.wrap(bytes);
                while (buffer.hasRemaining()) channel.write(buffer);
                channel.force(true);
            }
            try {
                Files.setPosixFilePermissions(temporary, Set.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE));
            } catch (UnsupportedOperationException ignored) {
                // The file remains inside the repository on file systems without POSIX permissions.
            }
            assertNoSymlinkedAncestors(path, root);
            if (replace) {
                Files.move(temporary, path, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } else {
                Files.move(temporary, path, StandardCopyOption.ATOMIC_MOVE);
            }
            temporary = null;
            forceDirectory(path.getParent());
        } catch (AtomicMoveNotSupportedException exception) {
            throw new IllegalStateException("Atomic PC version state publication is unavailable", exception);
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to write PC version state file", exception);
        } finally {
            if (temporary != null) {
                try {
                    Files.deleteIfExists(temporary);
                } catch (IOException ignored) {
                    // Preserve the original publication error.
                }
            }
        }
    }

    private void prepareParent(Path path, Path root) {
        try {
            assertNoSymlinkedAncestors(path, root);
            Files.createDirectories(path.getParent());
            assertNoSymlinkedAncestors(path, root);
        } catch (IOException exception) {
            throw new IllegalStateException("PC version state path is not safe", exception);
        }
    }

    private void assertNoSymlinkedAncestors(Path target, Path root) throws IOException {
        Path normalizedRoot = normalizeRepoRoot(root);
        Path absoluteTarget = target.toAbsolutePath().normalize();
        if (!absoluteTarget.startsWith(normalizedRoot) || absoluteTarget.equals(normalizedRoot)) {
            throw new IOException("PC version state path escapes repository root");
        }
        Path current = normalizedRoot;
        Path relative = normalizedRoot.relativize(absoluteTarget);
        int index = 0;
        int count = relative.getNameCount();
        for (Path segment : relative) {
            current = current.resolve(segment);
            if (!Files.exists(current, LinkOption.NOFOLLOW_LINKS)) break;
            if (Files.isSymbolicLink(current)) throw new IOException("PC version state path contains a symbolic link");
            if (index < count - 1 && !Files.isDirectory(current, LinkOption.NOFOLLOW_LINKS)) {
                throw new IOException("PC version state parent is not a directory");
            }
            index++;
        }
    }

    private Path normalizeRepoRoot(Path repoRoot) {
        if (repoRoot == null) throw new IllegalArgumentException("Repository root is required");
        Path root = repoRoot.toAbsolutePath().normalize();
        try {
            if (!Files.isDirectory(root, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(root)
                || !Files.exists(root.toRealPath(LinkOption.NOFOLLOW_LINKS))) {
                throw new IllegalArgumentException("Repository root is not a regular directory");
            }
        } catch (IOException exception) {
            throw new IllegalArgumentException("Repository root cannot be verified", exception);
        }
        return root;
    }

    private Path containedPath(Path root, Path relative) {
        Path result = root.resolve(relative).normalize();
        if (!result.startsWith(root) || result.equals(root)) throw new IllegalArgumentException("PC version path escapes repository root");
        return result;
    }

    private Map<String, Object> readMap(Path path) throws IOException {
        return objectMapper.readValue(path.toFile(), MAP_TYPE);
    }

    private LinkedHashMap<String, Object> deepCopy(Map<String, Object> value) {
        return objectMapper.convertValue(value, MAP_TYPE);
    }

    private List<Map<String, Object>> candidateList(Object value) {
        return mapList(value, "candidate list");
    }

    private List<Map<String, Object>> mapList(Object value, String label) {
        if (!(value instanceof List<?> list)) throw new IllegalArgumentException("PC version " + label + " is invalid");
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object entry : list) result.add(asMap(entry, label + " entry"));
        return result;
    }

    private Map<String, Object> asMap(Object value, String label) {
        if (!(value instanceof Map<?, ?> map)) throw new IllegalArgumentException("PC version " + label + " is invalid");
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        map.forEach((key, entry) -> result.put(String.valueOf(key), entry));
        return result;
    }

    private long revision(Map<String, Object> state) {
        Object value = state.get("stateRevision");
        if (!(value instanceof Number number)) throw new IllegalStateException("PC version state revision is invalid");
        return number.longValue();
    }

    private static long requirePositiveLong(Object value, String label) {
        if (!(value instanceof Number number) || number.longValue() <= 0L) {
            throw new IllegalArgumentException("PC version " + label + " is invalid");
        }
        return number.longValue();
    }

    private String requireVersion(Object value, String label) {
        String version = string(value);
        if (!VERSION_PATTERN.matcher(version).matches()) throw new IllegalArgumentException("PC version " + label + " is invalid");
        return version;
    }

    private static int compareVersions(String left, String right) {
        String[] leftParts = left.split("\\.");
        String[] rightParts = right.split("\\.");
        for (int index = 0; index < Math.max(leftParts.length, rightParts.length); index++) {
            long leftPart = index < leftParts.length ? Long.parseLong(leftParts[index]) : 0L;
            long rightPart = index < rightParts.length ? Long.parseLong(rightParts[index]) : 0L;
            int comparison = Long.compare(leftPart, rightPart);
            if (comparison != 0) return comparison;
        }
        return 0;
    }

    private String stableTargetKey(Map<String, Object> target) {
        Map<String, Object> identity = asMap(target.get("stableIdentity"), "stable target identity");
        return string(target.get("domain")) + "|" + string(target.get("entityType")) + "|"
            + string(identity.get("kind")) + "|" + string(identity.get("value"));
    }

    private String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private void forceDirectory(Path directory) throws IOException {
        try (FileChannel channel = FileChannel.open(directory, StandardOpenOption.READ)) {
            channel.force(true);
        }
    }

    private static String string(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static boolean isBlank(Object value) {
        return value == null || String.valueOf(value).isBlank();
    }

    private static void closeQuietly(FileChannel channel) {
        if (channel == null) return;
        try {
            channel.close();
        } catch (IOException ignored) {
            // The acquisition failure is more useful than a close failure.
        }
    }

    public static final class ProbeClaim implements AutoCloseable {
        private final Path lockPath;
        private final ReentrantLock localLock;
        private final FileChannel channel;
        private final FileLock fileLock;
        private boolean closed;

        private ProbeClaim(Path lockPath, ReentrantLock localLock, FileChannel channel, FileLock fileLock) {
            this.lockPath = lockPath;
            this.localLock = localLock;
            this.channel = channel;
            this.fileLock = fileLock;
        }

        @Override
        public synchronized void close() {
            if (closed) return;
            closed = true;
            try {
                fileLock.release();
                channel.close();
            } catch (IOException exception) {
                throw new IllegalStateException("Failed to release PC version probe claim " + lockPath, exception);
            } finally {
                localLock.unlock();
            }
        }
    }

    public static final class StateRevisionConflictException extends RuntimeException {
        private final long expectedRevision;
        private final long actualRevision;

        public StateRevisionConflictException(long expectedRevision, long actualRevision) {
            super("PC version update state changed; expected revision " + expectedRevision + " but found " + actualRevision);
            this.expectedRevision = expectedRevision;
            this.actualRevision = actualRevision;
        }

        public long expectedRevision() { return expectedRevision; }
        public long actualRevision() { return actualRevision; }
    }
}

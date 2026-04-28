package com.terraria.skills.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import com.terraria.skills.dto.CrawlerMonitorTestStateDTO;
import com.terraria.skills.service.CrawlerMonitorService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Stream;

@Service
public class CrawlerMonitorServiceImpl implements CrawlerMonitorService {

    private static final TypeReference<LinkedHashMap<String, Object>> MAP_TYPE = new TypeReference<>() {};
    private static final Path REFRESH_DIR = Path.of("reports", "backend-refresh");
    private static final Path HISTORY_DIR = REFRESH_DIR.resolve("history");
    private static final Path DAEMON_HEARTBEAT = REFRESH_DIR.resolve("backend-refresh-daemon.heartbeat.json");
    private static final Path SCHEDULER_STATE = REFRESH_DIR.resolve("backend-refresh-scheduler.latest.json");
    private static final Path LOCK_FILE = REFRESH_DIR.resolve("backend-refresh.lock.json");
    private static final Path TEST_STATE_FILE = REFRESH_DIR.resolve("manual-monitor-test.json");
    private static final int HISTORY_LIMIT = 10;
    private static final int RECENT_REPORT_LIMIT = 20;
    private static final long REFRESH_STALE_THRESHOLD_MS = Duration.ofHours(24).toMillis();

    private final ObjectMapper objectMapper;
    private final Path repoRootOverride;
    private final Clock clock;

    @Autowired
    public CrawlerMonitorServiceImpl(ObjectMapper objectMapper) {
        this(objectMapper, null, Clock.systemUTC());
    }

    CrawlerMonitorServiceImpl(ObjectMapper objectMapper, Path repoRootOverride) {
        this(objectMapper, repoRootOverride, Clock.systemUTC());
    }

    CrawlerMonitorServiceImpl(ObjectMapper objectMapper, Path repoRootOverride, Clock clock) {
        this.objectMapper = objectMapper;
        this.repoRootOverride = repoRootOverride == null ? null : repoRootOverride.toAbsolutePath().normalize();
        this.clock = clock == null ? Clock.systemUTC() : clock;
    }

    @Override
    public CrawlerMonitorOverviewDTO getOverview() {
        Path repoRoot = resolveRepoRoot();
        CrawlerMonitorOverviewDTO overview = new CrawlerMonitorOverviewDTO();
        overview.setGeneratedAt(Instant.now());
        overview.setRepoRoot(repoRoot.toString());
        overview.setDaemon(readMonitorFile(repoRoot, DAEMON_HEARTBEAT));
        overview.setScheduler(readMonitorFile(repoRoot, SCHEDULER_STATE));
        overview.setLock(readMonitorFile(repoRoot, LOCK_FILE));
        overview.setLatestRun(buildLatestRun(repoRoot, overview.getScheduler().getPayload()));
        overview.setHistory(loadHistory(repoRoot));
        overview.setRecentReports(loadRecentReports(repoRoot));
        applyRefreshStaleState(repoRoot, overview);
        return overview;
    }

    @Override
    public CrawlerMonitorTestStateDTO getTestState() {
        Path repoRoot = resolveRepoRoot();
        Path absolutePath = repoRoot.resolve(TEST_STATE_FILE).normalize();
        ReadResult result = readJsonMap(absolutePath);
        return buildTestState(repoRoot, absolutePath, result);
    }

    @Override
    public CrawlerMonitorTestStateDTO writeTestState(Map<String, Object> payload) {
        Path repoRoot = resolveRepoRoot();
        Path absolutePath = repoRoot.resolve(TEST_STATE_FILE).normalize();
        try {
            Files.createDirectories(absolutePath.getParent());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(absolutePath.toFile(), copyPayload(payload));
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to write manual crawler monitor test state.", exception);
        }
        return getTestState();
    }

    @Override
    public CrawlerMonitorTestStateDTO resetTestState() {
        return writeTestState(defaultTestStatePayload());
    }

    private CrawlerMonitorTestStateDTO buildTestState(Path repoRoot, Path absolutePath, ReadResult result) {
        CrawlerMonitorTestStateDTO dto = new CrawlerMonitorTestStateDTO();
        dto.setPath(toDisplayPath(repoRoot, absolutePath));
        dto.setFound(result.found());
        dto.setReadable(result.readable());
        dto.setUpdatedAt(readLastModifiedIso(absolutePath));
        dto.setErrorMessage(result.errorMessage());
        dto.setPayload(copyPayload(result.payload()));
        dto.setOverview(buildTestOverview(repoRoot, result));
        return dto;
    }

    private CrawlerMonitorOverviewDTO buildTestOverview(Path repoRoot, ReadResult result) {
        Map<String, Object> payload = result.payload();
        CrawlerMonitorOverviewDTO overview = new CrawlerMonitorOverviewDTO();
        overview.setGeneratedAt(firstInstant(payload.get("generatedAt"), Instant.now(clock)));
        overview.setRepoRoot(repoRoot.toString());
        overview.setDaemon(testMonitorFile(repoRoot, result, "daemonStatus"));
        overview.setScheduler(testMonitorFile(repoRoot, result, "schedulerStatus"));
        overview.setLock(testLockFile(repoRoot, result));
        overview.setLatestRun(testLatestRun(repoRoot, result));
        overview.setHistory(List.of());
        overview.setRecentReports(List.of());
        overview.setRefreshStale(asBoolean(payload.get("refreshStale")));
        overview.setRefreshLastActivityAt(asString(payload.get("refreshLastActivityAt")));
        overview.setRefreshStaleThresholdMs(REFRESH_STALE_THRESHOLD_MS);
        overview.setRefreshStaleReason(asString(payload.get("refreshStaleReason")));
        return overview;
    }

    private CrawlerMonitorOverviewDTO.MonitorFileDTO testMonitorFile(Path repoRoot, ReadResult result, String statusKey) {
        CrawlerMonitorOverviewDTO.MonitorFileDTO dto = new CrawlerMonitorOverviewDTO.MonitorFileDTO();
        dto.setPath(toDisplayPath(repoRoot, repoRoot.resolve(TEST_STATE_FILE).normalize()));
        dto.setFound(result.found());
        dto.setReadable(result.readable());
        dto.setUpdatedAt(readLastModifiedIso(repoRoot.resolve(TEST_STATE_FILE).normalize()));
        dto.setErrorMessage(result.errorMessage());
        dto.setPayload(result.readable()
            ? Map.of("status", firstNonBlank(asString(result.payload().get(statusKey)), "idle"))
            : Map.of());
        return dto;
    }

    private CrawlerMonitorOverviewDTO.MonitorFileDTO testLockFile(Path repoRoot, ReadResult result) {
        boolean lockFound = asBoolean(result.payload().get("lockFound"));
        CrawlerMonitorOverviewDTO.MonitorFileDTO dto = new CrawlerMonitorOverviewDTO.MonitorFileDTO();
        dto.setPath(toDisplayPath(repoRoot, repoRoot.resolve(TEST_STATE_FILE).normalize()));
        dto.setFound(lockFound);
        dto.setReadable(lockFound && result.readable());
        dto.setUpdatedAt(lockFound ? readLastModifiedIso(repoRoot.resolve(TEST_STATE_FILE).normalize()) : null);
        dto.setErrorMessage(result.errorMessage());
        dto.setPayload(lockFound ? Map.of("status", "locked") : Map.of());
        return dto;
    }

    private CrawlerMonitorOverviewDTO.MonitorRunDTO testLatestRun(Path repoRoot, ReadResult result) {
        Map<String, Object> latestRun = asMap(result.payload().get("latestRun"));
        CrawlerMonitorOverviewDTO.MonitorRunDTO run = new CrawlerMonitorOverviewDTO.MonitorRunDTO();
        run.setFound(result.found());
        run.setReadable(result.readable());
        run.setPath(toDisplayPath(repoRoot, repoRoot.resolve(TEST_STATE_FILE).normalize()));
        run.setSummaryPath(toDisplayPath(repoRoot, repoRoot.resolve(TEST_STATE_FILE).normalize()));
        run.setGeneratedAt(asString(latestRun.get("generatedAt")));
        run.setOutputPath(normalizePayloadPath(repoRoot, latestRun.get("outputPath")));
        run.setLastActionId(asString(latestRun.get("lastActionId")));
        run.setTotalActions(asLong(latestRun.get("totalActions")));
        run.setCompletedActions(asLong(latestRun.get("completedActions")));
        run.setFailedActions(asLong(latestRun.get("failedActions")));
        run.setRunningActions(asLong(latestRun.get("runningActions")));
        run.setPendingActions(asLong(latestRun.get("pendingActions")));
        run.setTimedOutActions(asLong(latestRun.get("timedOutActions")));
        run.setTotalDurationMs(asLong(latestRun.get("totalDurationMs")));
        run.setErrorMessage(result.errorMessage());
        run.setActions(toActions(repoRoot, latestRun.get("actions")));
        return run;
    }

    private CrawlerMonitorOverviewDTO.MonitorFileDTO readMonitorFile(Path repoRoot, Path relativePath) {
        Path absolutePath = repoRoot.resolve(relativePath).normalize();
        CrawlerMonitorOverviewDTO.MonitorFileDTO dto = new CrawlerMonitorOverviewDTO.MonitorFileDTO();
        dto.setPath(toDisplayPath(repoRoot, absolutePath));
        if (!Files.exists(absolutePath)) {
            dto.setFound(false);
            dto.setReadable(false);
            return dto;
        }

        dto.setFound(true);
        dto.setUpdatedAt(readLastModifiedIso(absolutePath));
        try {
            dto.setPayload(objectMapper.readValue(absolutePath.toFile(), MAP_TYPE));
            dto.setReadable(true);
        } catch (IOException exception) {
            dto.setReadable(false);
            dto.setErrorMessage(exception.getMessage());
        }
        return dto;
    }

    private CrawlerMonitorOverviewDTO.MonitorRunDTO buildLatestRun(Path repoRoot, Map<String, Object> schedulerPayload) {
        Path historyDir = repoRoot.resolve(HISTORY_DIR).normalize();
        Path schedulerOutputPath = resolvePayloadPathInsideRepo(repoRoot, schedulerPayload.get("lastOutputPath"));
        boolean usingSchedulerOutput = schedulerOutputPath != null && Files.exists(schedulerOutputPath);
        Path outputPath = usingSchedulerOutput ? schedulerOutputPath : findLatestFullReport(historyDir);

        Path summaryPath = null;
        if (outputPath != null) {
            Path siblingSummary = buildSummaryPath(outputPath);
            if (Files.exists(siblingSummary)) {
                summaryPath = siblingSummary;
            }
        }

        Path schedulerSummaryPath = resolvePayloadPathInsideRepo(repoRoot, schedulerPayload.get("lastSummaryPath"));
        if (summaryPath == null && (usingSchedulerOutput || outputPath == null)
            && schedulerSummaryPath != null && Files.exists(schedulerSummaryPath)) {
            summaryPath = schedulerSummaryPath;
        }

        if (summaryPath == null || !Files.exists(summaryPath)) {
            summaryPath = findLatestSummary(historyDir);
        }

        return buildRun(repoRoot, outputPath, summaryPath);
    }

    private List<CrawlerMonitorOverviewDTO.MonitorRunDTO> loadHistory(Path repoRoot) {
        Path historyDir = repoRoot.resolve(HISTORY_DIR).normalize();
        if (!Files.isDirectory(historyDir)) {
            return List.of();
        }

        try (Stream<Path> stream = Files.list(historyDir)) {
            return stream
                .filter(Files::isRegularFile)
                .filter(path -> path.getFileName().toString().endsWith(".summary.json"))
                .sorted(Comparator.comparingLong(this::safeLastModifiedMillis).reversed())
                .limit(HISTORY_LIMIT)
                .map(path -> buildRun(repoRoot, null, path))
                .toList();
        } catch (IOException ignored) {
            return List.of();
        }
    }

    private List<CrawlerMonitorOverviewDTO.MonitorReportDTO> loadRecentReports(Path repoRoot) {
        List<Path> candidates = new ArrayList<>();
        collectReportFiles(repoRoot, repoRoot.resolve("reports").normalize(), candidates);
        collectReportFiles(repoRoot, repoRoot.resolve("back").resolve("target").resolve("surefire-reports").normalize(), candidates);

        return candidates.stream()
            .sorted(Comparator.comparingLong(this::safeLastModifiedMillis).reversed())
            .limit(RECENT_REPORT_LIMIT)
            .map(path -> toReportDTO(repoRoot, path))
            .toList();
    }

    private void collectReportFiles(Path repoRoot, Path root, List<Path> candidates) {
        if (!Files.isDirectory(root)) {
            return;
        }
        Path backendRefreshDir = repoRoot.resolve(REFRESH_DIR).normalize();
        try (Stream<Path> stream = Files.walk(root)) {
            stream
                .filter(Files::isRegularFile)
                .filter(path -> !path.normalize().startsWith(backendRefreshDir))
                .filter(this::isReportLikeFile)
                .forEach(candidates::add);
        } catch (IOException ignored) {
            // Best-effort diagnostics should not break the monitor endpoint.
        }
    }

    private boolean isReportLikeFile(Path path) {
        String fileName = path.getFileName().toString().toLowerCase(Locale.ROOT);
        return fileName.endsWith(".json")
            || fileName.endsWith(".md")
            || fileName.endsWith(".xml")
            || fileName.endsWith(".txt");
    }

    private CrawlerMonitorOverviewDTO.MonitorReportDTO toReportDTO(Path repoRoot, Path path) {
        CrawlerMonitorOverviewDTO.MonitorReportDTO dto = new CrawlerMonitorOverviewDTO.MonitorReportDTO();
        dto.setName(path.getFileName().toString());
        dto.setPath(toDisplayPath(repoRoot, path));
        dto.setCategory(reportCategory(repoRoot, path));
        dto.setUpdatedAt(readLastModifiedIso(path));
        dto.setSizeBytes(safeSize(path));
        return dto;
    }

    private String reportCategory(Path repoRoot, Path path) {
        String displayPath = toDisplayPath(repoRoot, path).toLowerCase(Locale.ROOT).replace('\\', '/');
        String fileName = path.getFileName().toString().toLowerCase(Locale.ROOT);
        if (displayPath.contains("surefire-reports") || fileName.startsWith("test-")) {
            return "test";
        }
        if (displayPath.contains("/fetch/") || displayPath.contains("crawler") || displayPath.contains("crawl") || displayPath.contains("wiki")) {
            return "crawler";
        }
        if (displayPath.contains("audit")
            || displayPath.contains("check")
            || displayPath.contains("verification")
            || displayPath.contains("verify")
            || displayPath.contains("postcheck")
            || displayPath.contains("readiness")
            || displayPath.contains("coverage")
            || displayPath.contains("smoke")) {
            return "audit";
        }
        return "report";
    }

    private void applyRefreshStaleState(Path repoRoot, CrawlerMonitorOverviewDTO overview) {
        Instant lastActivity = findRefreshLastActivity(repoRoot, overview);
        overview.setRefreshStaleThresholdMs(REFRESH_STALE_THRESHOLD_MS);

        if (lastActivity == null) {
            overview.setRefreshStale(true);
            overview.setRefreshStaleReason("backend-refresh monitor files are missing or unreadable.");
            return;
        }

        overview.setRefreshLastActivityAt(lastActivity.toString());
        long ageMs = Duration.between(lastActivity, Instant.now(clock)).toMillis();
        boolean stale = ageMs > REFRESH_STALE_THRESHOLD_MS;
        overview.setRefreshStale(stale);
        if (stale) {
            overview.setRefreshStaleReason("backend-refresh monitor has no activity for more than 24 hours; recent crawler/test reports may live outside this refresh chain.");
        }
    }

    private Instant findRefreshLastActivity(Path repoRoot, CrawlerMonitorOverviewDTO overview) {
        List<Instant> candidates = new ArrayList<>();
        addLastModifiedCandidate(candidates, repoRoot.resolve(DAEMON_HEARTBEAT).normalize());
        addLastModifiedCandidate(candidates, repoRoot.resolve(SCHEDULER_STATE).normalize());
        addLastModifiedCandidate(candidates, repoRoot.resolve(LOCK_FILE).normalize());
        addLastModifiedCandidate(candidates, resolvePayloadPathInsideRepo(repoRoot, overview.getLatestRun().getPath()));
        addLastModifiedCandidate(candidates, resolvePayloadPathInsideRepo(repoRoot, overview.getLatestRun().getSummaryPath()));
        addInstantCandidate(candidates, overview.getLatestRun().getGeneratedAt());
        return candidates.stream().max(Comparator.naturalOrder()).orElse(null);
    }

    private void addLastModifiedCandidate(List<Instant> candidates, Path path) {
        Instant instant = readLastModifiedInstant(path);
        if (instant != null) {
            candidates.add(instant);
        }
    }

    private void addInstantCandidate(List<Instant> candidates, String value) {
        Instant instant = parseInstant(value);
        if (instant != null) {
            candidates.add(instant);
        }
    }

    private CrawlerMonitorOverviewDTO.MonitorRunDTO buildRun(Path repoRoot, Path outputPath, Path summaryPath) {
        CrawlerMonitorOverviewDTO.MonitorRunDTO run = new CrawlerMonitorOverviewDTO.MonitorRunDTO();
        run.setFound(outputPath != null || summaryPath != null);
        run.setPath(outputPath == null ? null : toDisplayPath(repoRoot, outputPath));
        run.setSummaryPath(summaryPath == null ? null : toDisplayPath(repoRoot, summaryPath));

        ReadResult output = readJsonMap(outputPath);
        ReadResult summary = readJsonMap(summaryPath);
        run.setReadable(run.isFound() && (outputPath == null || output.readable()) && (summaryPath == null || summary.readable()));
        run.setErrorMessage(firstNonBlank(output.errorMessage(), summary.errorMessage()));

        Map<String, Object> summaryPayload = !summary.payload().isEmpty() ? summary.payload() : output.payload();
        run.setGeneratedAt(asString(summaryPayload.get("generatedAt")));
        run.setOutputPath(normalizePayloadPath(repoRoot, summaryPayload.get("outputPath")));
        run.setLastActionId(asString(summaryPayload.get("lastActionId")));
        run.setTotalActions(asLong(summaryPayload.get("totalActions")));
        run.setCompletedActions(asLong(summaryPayload.get("completedActions")));
        run.setFailedActions(asLong(summaryPayload.get("failedActions")));
        run.setRunningActions(asLong(summaryPayload.get("runningActions")));
        run.setPendingActions(asLong(summaryPayload.get("pendingActions")));
        run.setTimedOutActions(asLong(summaryPayload.get("timedOutActions")));
        run.setTotalDurationMs(asLong(summaryPayload.get("totalDurationMs")));
        run.setActions(toActions(repoRoot, output.payload().get("actions")));
        return run;
    }

    private List<CrawlerMonitorOverviewDTO.MonitorActionDTO> toActions(Path repoRoot, Object rawActions) {
        if (!(rawActions instanceof List<?> rows)) {
            return List.of();
        }
        List<CrawlerMonitorOverviewDTO.MonitorActionDTO> actions = new ArrayList<>();
        for (Object row : rows) {
            if (!(row instanceof Map<?, ?> map)) {
                continue;
            }
            CrawlerMonitorOverviewDTO.MonitorActionDTO action = new CrawlerMonitorOverviewDTO.MonitorActionDTO();
            action.setId(asString(map.get("id")));
            action.setRunner(asString(map.get("runner")));
            action.setArgs(toStringList(map.get("args")));
            action.setStatus(asString(map.get("status")));
            action.setTimeoutMs(asNullableLong(map.get("timeoutMs")));
            action.setDurationMs(asNullableLong(map.get("durationMs")));
            action.setTimedOut(Boolean.TRUE.equals(map.get("timedOut")));
            action.setHeartbeatPath(normalizePayloadPath(repoRoot, map.get("heartbeatPath")));
            action.setSnapshotPath(normalizePayloadPath(repoRoot, map.get("snapshotPath")));
            action.setUpdatedAt(asString(map.get("updatedAt")));
            actions.add(action);
        }
        return actions;
    }

    private ReadResult readJsonMap(Path path) {
        if (path == null || !Files.exists(path)) {
            return new ReadResult(false, false, Collections.emptyMap(), null);
        }
        try {
            return new ReadResult(true, true, objectMapper.readValue(path.toFile(), MAP_TYPE), null);
        } catch (IOException exception) {
            return new ReadResult(true, false, Collections.emptyMap(), exception.getMessage());
        }
    }

    private Path resolvePayloadPathInsideRepo(Path repoRoot, Object rawPath) {
        String text = asString(rawPath);
        if (text == null || text.isBlank()) {
            return null;
        }
        Path path = Path.of(text);
        Path resolved = path.isAbsolute() ? path.normalize() : repoRoot.resolve(path).normalize();
        return resolved.startsWith(repoRoot) ? resolved : null;
    }

    private String normalizePayloadPath(Path repoRoot, Object rawPath) {
        String text = asString(rawPath);
        if (text == null || text.isBlank()) {
            return null;
        }
        Path resolved = resolvePayloadPathInsideRepo(repoRoot, text);
        return resolved == null ? text : toDisplayPath(repoRoot, resolved);
    }

    private Path findLatestFullReport(Path historyDir) {
        if (!Files.isDirectory(historyDir)) {
            return null;
        }
        try (Stream<Path> stream = Files.list(historyDir)) {
            return stream
                .filter(Files::isRegularFile)
                .filter(path -> {
                    String fileName = path.getFileName().toString();
                    return fileName.startsWith("backend-data-refresh-")
                        && fileName.endsWith(".json")
                        && !fileName.endsWith(".summary.json");
                })
                .max(Comparator.comparingLong(this::safeLastModifiedMillis))
                .orElse(null);
        } catch (IOException ignored) {
            return null;
        }
    }

    private Path findLatestSummary(Path historyDir) {
        if (!Files.isDirectory(historyDir)) {
            return null;
        }
        try (Stream<Path> stream = Files.list(historyDir)) {
            return stream
                .filter(Files::isRegularFile)
                .filter(path -> path.getFileName().toString().endsWith(".summary.json"))
                .max(Comparator.comparingLong(this::safeLastModifiedMillis))
                .orElse(null);
        } catch (IOException ignored) {
            return null;
        }
    }

    private Path buildSummaryPath(Path outputPath) {
        String fileName = outputPath.getFileName().toString();
        if (!fileName.endsWith(".json")) {
            return outputPath.resolveSibling(fileName + ".summary.json");
        }
        return outputPath.resolveSibling(fileName.substring(0, fileName.length() - ".json".length()) + ".summary.json");
    }

    private Path resolveRepoRoot() {
        if (repoRootOverride != null) {
            return repoRootOverride;
        }

        Path current = Path.of("").toAbsolutePath().normalize();
        while (current != null) {
            if (looksLikeRepoRoot(current)) {
                return current;
            }
            current = current.getParent();
        }
        return Path.of("").toAbsolutePath().normalize();
    }

    private boolean looksLikeRepoRoot(Path path) {
        return path != null
            && Files.exists(path.resolve("back"))
            && Files.exists(path.resolve("data-query-app"))
            && Files.exists(path.resolve("scripts"));
    }

    private String toDisplayPath(Path repoRoot, Path path) {
        if (path == null) {
            return null;
        }
        Path normalized = path.toAbsolutePath().normalize();
        try {
            if (normalized.startsWith(repoRoot)) {
                return repoRoot.relativize(normalized).toString().replace('\\', '/');
            }
        } catch (IllegalArgumentException ignored) {
            return normalized.toString();
        }
        return normalized.toString();
    }

    private String readLastModifiedIso(Path path) {
        try {
            FileTime fileTime = Files.getLastModifiedTime(path);
            return fileTime.toInstant().toString();
        } catch (IOException ignored) {
            return null;
        }
    }

    private Instant readLastModifiedInstant(Path path) {
        try {
            if (path == null || !Files.exists(path)) {
                return null;
            }
            return Files.getLastModifiedTime(path).toInstant();
        } catch (IOException ignored) {
            return null;
        }
    }

    private long safeLastModifiedMillis(Path path) {
        try {
            return Files.getLastModifiedTime(path).toMillis();
        } catch (IOException ignored) {
            return Long.MIN_VALUE;
        }
    }

    private Long safeSize(Path path) {
        try {
            return Files.size(path);
        } catch (IOException ignored) {
            return null;
        }
    }

    private Instant parseInstant(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Instant.parse(value);
        } catch (Exception ignored) {
            return null;
        }
    }

    private Instant firstInstant(Object value, Instant fallback) {
        Instant instant = parseInstant(asString(value));
        return instant == null ? fallback : instant;
    }

    private String asString(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private Map<String, Object> asMap(Object value) {
        if (!(value instanceof Map<?, ?> map)) {
            return Map.of();
        }
        LinkedHashMap<String, Object> copy = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            copy.put(String.valueOf(entry.getKey()), entry.getValue());
        }
        return copy;
    }

    private boolean asBoolean(Object value) {
        if (value instanceof Boolean bool) {
            return bool;
        }
        if (value == null || String.valueOf(value).isBlank()) {
            return false;
        }
        return Boolean.parseBoolean(String.valueOf(value));
    }

    private long asLong(Object value) {
        Long parsed = asNullableLong(value);
        return parsed == null ? 0L : parsed;
    }

    private Long asNullableLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value == null || String.valueOf(value).isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private List<String> toStringList(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        return list.stream()
            .map(String::valueOf)
            .toList();
    }

    private String firstNonBlank(String first, String second) {
        if (first != null && !first.isBlank()) {
            return first;
        }
        return second == null || second.isBlank() ? null : second;
    }

    private LinkedHashMap<String, Object> copyPayload(Map<String, Object> payload) {
        return payload == null ? new LinkedHashMap<>() : new LinkedHashMap<>(payload);
    }

    private Map<String, Object> defaultTestStatePayload() {
        LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
        payload.put("scenario", "idle");
        payload.put("generatedAt", Instant.now(clock).toString());
        payload.put("daemonStatus", "idle");
        payload.put("schedulerStatus", "idle");
        payload.put("lockFound", false);
        payload.put("refreshStale", false);

        LinkedHashMap<String, Object> latestRun = new LinkedHashMap<>();
        latestRun.put("generatedAt", Instant.now(clock).toString());
        latestRun.put("totalActions", 0);
        latestRun.put("completedActions", 0);
        latestRun.put("failedActions", 0);
        latestRun.put("runningActions", 0);
        latestRun.put("pendingActions", 0);
        latestRun.put("timedOutActions", 0);
        latestRun.put("totalDurationMs", 0);
        latestRun.put("actions", List.of());
        payload.put("latestRun", latestRun);
        return payload;
    }

    private record ReadResult(
        boolean found,
        boolean readable,
        Map<String, Object> payload,
        String errorMessage
    ) {
    }
}

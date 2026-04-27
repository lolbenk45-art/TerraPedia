package com.terraria.skills.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import com.terraria.skills.service.CrawlerMonitorService;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
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
    private static final int HISTORY_LIMIT = 10;

    private final ObjectMapper objectMapper;
    private final Path repoRootOverride;

    public CrawlerMonitorServiceImpl(ObjectMapper objectMapper) {
        this(objectMapper, null);
    }

    CrawlerMonitorServiceImpl(ObjectMapper objectMapper, Path repoRootOverride) {
        this.objectMapper = objectMapper;
        this.repoRootOverride = repoRootOverride == null ? null : repoRootOverride.toAbsolutePath().normalize();
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
        return overview;
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
        Path outputPath = resolvePayloadPathInsideRepo(repoRoot, schedulerPayload.get("lastOutputPath"));
        if (outputPath == null || !Files.exists(outputPath)) {
            outputPath = findLatestFullReport(historyDir);
        }

        Path summaryPath = resolvePayloadPathInsideRepo(repoRoot, schedulerPayload.get("lastSummaryPath"));
        if ((summaryPath == null || !Files.exists(summaryPath)) && outputPath != null) {
            Path siblingSummary = buildSummaryPath(outputPath);
            if (Files.exists(siblingSummary)) {
                summaryPath = siblingSummary;
            }
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

    private long safeLastModifiedMillis(Path path) {
        try {
            return Files.getLastModifiedTime(path).toMillis();
        } catch (IOException ignored) {
            return Long.MIN_VALUE;
        }
    }

    private String asString(Object value) {
        return value == null ? null : String.valueOf(value);
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

    private record ReadResult(
        boolean found,
        boolean readable,
        Map<String, Object> payload,
        String errorMessage
    ) {
    }
}

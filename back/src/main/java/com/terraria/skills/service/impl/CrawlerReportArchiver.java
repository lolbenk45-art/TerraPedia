package com.terraria.skills.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import com.terraria.skills.dto.CrawlerMonitorReportDetailDTO;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.FileTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Stream;

public class CrawlerReportArchiver {

    private static final TypeReference<LinkedHashMap<String, Object>> MAP_TYPE = new TypeReference<>() {};
    private static final Path REFRESH_DIR = Path.of("reports", "backend-refresh");
    private static final Path HISTORY_DIR = REFRESH_DIR.resolve("history");
    private static final int HISTORY_LIMIT = 10;
    private static final int RECENT_REPORT_LIMIT = 20;
    private static final int REPORT_SCAN_MAX_DEPTH = 4;
    private static final int REPORT_PREVIEW_MAX_BYTES = 200_000;
    private static final int DIRECTORY_PREVIEW_FILE_LIMIT = 500;

    private final ObjectMapper objectMapper;

    public CrawlerReportArchiver(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public CrawlerMonitorOverviewDTO.MonitorRunDTO buildLatestRun(Path repoRoot, Map<String, Object> schedulerPayload) {
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

    public List<CrawlerMonitorOverviewDTO.MonitorRunDTO> loadHistory(Path repoRoot) {
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

    public List<CrawlerMonitorOverviewDTO.MonitorReportDTO> loadRecentReports(Path repoRoot) {
        List<Path> candidates = new ArrayList<>();
        collectReportFiles(repoRoot, repoRoot.resolve("reports").normalize(), candidates);
        collectReportFiles(repoRoot, repoRoot.resolve("back").resolve("target").resolve("surefire-reports").normalize(), candidates);

        return candidates.stream()
            .sorted(Comparator.comparingLong(this::safeLastModifiedMillis).reversed())
            .limit(RECENT_REPORT_LIMIT)
            .map(path -> toReportDTO(repoRoot, path))
            .toList();
    }

    public CrawlerMonitorReportDetailDTO getReportDetail(Path repoRoot, String path) {
        CrawlerMonitorReportDetailDTO detail = new CrawlerMonitorReportDetailDTO();
        detail.setPath(path);
        detail.setMaxBytes((long) REPORT_PREVIEW_MAX_BYTES);

        Path resolved = resolvePayloadPathInsideRepo(repoRoot, path);
        if (resolved == null || !isAllowedReportPreviewPath(repoRoot, resolved)) {
            detail.setFound(false);
            detail.setReadable(false);
            detail.setErrorMessage("Report path is not allowed.");
            return detail;
        }

        detail.setName(resolved.getFileName().toString());
        detail.setPath(toDisplayPath(repoRoot, resolved));
        detail.setCategory(reportCategory(repoRoot, resolved));
        detail.setContentType(reportContentType(resolved));
        if (!Files.exists(resolved)) {
            detail.setFound(false);
            detail.setReadable(false);
            detail.setErrorMessage("Report file was not found.");
            return detail;
        }
        if (isAllowedCrawlerOutputDirectory(repoRoot, resolved)) {
            return buildDirectoryPreview(repoRoot, resolved, detail);
        }
        if (!Files.isRegularFile(resolved)) {
            detail.setFound(true);
            detail.setReadable(false);
            detail.setErrorMessage("Report path is not a regular file.");
            return detail;
        }

        detail.setFound(true);
        detail.setUpdatedAt(readLastModifiedIso(resolved));
        detail.setSizeBytes(safeSize(resolved));
        try {
            byte[] bytes = readPreviewBytes(resolved, REPORT_PREVIEW_MAX_BYTES);
            detail.setTruncated(detail.getSizeBytes() != null && detail.getSizeBytes() > REPORT_PREVIEW_MAX_BYTES);
            String content = formatReportPreviewContent(resolved, bytes, detail.isTruncated());
            if (content.isBlank() && isCrawlerMonitorLogPath(repoRoot, resolved)) {
                content = firstNonBlank(synthesizedCrawlerMonitorLogSummary(repoRoot, resolved), content);
            }
            detail.setContent(content);
            detail.setReadable(true);
        } catch (IOException exception) {
            detail.setReadable(false);
            detail.setErrorMessage(exception.getMessage());
        }
        return detail;
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
            action.setChildStatusPath(normalizePayloadPath(repoRoot, map.get("childStatusPath")));
            action.setUpdatedAt(asString(map.get("updatedAt")));
            applyProgressFields(repoRoot, action, map);
            actions.add(action);
        }
        return actions;
    }

    private void applyProgressFields(Path repoRoot, CrawlerMonitorOverviewDTO.MonitorActionDTO action, Map<?, ?> payload) {
        if (payload == null || payload.isEmpty()) {
            return;
        }
        Long current = asNullableLong(payload.get("current"));
        Long total = asNullableLong(payload.get("total"));
        Double percent = asNullableDouble(payload.get("percent"));
        if (current != null) {
            action.setCurrent(current);
        }
        if (total != null) {
            action.setTotal(total);
        }
        Long batchOffset = asNullableLong(payload.get("batchOffset"));
        if (batchOffset != null) {
            action.setBatchOffset(batchOffset);
        }
        Long batchLimit = asNullableLong(payload.get("batchLimit"));
        if (batchLimit != null) {
            action.setBatchLimit(batchLimit);
        }
        Long overallCurrent = asNullableLong(payload.get("overallCurrent"));
        if (overallCurrent != null) {
            action.setOverallCurrent(overallCurrent);
        }
        Long overallTotal = asNullableLong(payload.get("overallTotal"));
        if (overallTotal != null) {
            action.setOverallTotal(overallTotal);
        }
        if (percent == null && current != null && total != null && total > 0) {
            percent = (current.doubleValue() / total.doubleValue()) * 100.0d;
        }
        if (percent != null) {
            action.setPercent(clampPercent(percent));
        }
        action.setPhase(firstNonBlank(asString(payload.get("phase")), action.getPhase()));
        action.setMessage(firstNonBlank(asString(payload.get("message")), action.getMessage()));
        action.setQueue(firstNonBlank(asString(payload.get("queue")), action.getQueue()));
        action.setDataStage(firstNonBlank(asString(payload.get("dataStage")), action.getDataStage()));
        action.setNextStep(firstNonBlank(asString(payload.get("nextStep")), action.getNextStep()));
        action.setStartedAt(firstNonBlank(asString(payload.get("startedAt")), action.getStartedAt()));
        action.setLastHeartbeatAt(firstNonBlank(
            firstNonBlank(asString(payload.get("lastHeartbeatAt")), asString(payload.get("generatedAt"))),
            action.getLastHeartbeatAt()
        ));
        String childStatusPath = normalizePayloadPath(repoRoot, payload.get("childStatusPath"));
        if (childStatusPath != null && !childStatusPath.isBlank()) {
            action.setChildStatusPath(childStatusPath);
        }
    }

    private ReadResult readJsonMap(Path path) {
        if (path == null || !Files.exists(path)) {
            return new ReadResult(false, Collections.emptyMap(), null);
        }
        try {
            return new ReadResult(true, objectMapper.readValue(path.toFile(), MAP_TYPE), null);
        } catch (IOException exception) {
            return new ReadResult(false, Collections.emptyMap(), exception.getMessage());
        }
    }

    private void collectReportFiles(Path repoRoot, Path root, List<Path> candidates) {
        if (!Files.isDirectory(root)) {
            return;
        }
        Path backendRefreshDir = repoRoot.resolve(REFRESH_DIR).normalize();
        // Bound the walk so high-frequency overview polling never recurses into deep per-run
        // dispatch output directories; legitimate report files live at most a couple levels deep.
        try (Stream<Path> stream = walkReportFiles(root)) {
            stream
                .filter(Files::isRegularFile)
                .filter(path -> !path.normalize().startsWith(backendRefreshDir))
                .filter(this::isReportLikeFile)
                .forEach(candidates::add);
        } catch (IOException | UncheckedIOException ignored) {
        }
    }

    Stream<Path> walkReportFiles(Path root) throws IOException {
        return Files.walk(root, REPORT_SCAN_MAX_DEPTH);
    }

    private boolean isAllowedReportPreviewPath(Path repoRoot, Path path) {
        Path normalized = path.toAbsolutePath().normalize();
        if (isAllowedCrawlerOutputDirectory(repoRoot, normalized)) {
            return true;
        }
        if (!isReportLikeFile(normalized)) {
            return false;
        }

        Path reportsRoot = repoRoot.resolve("reports").normalize();
        Path testReportsRoot = repoRoot.resolve("back").resolve("target").resolve("surefire-reports").normalize();
        Path generatedRoot = repoRoot.resolve("data").resolve("generated").normalize();
        Path standardizedViewRoot = repoRoot.resolve("data").resolve("standardized-view").normalize();
        Path rawWikiRoot = resolveSharedDataRoot(repoRoot).resolve("raw").resolve("wiki").normalize();
        boolean standardizedViewJson = normalized.startsWith(standardizedViewRoot) && isJsonFile(normalized);
        boolean rawWikiJson = normalized.startsWith(rawWikiRoot) && isJsonFile(normalized);
        if (!normalized.startsWith(reportsRoot)
            && !normalized.startsWith(testReportsRoot)
            && !normalized.startsWith(generatedRoot)
            && !standardizedViewJson
            && !rawWikiJson) {
            return false;
        }
        if (!Files.exists(normalized)) {
            return true;
        }

        try {
            Path realPath = normalized.toRealPath();
            return realPath.startsWith(realRoot(reportsRoot))
                || realPath.startsWith(realRoot(testReportsRoot))
                || realPath.startsWith(realRoot(generatedRoot))
                || (realPath.startsWith(realRoot(standardizedViewRoot)) && isJsonFile(realPath))
                || (realPath.startsWith(realRoot(rawWikiRoot)) && isJsonFile(realPath));
        } catch (IOException ignored) {
            return false;
        }
    }

    private boolean isAllowedCrawlerOutputDirectory(Path repoRoot, Path path) {
        Path normalized = path.toAbsolutePath().normalize();
        Path buffEvidenceCacheRoot = repoRoot.resolve("data").resolve("generated").resolve("buff-page-evidence-cache").normalize();
        if (!normalized.equals(buffEvidenceCacheRoot)) {
            return false;
        }
        if (!Files.exists(normalized)) {
            return true;
        }
        try {
            Path realPath = normalized.toRealPath();
            return Files.isDirectory(realPath) && realPath.equals(realRoot(buffEvidenceCacheRoot));
        } catch (IOException ignored) {
            return false;
        }
    }

    private boolean isReportLikeFile(Path path) {
        String fileName = path.getFileName().toString().toLowerCase(Locale.ROOT);
        if (fileName.endsWith(".log")) {
            // Only allow .log files inside reports/crawler-monitor/
            String displayPath = path.toAbsolutePath().normalize().toString().replace('\\', '/');
            return displayPath.contains("/reports/crawler-monitor/");
        }
        return fileName.endsWith(".json")
            || fileName.endsWith(".md")
            || fileName.endsWith(".xml")
            || fileName.endsWith(".txt");
    }

    private boolean isJsonFile(Path path) {
        return path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".json");
    }

    private Path realRoot(Path root) throws IOException {
        return Files.exists(root) ? root.toRealPath() : root.toAbsolutePath().normalize();
    }

    private CrawlerMonitorReportDetailDTO buildDirectoryPreview(Path repoRoot, Path directory, CrawlerMonitorReportDetailDTO detail) {
        detail.setFound(true);
        detail.setReadable(true);
        detail.setUpdatedAt(readLastModifiedIso(directory));
        detail.setContentType("json");
        try (Stream<Path> stream = Files.list(directory)) {
            List<LinkedHashMap<String, Object>> files = stream
                .filter(Files::isRegularFile)
                .filter(this::isJsonFile)
                .sorted(Comparator.comparing(path -> path.getFileName().toString()))
                .limit(DIRECTORY_PREVIEW_FILE_LIMIT)
                .map(path -> {
                    LinkedHashMap<String, Object> row = new LinkedHashMap<>();
                    row.put("name", path.getFileName().toString());
                    row.put("path", toDisplayPath(repoRoot, path));
                    row.put("updatedAt", readLastModifiedIso(path));
                    row.put("sizeBytes", safeSize(path));
                    return row;
                })
                .toList();
            LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
            payload.put("path", toDisplayPath(repoRoot, directory));
            payload.put("fileCount", files.size());
            payload.put("truncated", files.size() >= DIRECTORY_PREVIEW_FILE_LIMIT);
            payload.put("files", files);
            byte[] bytes = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(payload);
            detail.setSizeBytes((long) bytes.length);
            detail.setContent(new String(bytes, StandardCharsets.UTF_8));
            detail.setTruncated(false);
        } catch (IOException exception) {
            detail.setReadable(false);
            detail.setErrorMessage(exception.getMessage());
        }
        return detail;
    }

    private byte[] readPreviewBytes(Path path, int maxBytes) throws IOException {
        long size = Files.size(path);
        int length = (int) Math.min(size, maxBytes);
        byte[] bytes = new byte[length];
        try (var input = Files.newInputStream(path, StandardOpenOption.READ)) {
            int offset = 0;
            while (offset < length) {
                int read = input.read(bytes, offset, length - offset);
                if (read < 0) {
                    break;
                }
                offset += read;
            }
            if (offset == length) {
                return bytes;
            }
            byte[] resized = new byte[offset];
            System.arraycopy(bytes, 0, resized, 0, offset);
            return resized;
        }
    }

    private String formatReportPreviewContent(Path path, byte[] bytes, boolean truncated) throws IOException {
        String content = new String(bytes, StandardCharsets.UTF_8);
        if (!truncated && "json".equals(reportContentType(path))) {
            JsonNode node = objectMapper.readTree(content);
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(node);
        }
        return content;
    }

    private String reportContentType(Path path) {
        String fileName = path.getFileName().toString().toLowerCase(Locale.ROOT);
        if (fileName.endsWith(".json")) {
            return "json";
        }
        if (fileName.endsWith(".md")) {
            return "markdown";
        }
        if (fileName.endsWith(".xml")) {
            return "xml";
        }
        if (fileName.endsWith(".txt")) {
            return "text";
        }
        return "text";
    }

    private boolean isCrawlerMonitorLogPath(Path repoRoot, Path path) {
        String displayPath = toDisplayPath(repoRoot, path).toLowerCase(Locale.ROOT).replace('\\', '/');
        return displayPath.startsWith("reports/crawler-monitor/") && displayPath.endsWith(".log");
    }

    private String synthesizedCrawlerMonitorLogSummary(Path repoRoot, Path logPath) {
        String displayPath = toDisplayPath(repoRoot, logPath);
        ReadResult queue = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json").normalize());
        Object items = queue.payload().get("items");
        if (!(items instanceof List<?> rows)) {
            return null;
        }
        for (Object row : rows) {
            if (!(row instanceof Map<?, ?> item)) {
                continue;
            }
            if (!displayPath.equals(asString(item.get("logPath")))) {
                continue;
            }
            String status = asString(item.get("status"));
            String message = firstNonBlank(asString(item.get("message")), "log file is empty");
            return String.join(System.lineSeparator(),
                "[crawler-monitor] empty log fallback",
                "dispatchId=" + firstNonBlank(asString(item.get("dispatchId")), "unknown"),
                "domain=" + firstNonBlank(asString(item.get("domain")), "unknown"),
                "actionId=" + firstNonBlank(asString(item.get("actionId")), "unknown"),
                "status=" + firstNonBlank(status, "unknown"),
                "message=" + message,
                "logPath=" + displayPath,
                ""
            );
        }
        return null;
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

    private Path resolvePayloadPathInsideRepo(Path repoRoot, Object rawPath) {
        String text = asString(rawPath);
        if (text == null || text.isBlank()) {
            return null;
        }
        Path path = Path.of(text);
        if (!path.isAbsolute() && path.normalize().startsWith(Path.of("data", "terraPedia"))) {
            Path sharedRelative = Path.of("data", "terraPedia").relativize(path.normalize());
            return resolveSharedDataRoot(repoRoot).resolve(sharedRelative).normalize();
        }
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

    private String toDisplayPath(Path repoRoot, Path path) {
        if (path == null) {
            return null;
        }
        Path normalized = path.toAbsolutePath().normalize();
        try {
            if (normalized.startsWith(repoRoot)) {
                return repoRoot.relativize(normalized).toString().replace('\\', '/');
            }
            Path sharedDataRoot = resolveSharedDataRoot(repoRoot);
            if (normalized.startsWith(sharedDataRoot)) {
                return Path.of("data", "terraPedia")
                    .resolve(sharedDataRoot.relativize(normalized))
                    .toString()
                    .replace('\\', '/');
            }
        } catch (IllegalArgumentException ignored) {
            return normalized.toString();
        }
        return normalized.toString();
    }

    private Path resolveSharedDataRoot(Path repoRoot) {
        String configured = firstNonBlank(
            System.getenv("TERRAPEDIA_SHARED_DATA_ROOT"),
            System.getenv("TERRAPEDIA_SOURCE_DATA_DIR")
        );
        if (configured != null) {
            Path configuredPath = Path.of(configured);
            return (configuredPath.isAbsolute() ? configuredPath : repoRoot.resolve(configuredPath))
                .toAbsolutePath()
                .normalize();
        }
        Path primaryRoot = resolvePrimaryWorktreeRoot(repoRoot);
        return (primaryRoot == null ? repoRoot : primaryRoot)
            .resolve("data")
            .resolve("terraPedia")
            .toAbsolutePath()
            .normalize();
    }

    private Path resolvePrimaryWorktreeRoot(Path repoRoot) {
        Path gitFile = repoRoot.resolve(".git");
        if (!Files.isRegularFile(gitFile)) {
            return null;
        }
        try {
            String content = Files.readString(gitFile, StandardCharsets.UTF_8).trim();
            if (!content.regionMatches(true, 0, "gitdir:", 0, "gitdir:".length())) {
                return null;
            }
            Path gitDir = repoRoot.resolve(content.substring("gitdir:".length()).trim())
                .toAbsolutePath()
                .normalize();
            Path worktrees = gitDir.getParent();
            if (worktrees == null || worktrees.getFileName() == null
                || !"worktrees".equals(worktrees.getFileName().toString())) {
                return null;
            }
            Path commonGitDir = worktrees.getParent();
            Path primaryRoot = commonGitDir == null ? null : commonGitDir.getParent();
            return primaryRoot != null && Files.isDirectory(primaryRoot.resolve(".git"))
                ? primaryRoot
                : null;
        } catch (IOException | InvalidPathException ignored) {
            return null;
        }
    }

    private String readLastModifiedIso(Path path) {
        try {
            if (path == null) {
                return null;
            }
            FileTime fileTime = Files.getLastModifiedTime(path);
            return fileTime.toInstant().toString();
        } catch (IOException ignored) {
            return null;
        }
    }

    private long safeLastModifiedMillis(Path path) {
        try {
            if (path == null) {
                return Long.MIN_VALUE;
            }
            return Files.getLastModifiedTime(path).toMillis();
        } catch (IOException ignored) {
            return Long.MIN_VALUE;
        }
    }

    private Long safeSize(Path path) {
        try {
            if (path == null) {
                return null;
            }
            return Files.size(path);
        } catch (IOException ignored) {
            return null;
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

    private Double asNullableDouble(Object value) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        if (value == null || String.valueOf(value).isBlank()) {
            return null;
        }
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private Double clampPercent(Double value) {
        if (value == null) {
            return null;
        }
        return Math.max(0.0d, Math.min(100.0d, value));
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
        boolean readable,
        Map<String, Object> payload,
        String errorMessage
    ) {
    }
}

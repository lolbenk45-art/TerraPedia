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
    private static final Path WIKI_SYNC_PROGRESS_FILE = Path.of("data", "generated", "wiki-sync-progress.latest.json");
    private static final Path NPC_COVERAGE_REPORT = Path.of("data", "wiki-crawler", "report", "npc", "coverage-audit.latest.json");
    private static final Path REPORTS_DIR = Path.of("reports");
    private static final Path RELATION_REPORTS_DIR = Path.of("reports", "relation");
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
        overview.setRegisteredTasks(buildRegisteredTasks(repoRoot, overview.getLatestRun()));
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

        CrawlerMonitorOverviewDTO.MonitorRunDTO run = buildRun(repoRoot, outputPath, summaryPath);
        CrawlerMonitorOverviewDTO.MonitorRunDTO standaloneProgress = buildStandaloneProgressRun(repoRoot);
        if (shouldPreferStandaloneProgress(run, standaloneProgress)) {
            return standaloneProgress;
        }
        return run;
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

    private List<CrawlerMonitorOverviewDTO.RegisteredTaskDTO> buildRegisteredTasks(
        Path repoRoot,
        CrawlerMonitorOverviewDTO.MonitorRunDTO latestRun
    ) {
        ReadResult itemProgress = readJsonMap(repoRoot.resolve(WIKI_SYNC_PROGRESS_FILE).normalize());
        ReadResult npcCoverage = readJsonMap(repoRoot.resolve(NPC_COVERAGE_REPORT).normalize());

        List<CrawlerMonitorOverviewDTO.RegisteredTaskDTO> tasks = new ArrayList<>();
        tasks.add(buildWikiCoreRefreshTask(repoRoot, latestRun));
        tasks.add(buildItemPagesRefreshTask(repoRoot, itemProgress));
        tasks.add(buildStaticTask(
            "item-pages-retry-failures",
            "Item page retry queue",
            "fetch",
            "p0",
            "pending",
            "Retry failed item pages after the active shard finishes.",
            "fetch retry",
            WIKI_SYNC_PROGRESS_FILE.toString().replace('\\', '/'),
            null,
            "reports/crawler-monitor/*.err.log",
            null
        ));
        tasks.add(buildNpcCoverageTask(repoRoot, npcCoverage, "npc-coverage-boss", "Boss NPC coverage", "p0_boss", "p0"));
        tasks.add(buildNpcCoverageTask(repoRoot, npcCoverage, "npc-coverage-friendly", "Friendly NPC coverage", "p1_friendly", "p1"));
        tasks.add(buildNpcCoverageTask(repoRoot, npcCoverage, "npc-coverage-enemy", "Enemy NPC coverage", "p1_enemy", "p1"));
        tasks.add(buildReportBackedTask(
            repoRoot,
            "npc-loot-backfill",
            "NPC loot backfill restore",
            "backfill",
            "p0",
            findLatestReport(repoRoot, REPORTS_DIR, "normal-npc-loot-restore-apply-", ".json"),
            "reports/normal-npc-loot-restore-apply-*.json",
            "Validate restored normal NPC loot, then rerun relation health.",
            "restored loot evidence -> maint item sources"
        ));
        tasks.add(buildReportBackedTask(
            repoRoot,
            "boss-loot-backfill",
            "Boss loot backfill restore",
            "backfill",
            "p0",
            findLatestReport(repoRoot, REPORTS_DIR, "boss-loot-restore-apply-", ".json"),
            "reports/boss-loot-restore-apply-*.json",
            "Validate restored boss loot and treasure bag drops before relation sync.",
            "restored boss loot evidence -> maint item sources"
        ));
        tasks.add(buildStaticTask(
            "transform-standardize",
            "Crawler output standardize",
            "transform",
            "p1",
            "pending",
            "Convert crawler output into standardized JSON before maint sync.",
            "crawler JSON -> standardized JSON",
            "data/generated/wiki-sync-progress.latest.json",
            "data/standardized/*.standardized.json",
            "reports/source-dataset-landings-schema-*.json",
            null
        ));
        tasks.add(buildReportBackedTask(
            repoRoot,
            "landing-import",
            "Source dataset landing",
            "transform",
            "p1",
            findLatestReport(repoRoot, REPORTS_DIR, "source-dataset-landings-schema-", ".json"),
            "reports/source-dataset-landings-schema-*.json",
            "Import standardized datasets into the landing layer.",
            "standardized JSON -> landing tables"
        ));
        tasks.add(buildReportBackedTask(
            repoRoot,
            "maint-sync",
            "Landing to maint sync",
            "data",
            "p1",
            findLatestReport(repoRoot, REPORTS_DIR, "maint-sync-", ".json"),
            "reports/maint-sync-*.json",
            "Run maint sync after landing import is current.",
            "landing tables -> maint DB"
        ));
        tasks.add(buildReportBackedTask(
            repoRoot,
            "relation-sync",
            "Maint to relation sync",
            "data",
            "p1",
            findLatestReport(repoRoot, RELATION_REPORTS_DIR, "relation-audit-", ".json"),
            "reports/relation/relation-audit-*.json",
            "Run relation sync after maint candidates are current.",
            "maint DB -> relation DB"
        ));
        tasks.add(buildReportBackedTask(
            repoRoot,
            "projection-local-core",
            "Projection to local core",
            "data",
            "p1",
            findLatestReport(repoRoot, RELATION_REPORTS_DIR, "projection-to-local-core-sync-", ".json"),
            "reports/relation/projection-to-local-core-sync-*.json",
            "Refresh projection JSON after relation sync passes health checks.",
            "relation DB -> projection tables"
        ));
        tasks.add(buildReportBackedTask(
            repoRoot,
            "local-compat-sync",
            "Relation to local compat",
            "data",
            "p1",
            findLatestReport(repoRoot, RELATION_REPORTS_DIR, "relation-to-local-compat-sync-", ".json"),
            "reports/relation/relation-to-local-compat-sync-*.json",
            "Refresh standalone local compatibility tables.",
            "relation DB -> local compat tables"
        ));
        tasks.add(buildHealthTask(
            repoRoot,
            "relation-health",
            "Relation health checks",
            findLatestReport(repoRoot, RELATION_REPORTS_DIR, "relation-health", ".json"),
            "reports/relation/relation-health*.json",
            "Review blocking and warning checks before switching consumers."
        ));
        tasks.add(buildHealthTask(
            repoRoot,
            "replacement-readiness",
            "Replacement readiness",
            findLatestReport(repoRoot, RELATION_REPORTS_DIR, "replacement-readiness", ".json"),
            "reports/relation/replacement-readiness*.json",
            "Use readiness report before replacing local projections."
        ));
        return tasks;
    }

    private CrawlerMonitorOverviewDTO.RegisteredTaskDTO buildWikiCoreRefreshTask(
        Path repoRoot,
        CrawlerMonitorOverviewDTO.MonitorRunDTO latestRun
    ) {
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO task = baseTask("wiki-core-refresh", "Wiki core refresh", "fetch", "p0");
        CrawlerMonitorOverviewDTO.MonitorActionDTO action = findAction(latestRun, "wiki-core-refresh");
        task.setStatus(action == null ? "pending" : firstNonBlank(action.getStatus(), "pending"));
        task.setQueueState(action == null ? "backend refresh action" : firstNonBlank(action.getMessage(), action.getPhase()));
        task.setNextStep("Keep backend-refresh heartbeat current before dependent item/NPC fetches.");
        task.setDataStage("wiki API -> generated core JSON");
        task.setReportPath(latestRun == null ? null : firstNonBlank(latestRun.getPath(), latestRun.getSummaryPath()));
        task.setUpdatedAt(latestRun == null ? null : latestRun.getGeneratedAt());
        if (action != null) {
            copyTaskProgressFromAction(task, action);
        }
        return task;
    }

    private CrawlerMonitorOverviewDTO.RegisteredTaskDTO buildItemPagesRefreshTask(Path repoRoot, ReadResult progress) {
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO task = baseTask("item-pages-refresh", "Item page crawl shard", "fetch", "p0");
        task.setProgressPath(toDisplayPath(repoRoot, repoRoot.resolve(WIKI_SYNC_PROGRESS_FILE).normalize()));
        task.setInputPath("wiki item pages");
        task.setOutputPath("data/generated/wiki-item-pages*.json");
        task.setDataStage("wiki item pages -> crawler JSON");

        if (!progress.found()) {
            task.setStatus("missing");
            task.setQueueState("progress file missing");
            task.setNextStep("Start the item page crawler runner when the crawl slot is free.");
            return task;
        }
        if (!progress.readable()) {
            task.setStatus("blocked");
            task.setQueueState(progress.errorMessage());
            task.setNextStep("Repair or replace the unreadable progress JSON before trusting queue state.");
            return task;
        }

        Map<String, Object> payload = progress.payload();
        task.setStatus(firstNonBlank(asString(payload.get("status")), "pending"));
        task.setQueueState(firstNonBlank(asString(payload.get("message")), task.getStatus()));
        task.setNextStep("Monitor the active shard, then retry failures and run transform-standardize.");
        task.setUpdatedAt(firstNonBlank(asString(payload.get("lastHeartbeatAt")), asString(payload.get("generatedAt"))));
        copyTaskProgressFromPayload(task, payload);
        return task;
    }

    private CrawlerMonitorOverviewDTO.RegisteredTaskDTO buildNpcCoverageTask(
        Path repoRoot,
        ReadResult coverage,
        String id,
        String label,
        String priorityKey,
        String priority
    ) {
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO task = baseTask(id, label, "crawl", priority);
        task.setReportPath(toDisplayPath(repoRoot, repoRoot.resolve(NPC_COVERAGE_REPORT).normalize()));
        task.setInputPath("wiki NPC pages");
        task.setOutputPath("data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json");
        task.setDataStage("NPC page coverage -> standardized NPC source");
        task.setNextStep("Queue the next NPC coverage shard from this priority bucket.");

        if (!coverage.found()) {
            task.setStatus("missing");
            task.setQueueState("coverage report missing");
            return task;
        }
        if (!coverage.readable()) {
            task.setStatus("blocked");
            task.setQueueState(coverage.errorMessage());
            return task;
        }

        Map<String, Object> payload = coverage.payload();
        Map<String, Object> summary = asMap(payload.get("summary"));
        Long pending = firstLong(asMap(payload.get("priorities")), priorityKey);
        if (pending == null) {
            pending = firstLong(payload, priorityKey + "Targets", priorityKey + "Pending", "eligibleBatchTargets");
        }
        task.setCurrent(firstLong(summary, "alreadyCrawledTargets", "alreadyCrawled"));
        task.setTotal(firstLong(summary, "totalTargets", "total"));
        task.setPending(pending == null ? 0L : Math.max(0L, pending));
        task.setStatus(task.getPending() > 0 ? "queued" : "completed");
        task.setQueueState(formatNumberForTask(task.getPending()) + " target(s) queued");
        task.setUpdatedAt(readLastModifiedIso(repoRoot.resolve(NPC_COVERAGE_REPORT).normalize()));
        return task;
    }

    private CrawlerMonitorOverviewDTO.RegisteredTaskDTO buildReportBackedTask(
        Path repoRoot,
        String id,
        String label,
        String lane,
        String priority,
        Path reportPath,
        String fallbackReportPath,
        String nextStep,
        String dataStage
    ) {
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO task = baseTask(id, label, lane, priority);
        task.setReportPath(reportPath == null ? fallbackReportPath : toDisplayPath(repoRoot, reportPath));
        task.setNextStep(nextStep);
        task.setDataStage(dataStage);
        if (reportPath == null) {
            task.setStatus("pending");
            task.setQueueState("no report yet");
            return task;
        }

        ReadResult report = readJsonMap(reportPath);
        task.setUpdatedAt(readLastModifiedIso(reportPath));
        if (!report.readable()) {
            task.setStatus("blocked");
            task.setQueueState(report.errorMessage());
            return task;
        }
        task.setStatus(statusFromReportPayload(report.payload(), "completed"));
        task.setQueueState(firstNonBlank(asString(report.payload().get("message")), task.getStatus()));
        task.setFailed(firstLong(report.payload(), "failed", "failureCount", "failedCount"));
        return task;
    }

    private CrawlerMonitorOverviewDTO.RegisteredTaskDTO buildHealthTask(
        Path repoRoot,
        String id,
        String label,
        Path reportPath,
        String fallbackReportPath,
        String nextStep
    ) {
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO task = buildReportBackedTask(
            repoRoot,
            id,
            label,
            "validation",
            "p1",
            reportPath,
            fallbackReportPath,
            nextStep,
            "reports -> acceptance validation"
        );
        if (reportPath != null && "completed".equals(task.getStatus())) {
            ReadResult report = readJsonMap(reportPath);
            Map<String, Object> summary = asMap(report.payload().get("summary"));
            Long warningCount = firstLong(summary, "warningChecks", "warningCount", "warnings");
            if (warningCount == null) {
                warningCount = firstLong(report.payload(), "warningChecks", "warningCount", "warnings");
            }
            Long blockerCount = firstLong(summary, "blockingChecks", "blockingCount", "blockerCount", "blockedCount");
            if (blockerCount == null) {
                blockerCount = firstLong(report.payload(), "blockingChecks", "blockingCount", "blockerCount", "blockedCount");
            }
            Long blockedDomainCount = collectionSize(summary.get("blockedDomains"));
            if (blockedDomainCount == null) {
                blockedDomainCount = collectionSize(report.payload().get("blockedDomains"));
            }
            long warnings = warningCount == null ? 0L : warningCount;
            long blockers = Math.max(blockerCount == null ? 0L : blockerCount, blockedDomainCount == null ? 0L : blockedDomainCount);
            String summaryStatus = firstNonBlank(asString(summary.get("status")), asString(report.payload().get("status")));
            if (blockers > 0) {
                task.setStatus("blocked");
            } else if (warnings > 0 || isWarningStatus(summaryStatus)) {
                task.setStatus("warning");
            }
        }
        return task;
    }

    private CrawlerMonitorOverviewDTO.RegisteredTaskDTO buildStaticTask(
        String id,
        String label,
        String lane,
        String priority,
        String status,
        String nextStep,
        String dataStage,
        String inputPath,
        String outputPath,
        String reportPath,
        String progressPath
    ) {
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO task = baseTask(id, label, lane, priority);
        task.setStatus(status);
        task.setNextStep(nextStep);
        task.setDataStage(dataStage);
        task.setInputPath(inputPath);
        task.setOutputPath(outputPath);
        task.setReportPath(reportPath);
        task.setProgressPath(progressPath);
        task.setQueueState(status);
        return task;
    }

    private CrawlerMonitorOverviewDTO.RegisteredTaskDTO baseTask(String id, String label, String lane, String priority) {
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO task = new CrawlerMonitorOverviewDTO.RegisteredTaskDTO();
        task.setId(id);
        task.setLabel(label);
        task.setLane(lane);
        task.setPriority(priority);
        task.setStatus("pending");
        return task;
    }

    private CrawlerMonitorOverviewDTO.MonitorActionDTO findAction(CrawlerMonitorOverviewDTO.MonitorRunDTO latestRun, String id) {
        if (latestRun == null || latestRun.getActions() == null) {
            return null;
        }
        return latestRun.getActions().stream()
            .filter(action -> id.equals(action.getId()))
            .findFirst()
            .orElse(null);
    }

    private void copyTaskProgressFromAction(
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO task,
        CrawlerMonitorOverviewDTO.MonitorActionDTO action
    ) {
        task.setCurrent(action.getCurrent());
        task.setTotal(action.getTotal());
        task.setOverallCurrent(action.getOverallCurrent());
        task.setOverallTotal(action.getOverallTotal());
        task.setPercent(action.getPercent());
        task.setPending(computePending(action.getOverallCurrent(), action.getOverallTotal(), action.getCurrent(), action.getTotal()));
    }

    private void copyTaskProgressFromPayload(CrawlerMonitorOverviewDTO.RegisteredTaskDTO task, Map<String, Object> payload) {
        Long current = asNullableLong(payload.get("current"));
        Long total = asNullableLong(payload.get("total"));
        Long overallCurrent = asNullableLong(payload.get("overallCurrent"));
        Long overallTotal = asNullableLong(payload.get("overallTotal"));
        task.setCurrent(current);
        task.setTotal(total);
        task.setOverallCurrent(overallCurrent);
        task.setOverallTotal(overallTotal);
        task.setPercent(clampPercent(asNullableDouble(payload.get("percent"))));
        task.setPending(computePending(overallCurrent, overallTotal, current, total));
        task.setFailed(firstLong(payload, "failed", "failedCount", "failureCount"));
    }

    private Long computePending(Long overallCurrent, Long overallTotal, Long current, Long total) {
        if (overallCurrent != null && overallTotal != null) {
            return Math.max(0L, overallTotal - overallCurrent);
        }
        if (current != null && total != null) {
            return Math.max(0L, total - current);
        }
        return null;
    }

    private String latestRunStatus(CrawlerMonitorOverviewDTO.MonitorRunDTO run) {
        if (run == null || !run.isFound()) {
            return "missing";
        }
        if (run.getFailedActions() > 0) {
            return "failed";
        }
        if (run.getRunningActions() > 0) {
            return "running";
        }
        if (run.getPendingActions() > 0) {
            return "pending";
        }
        return "completed";
    }

    private String statusFromReportPayload(Map<String, Object> payload, String fallback) {
        String status = asString(payload.get("status"));
        if (status != null && !status.isBlank()) {
            return status.toLowerCase(Locale.ROOT);
        }
        Object apply = payload.get("apply");
        if (Boolean.TRUE.equals(apply)) {
            return "completed";
        }
        if (Boolean.FALSE.equals(apply)) {
            return "pending";
        }
        return fallback;
    }

    private Path findLatestReport(Path repoRoot, Path relativeDir, String prefix, String suffix) {
        Path dir = repoRoot.resolve(relativeDir).normalize();
        if (!Files.isDirectory(dir)) {
            return null;
        }
        try (Stream<Path> stream = Files.list(dir)) {
            return stream
                .filter(Files::isRegularFile)
                .filter(path -> {
                    String fileName = path.getFileName().toString();
                    return fileName.startsWith(prefix) && fileName.endsWith(suffix);
                })
                .max(Comparator.comparingLong(this::safeLastModifiedMillis))
                .orElse(null);
        } catch (IOException ignored) {
            return null;
        }
    }

    private Long firstLong(Map<String, Object> payload, String... keys) {
        for (String key : keys) {
            Long value = asNullableLong(payload.get(key));
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private Long collectionSize(Object value) {
        if (value instanceof List<?> list) {
            return (long) list.size();
        }
        if (value instanceof Map<?, ?> map) {
            return (long) map.size();
        }
        return null;
    }

    private boolean isWarningStatus(String status) {
        String normalized = (status == null ? "" : status).toLowerCase(Locale.ROOT);
        return "warning".equals(normalized) || "warn".equals(normalized);
    }

    private String formatNumberForTask(Long value) {
        return value == null ? "0" : String.format(Locale.ROOT, "%d", value);
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
            action.setChildStatusPath(normalizePayloadPath(repoRoot, map.get("childStatusPath")));
            action.setUpdatedAt(asString(map.get("updatedAt")));
            Map<String, Object> childStatus = readChildStatusPayload(repoRoot, action.getChildStatusPath());
            applyProgressFields(repoRoot, action, map);
            applyProgressFields(repoRoot, action, childStatus);
            actions.add(action);
        }
        return actions;
    }

    private boolean shouldPreferStandaloneProgress(
        CrawlerMonitorOverviewDTO.MonitorRunDTO run,
        CrawlerMonitorOverviewDTO.MonitorRunDTO standaloneProgress
    ) {
        if (standaloneProgress == null || !standaloneProgress.isFound() || !standaloneProgress.isReadable()) {
            return false;
        }
        if (run == null || !run.isFound()) {
            return true;
        }
        Instant standaloneAt = parseInstant(standaloneProgress.getGeneratedAt());
        Instant runAt = parseInstant(run.getGeneratedAt());
        return standaloneAt != null && (runAt == null || standaloneAt.isAfter(runAt));
    }

    private CrawlerMonitorOverviewDTO.MonitorRunDTO buildStandaloneProgressRun(Path repoRoot) {
        Path progressPath = repoRoot.resolve(WIKI_SYNC_PROGRESS_FILE).normalize();
        ReadResult result = readJsonMap(progressPath);
        CrawlerMonitorOverviewDTO.MonitorRunDTO run = new CrawlerMonitorOverviewDTO.MonitorRunDTO();
        run.setFound(result.found());
        run.setReadable(result.readable());
        run.setPath(toDisplayPath(repoRoot, progressPath));
        run.setSummaryPath(toDisplayPath(repoRoot, progressPath));
        run.setGeneratedAt(asString(result.payload().get("generatedAt")));
        run.setOutputPath(toDisplayPath(repoRoot, progressPath));
        run.setLastActionId(firstNonBlank(asString(result.payload().get("actionId")), "wiki-sync"));
        run.setTotalActions(result.found() ? 1L : 0L);
        String status = asString(result.payload().get("status"));
        run.setCompletedActions("completed".equalsIgnoreCase(status) ? 1L : 0L);
        run.setFailedActions("failed".equalsIgnoreCase(status) ? 1L : 0L);
        run.setRunningActions("running".equalsIgnoreCase(status) ? 1L : 0L);
        run.setPendingActions("pending".equalsIgnoreCase(status) ? 1L : 0L);
        run.setErrorMessage(result.errorMessage());

        if (result.readable()) {
            CrawlerMonitorOverviewDTO.MonitorActionDTO action = new CrawlerMonitorOverviewDTO.MonitorActionDTO();
            action.setId(run.getLastActionId());
            action.setRunner("external");
            action.setStatus(status);
            action.setChildStatusPath(toDisplayPath(repoRoot, progressPath));
            action.setUpdatedAt(asString(result.payload().get("generatedAt")));
            applyProgressFields(repoRoot, action, result.payload());
            run.setActions(List.of(action));
        }
        return run;
    }

    private Map<String, Object> readChildStatusPayload(Path repoRoot, String childStatusPath) {
        Path resolved = resolvePayloadPathInsideRepo(repoRoot, childStatusPath);
        if (resolved == null) {
            return Map.of();
        }
        ReadResult result = readJsonMap(resolved);
        return result.readable() ? result.payload() : Map.of();
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
        String phase = asString(payload.get("phase"));
        if (phase != null && !phase.isBlank()) {
            action.setPhase(phase);
        }
        String message = asString(payload.get("message"));
        if (message != null && !message.isBlank()) {
            action.setMessage(message);
        }
        String queue = asString(payload.get("queue"));
        if (queue != null && !queue.isBlank()) {
            action.setQueue(queue);
        }
        String dataStage = asString(payload.get("dataStage"));
        if (dataStage != null && !dataStage.isBlank()) {
            action.setDataStage(dataStage);
        }
        String nextStep = asString(payload.get("nextStep"));
        if (nextStep != null && !nextStep.isBlank()) {
            action.setNextStep(nextStep);
        }
        String startedAt = asString(payload.get("startedAt"));
        if (startedAt != null && !startedAt.isBlank()) {
            action.setStartedAt(startedAt);
        }
        String lastHeartbeatAt = firstNonBlank(asString(payload.get("lastHeartbeatAt")), asString(payload.get("generatedAt")));
        if (lastHeartbeatAt != null && !lastHeartbeatAt.isBlank()) {
            action.setLastHeartbeatAt(lastHeartbeatAt);
        }
        String childStatusPath = normalizePayloadPath(repoRoot, payload.get("childStatusPath"));
        if (childStatusPath != null && !childStatusPath.isBlank()) {
            action.setChildStatusPath(childStatusPath);
        }
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

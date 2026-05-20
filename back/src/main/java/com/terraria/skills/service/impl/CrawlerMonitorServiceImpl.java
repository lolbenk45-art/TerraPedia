package com.terraria.skills.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import com.terraria.skills.dto.CrawlerMonitorReportDetailDTO;
import com.terraria.skills.dto.CrawlerMonitorTestStateDTO;
import com.terraria.skills.service.CrawlerMonitorService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
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
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
public class CrawlerMonitorServiceImpl implements CrawlerMonitorService {

    private static final TypeReference<LinkedHashMap<String, Object>> MAP_TYPE = new TypeReference<>() {};
    private static final Path REFRESH_DIR = Path.of("reports", "backend-refresh");
    private static final Path DAEMON_HEARTBEAT = REFRESH_DIR.resolve("backend-refresh-daemon.heartbeat.json");
    private static final Path SCHEDULER_STATE = REFRESH_DIR.resolve("backend-refresh-scheduler.latest.json");
    private static final Path LOCK_FILE = REFRESH_DIR.resolve("backend-refresh.lock.json");
    private static final Path TEST_STATE_FILE = REFRESH_DIR.resolve("manual-monitor-test.json");
    private static final Path ALERT_CONFIG_FILE = REFRESH_DIR.resolve("alert-config.json");
    private static final Path WIKI_SYNC_PROGRESS_FILE = Path.of("data", "generated", "wiki-sync-progress.latest.json");
    private static final Path BUFF_FETCH_PROGRESS_FILE = Path.of("data", "generated", "fetch-wiki-buffs-progress.latest.json");
    private static final Path NPC_COVERAGE_REPORT = Path.of("data", "wiki-crawler", "report", "npc", "coverage-audit.latest.json");
    private static final Path RAW_ITEM_PAGES_DIR = Path.of("raw", "wiki", "item-pages");
    private static final Path STANDARDIZED_DIR = Path.of("standardized");
    private static final Path STANDARDIZED_VIEW_ITEM_PAGES_DIR = Path.of("standardized-view", "item_pages");
    private static final Path REPORTS_DIR = Path.of("reports");
    private static final Path RELATION_REPORTS_DIR = Path.of("reports", "relation");
    private static final Path AUDIT_REPORTS_DIR = Path.of("reports", "audit");
    private static final long REFRESH_STALE_THRESHOLD_MS = Duration.ofHours(24).toMillis();
    private static final Duration PROGRESS_STALE_THRESHOLD = Duration.ofMinutes(10);
    private static final Duration DEFAULT_HEARTBEAT_STALE_THRESHOLD = Duration.ofMinutes(30);
    private static final List<String> REDIS_HEARTBEAT_ENTITIES = List.of("items", "buffs");
    private static final String REDIS_BACKEND_DAEMON_KEY = "terrapedia:crawler:backend-refresh:daemon";
    private static final String REDIS_BACKEND_SCHEDULER_KEY = "terrapedia:crawler:backend-refresh:scheduler";
    private static final String REDIS_BACKEND_LOCK_KEY = "terrapedia:crawler:backend-refresh:lock";
    private static final String REDIS_ITEM_PROGRESS_KEY = "terrapedia:crawler:item-pages-refresh:progress";
    private static final String REDIS_BUFF_PROGRESS_KEY = "terrapedia:crawler:buff-page-immunity-refresh:progress";
    private static final String REDIS_BACKEND_ACTION_PROGRESS_PREFIX = "terrapedia:crawler:backend-refresh:action:";
    private static final String REDIS_BACKEND_ACTION_PROGRESS_SUFFIX = ":progress";

    private final ObjectMapper objectMapper;
    private final Path repoRootOverride;
    private final Clock clock;
    private final StringRedisTemplate redisTemplate;
    private final CrawlerStateRedisRepository redisRepository;
    private final CrawlerReportArchiver reportArchiver;

    @Autowired
    public CrawlerMonitorServiceImpl(ObjectMapper objectMapper, @Autowired(required = false) StringRedisTemplate redisTemplate) {
        this(objectMapper, null, Clock.systemUTC(), redisTemplate);
    }

    CrawlerMonitorServiceImpl(ObjectMapper objectMapper, Path repoRootOverride) {
        this(objectMapper, repoRootOverride, Clock.systemUTC(), null);
    }

    CrawlerMonitorServiceImpl(ObjectMapper objectMapper, Path repoRootOverride, Clock clock) {
        this(objectMapper, repoRootOverride, clock, null);
    }

    CrawlerMonitorServiceImpl(ObjectMapper objectMapper, Path repoRootOverride, Clock clock, StringRedisTemplate redisTemplate) {
        this.objectMapper = objectMapper;
        this.repoRootOverride = repoRootOverride == null ? null : repoRootOverride.toAbsolutePath().normalize();
        this.clock = clock == null ? Clock.systemUTC() : clock;
        this.redisTemplate = redisTemplate;
        this.redisRepository = redisTemplate == null ? null : new CrawlerStateRedisRepository(objectMapper, redisTemplate);
        this.reportArchiver = new CrawlerReportArchiver(objectMapper);
    }

    @Override
    public CrawlerMonitorOverviewDTO getOverview() {
        Path repoRoot = resolveRepoRoot();
        CrawlerMonitorOverviewDTO.MonitorFileDTO daemon = readRuntimeMonitorState(repoRoot, REDIS_BACKEND_DAEMON_KEY, DAEMON_HEARTBEAT, false);
        CrawlerMonitorOverviewDTO.MonitorFileDTO scheduler = readRuntimeMonitorState(repoRoot, REDIS_BACKEND_SCHEDULER_KEY, SCHEDULER_STATE, false);
        CrawlerMonitorOverviewDTO.MonitorFileDTO lock = readRuntimeMonitorState(repoRoot, REDIS_BACKEND_LOCK_KEY, LOCK_FILE, false);
        CrawlerMonitorOverviewDTO.MonitorRunDTO latestRun = buildLatestRun(repoRoot, scheduler.getPayload());
        CrawlerMonitorOverviewDTO overview = new CrawlerOverviewBuilder()
            .generatedAt(Instant.now())
            .repoRoot(repoRoot)
            .daemon(daemon)
            .scheduler(scheduler)
            .lock(lock)
            .latestRun(latestRun)
            .history(reportArchiver.loadHistory(repoRoot))
            .recentReports(reportArchiver.loadRecentReports(repoRoot))
            .architectureLayers(buildArchitectureLayers(repoRoot))
            .registeredTasks(buildRegisteredTasks(repoRoot, latestRun))
            .imageNormalization(buildImageNormalizationSummary(repoRoot))
            .build();
        applyRedisHeartbeatState(repoRoot, overview);
        applyRefreshStaleState(repoRoot, overview);
        return overview;
    }

    @Override
    public CrawlerMonitorReportDetailDTO getReportDetail(String path) {
        return reportArchiver.getReportDetail(resolveRepoRoot(), path);
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

    private CrawlerMonitorOverviewDTO.MonitorRunDTO applyRedisActionProgress(
        Path repoRoot,
        CrawlerMonitorOverviewDTO.MonitorRunDTO run
    ) {
        if (run == null || run.getActions() == null || run.getActions().isEmpty()) {
            return run;
        }
        for (CrawlerMonitorOverviewDTO.MonitorActionDTO action : run.getActions()) {
            ReadResult redisProgress = readBackendActionProgress(action.getId());
            if (redisProgress.readable()) {
                applyProgressFields(repoRoot, action, redisProgress.payload());
            } else if (redisRepository == null) {
                applyProgressFields(repoRoot, action, readChildStatusPayload(repoRoot, action.getChildStatusPath()));
            }
        }
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

    private CrawlerMonitorOverviewDTO.MonitorFileDTO readRuntimeMonitorState(
        Path repoRoot,
        String redisKey,
        Path legacyRelativePath,
        boolean redisRequired
    ) {
        if (redisRepository == null) {
            return readMonitorFile(repoRoot, legacyRelativePath);
        }
        ReadResult redisState = readRedisState(redisKey, redisRequired);
        return monitorFileFromReadResult(redisState);
    }

    private CrawlerMonitorOverviewDTO.MonitorFileDTO monitorFileFromReadResult(ReadResult result) {
        CrawlerMonitorOverviewDTO.MonitorFileDTO dto = new CrawlerMonitorOverviewDTO.MonitorFileDTO();
        dto.setPath(result.displayPath());
        dto.setFound(result.found());
        dto.setReadable(result.readable());
        dto.setPayload(result.payload());
        dto.setErrorMessage(result.errorMessage());
        dto.setUpdatedAt(firstNonBlank(
            asString(result.payload().get("lastHeartbeatAt")),
            asString(result.payload().get("generatedAt"))
        ));
        return dto;
    }

    private CrawlerMonitorOverviewDTO.MonitorRunDTO buildLatestRun(Path repoRoot, Map<String, Object> schedulerPayload) {
        return applyRedisActionProgress(repoRoot, reportArchiver.buildLatestRun(repoRoot, schedulerPayload));
    }

    private List<CrawlerMonitorOverviewDTO.ArchitectureLayerDTO> buildArchitectureLayers(Path repoRoot) {
        Path sharedDataRoot = resolveSharedDataRoot(repoRoot);
        Path standardizedRoot = resolveStandardizedRoot(repoRoot, sharedDataRoot);
        Path standardizedViewRoot = standardizedRoot.getParent() == null
            ? sharedDataRoot.resolve("standardized-view").normalize()
            : standardizedRoot.getParent().resolve("standardized-view").normalize();

        return List.of(
            buildArchitectureLayer(
                "raw-source",
                "Raw / Source Crawl",
                List.of(
                    buildGlobFileStatus(
                        repoRoot,
                        "Item page raw latest files",
                        sharedDataRoot.resolve(RAW_ITEM_PAGES_DIR).normalize(),
                        "*.latest.json",
                        false
                    ),
                    buildJsonFileStatus(
                        repoRoot,
                        "Standalone item crawl progress",
                        repoRoot.resolve(WIKI_SYNC_PROGRESS_FILE).normalize(),
                        payload -> firstLong(payload, "overallCurrent", "current", "total")
                    ),
                    buildGlobFileStatus(
                        repoRoot,
                        "Crawler monitor artifacts",
                        repoRoot.resolve("reports").resolve("crawler-monitor").normalize(),
                        "*",
                        false
                    )
                )
            ),
            buildArchitectureLayer(
                "standardized-transform",
                "Standardized / Transform",
                List.of(
                    buildJsonFileStatus(
                        repoRoot,
                        "Shared standardized manifest",
                        standardizedRoot.resolve("_manifest.standardized.json").normalize(),
                        payload -> manifestDatasetCount(payload, "item_pages")
                    ),
                    buildJsonFileStatus(
                        repoRoot,
                        "Shared item pages standardized",
                        standardizedRoot.resolve("item_pages.standardized.json").normalize(),
                        this::datasetRecordCount
                    ),
                    buildJsonFileStatus(
                        repoRoot,
                        "Shared item page view meta",
                        standardizedViewRoot.resolve(STANDARDIZED_VIEW_ITEM_PAGES_DIR.getFileName()).resolve("_meta.json").normalize(),
                        payload -> firstLong(payload, "totalRecords", "partCount", "totalParts", "fileCount", "count")
                    ),
                    buildGlobFileStatus(
                        repoRoot,
                        "Shared item page view parts",
                        standardizedViewRoot.resolve(STANDARDIZED_VIEW_ITEM_PAGES_DIR.getFileName()).normalize(),
                        "part-*.json",
                        false
                    )
                )
            ),
            buildArchitectureLayer(
                "sync-report",
                "Sync / Report Evidence",
                List.of(
                    buildGlobFileStatus(repoRoot, "Source landing schema reports", repoRoot.resolve(REPORTS_DIR).normalize(), "source-dataset-landings-schema-*.json", true),
                    buildGlobFileStatus(repoRoot, "Maint sync reports", repoRoot.resolve(REPORTS_DIR).normalize(), "maint-sync-*.json", true),
                    buildGlobFileStatus(repoRoot, "Relation audit reports", repoRoot.resolve(RELATION_REPORTS_DIR).normalize(), "relation-audit-*.json", true),
                    buildGlobFileStatus(repoRoot, "Projection core sync reports", repoRoot.resolve(RELATION_REPORTS_DIR).normalize(), "projection-to-local-core-sync-*.json", true),
                    buildGlobFileStatus(repoRoot, "Local compat sync reports", repoRoot.resolve(RELATION_REPORTS_DIR).normalize(), "relation-to-local-compat-sync-*.json", true),
                    buildGlobFileStatus(repoRoot, "Relation health reports", repoRoot.resolve(RELATION_REPORTS_DIR).normalize(), "relation-health*.json", true)
                )
            )
        );
    }

    private CrawlerMonitorOverviewDTO.ArchitectureLayerDTO buildArchitectureLayer(
        String id,
        String label,
        List<CrawlerMonitorOverviewDTO.ArchitectureFileDTO> files
    ) {
        long fileCount = files.size();
        long readableCount = files.stream().filter(CrawlerMonitorOverviewDTO.ArchitectureFileDTO::isReadable).count();
        long missingCount = files.stream().filter(file -> !file.isFound()).count();
        long errorCount = files.stream().filter(file -> file.isFound() && !file.isReadable()).count();

        CrawlerMonitorOverviewDTO.ArchitectureLayerDTO layer = new CrawlerMonitorOverviewDTO.ArchitectureLayerDTO();
        layer.setId(id);
        layer.setLabel(label);
        layer.setFiles(files);
        layer.setFileCount(fileCount);
        layer.setReadableCount(readableCount);
        layer.setMissingCount(missingCount);
        layer.setErrorCount(errorCount);
        layer.setStatus(errorCount > 0 ? "blocked" : missingCount > 0 ? "warning" : "success");
        layer.setUpdatedAt(latestFileUpdatedAt(files));
        layer.setSummary(formatLayerSummary(readableCount, fileCount, missingCount, errorCount));
        return layer;
    }

    private CrawlerMonitorOverviewDTO.ArchitectureFileDTO buildJsonFileStatus(
        Path repoRoot,
        String label,
        Path path,
        Function<Map<String, Object>, Long> countResolver
    ) {
        CrawlerMonitorOverviewDTO.ArchitectureFileDTO dto = new CrawlerMonitorOverviewDTO.ArchitectureFileDTO();
        dto.setLabel(label);
        dto.setPath(toDisplayPath(repoRoot, path));

        ReadResult result = readJsonMap(path);
        dto.setFound(result.found());
        dto.setReadable(result.readable());
        dto.setUpdatedAt(readLastModifiedIso(path));
        dto.setSizeBytes(safeSize(path));
        dto.setErrorMessage(result.errorMessage());
        if (result.readable()) {
            dto.setCount(countResolver == null ? null : countResolver.apply(result.payload()));
        }
        return dto;
    }

    private CrawlerMonitorOverviewDTO.ArchitectureFileDTO buildGlobFileStatus(
        Path repoRoot,
        String label,
        Path dir,
        String glob,
        boolean validateLatestJson
    ) {
        List<Path> files = listMatchingFiles(dir, glob);
        Path latest = files.stream()
            .max(Comparator.comparingLong(this::safeLastModifiedMillis))
            .orElse(null);

        CrawlerMonitorOverviewDTO.ArchitectureFileDTO dto = new CrawlerMonitorOverviewDTO.ArchitectureFileDTO();
        dto.setLabel(label);
        dto.setPath(toDisplayPattern(repoRoot, dir, glob));
        dto.setLatestPath(latest == null ? null : toDisplayPath(repoRoot, latest));
        dto.setFound(!files.isEmpty());
        dto.setReadable(!files.isEmpty());
        dto.setCount((long) files.size());
        dto.setUpdatedAt(readLastModifiedIso(latest));
        dto.setSizeBytes(safeSize(latest));

        if (latest != null && validateLatestJson) {
            ReadResult result = readJsonMap(latest);
            dto.setReadable(result.readable());
            dto.setErrorMessage(result.errorMessage());
        }
        return dto;
    }

    private List<Path> listMatchingFiles(Path dir, String glob) {
        if (!Files.isDirectory(dir)) {
            return List.of();
        }
        var matcher = dir.getFileSystem().getPathMatcher("glob:" + glob);
        try (Stream<Path> stream = Files.list(dir)) {
            return stream
                .filter(Files::isRegularFile)
                .filter(path -> matcher.matches(path.getFileName()))
                .sorted()
                .toList();
        } catch (IOException ignored) {
            return List.of();
        }
    }

    private CrawlerMonitorOverviewDTO.ImageNormalizationSummaryDTO buildImageNormalizationSummary(Path repoRoot) {
        CrawlerMonitorOverviewDTO.ImageNormalizationSummaryDTO summary = new CrawlerMonitorOverviewDTO.ImageNormalizationSummaryDTO();
        summary.setLegacyExemptionCount(0L);

        Path latestLineageReport = findLatestReport(repoRoot, AUDIT_REPORTS_DIR, "image-source-lineage-", ".json");
        if (latestLineageReport == null) {
            return summary;
        }

        summary.setLatestImageLineageReport(toDisplayPath(repoRoot, latestLineageReport));
        ReadResult result = readJsonMap(latestLineageReport);
        if (!result.readable()) {
            return summary;
        }

        Map<String, Object> payload = result.payload();
        summary.setNpcWrongPrefixCount(wrongPrefixCount(payload, "npcs"));
        summary.setProjectileWrongPrefixCount(wrongPrefixCount(payload, "projectiles"));
        summary.setNpcWikiOnlyCount(wikiOnlyCount(payload, "npcs"));
        summary.setProjectileWikiOnlyCount(wikiOnlyCount(payload, "projectiles"));
        summary.setLastCanonicalSyncAt(findLastCanonicalSyncAt(repoRoot));
        return summary;
    }

    private Long wrongPrefixCount(Map<String, Object> payload, String entityType) {
        Map<String, Object> entity = nestedMap(payload, "entities", entityType);
        Map<String, Object> relation = nestedMap(entity, "lineage", "relation");
        Long relationCount = asNullableLong(relation.get("rowsWithWrongManagedPrefix"));
        if (relationCount != null) {
            return relationCount;
        }
        Map<String, Object> projection = nestedMap(entity, "lineage", "projection");
        Long projectionCount = asNullableLong(projection.get("rowsWithWrongManagedPrefix"));
        return projectionCount == null ? 0L : projectionCount;
    }

    private Long wikiOnlyCount(Map<String, Object> payload, String entityType) {
        Map<String, Object> entity = nestedMap(payload, "entities", entityType);
        Map<String, Object> projection = nestedMap(entity, "lineage", "projection");
        Long rowsWithImage = asNullableLong(projection.get("rowsWithImage"));
        Long rowsWithManagedImage = asNullableLong(projection.get("rowsWithManagedImage"));
        Long wrongPrefix = asNullableLong(projection.get("rowsWithWrongManagedPrefix"));
        if (rowsWithImage == null || rowsWithManagedImage == null) {
            return 0L;
        }
        long delta = rowsWithImage - rowsWithManagedImage - (wrongPrefix == null ? 0L : wrongPrefix);
        return Math.max(0L, delta);
    }

    private String findLastCanonicalSyncAt(Path repoRoot) {
        Path reportsDir = repoRoot.resolve(REPORTS_DIR).normalize();
        if (!Files.isDirectory(reportsDir)) {
            return null;
        }
        try (Stream<Path> stream = Files.list(reportsDir)) {
            return stream
                .filter(Files::isRegularFile)
                .filter(path -> {
                    String fileName = path.getFileName().toString();
                    return fileName.startsWith("workflow-image-sync-") && fileName.endsWith(".json");
                })
                .sorted(Comparator.comparingLong(this::safeLastModifiedMillis).reversed())
                .map(this::readJsonMap)
                .filter(ReadResult::readable)
                .map(ReadResult::payload)
                .filter(payload -> Boolean.TRUE.equals(payload.get("apply")))
                .filter(payload -> {
                    List<String> scopes = toStringList(payload.get("scopes"));
                    return scopes.contains("npcs") && scopes.contains("projectiles");
                })
                .map(payload -> asString(payload.get("generatedAt")))
                .filter(value -> value != null && !value.isBlank())
                .findFirst()
                .orElse(null);
        } catch (IOException ignored) {
            return null;
        }
    }

    private Map<String, Object> nestedMap(Map<String, Object> payload, String... keys) {
        Map<String, Object> current = payload == null ? Map.of() : payload;
        for (String key : keys) {
            current = asMap(current.get(key));
            if (current.isEmpty()) {
                return Map.of();
            }
        }
        return current;
    }

    private Long manifestDatasetCount(Map<String, Object> payload, String entity) {
        Object datasets = payload.get("datasets");
        if (!(datasets instanceof List<?> rows)) {
            return firstLong(payload, "totalRecords", "recordCount", "count");
        }
        for (Object row : rows) {
            Map<String, Object> dataset = asMap(row);
            String datasetName = firstNonBlank(
                asString(dataset.get("entity")),
                firstNonBlank(asString(dataset.get("name")), asString(dataset.get("dataset")))
            );
            if (entity.equals(datasetName)) {
                return firstLong(dataset, "totalRecords", "recordCount", "count");
            }
        }
        return null;
    }

    private Long datasetRecordCount(Map<String, Object> payload) {
        Long explicit = firstLong(payload, "totalRecords", "recordCount", "count");
        return explicit == null ? collectionSize(payload.get("records")) : explicit;
    }

    private String latestFileUpdatedAt(List<CrawlerMonitorOverviewDTO.ArchitectureFileDTO> files) {
        return files.stream()
            .map(file -> parseInstant(file.getUpdatedAt()))
            .filter(instant -> instant != null)
            .max(Comparator.naturalOrder())
            .map(Instant::toString)
            .orElse(null);
    }

    private String formatLayerSummary(long readableCount, long fileCount, long missingCount, long errorCount) {
        StringBuilder builder = new StringBuilder();
        builder.append(readableCount).append('/').append(fileCount).append(" readable");
        if (missingCount > 0) {
            builder.append(", ").append(missingCount).append(" missing");
        }
        if (errorCount > 0) {
            builder.append(", ").append(errorCount).append(" error");
        }
        return builder.toString();
    }

    private Path resolveSharedDataRoot(Path repoRoot) {
        String configured = System.getenv("TERRAPEDIA_SOURCE_DATA_DIR");
        if (configured != null && !configured.isBlank()) {
            return resolveConfiguredPath(repoRoot, configured);
        }
        Path workspaceRoot = deriveWorkspaceRoot(repoRoot);
        return (workspaceRoot == null ? repoRoot.resolve("data").resolve("terraPedia") : workspaceRoot.resolve("data").resolve("terraPedia"))
            .toAbsolutePath()
            .normalize();
    }

    private Path deriveWorkspaceRoot(Path repoRoot) {
        Path normalizedRoot = repoRoot == null ? null : repoRoot.toAbsolutePath().normalize();
        if (normalizedRoot == null) {
            return null;
        }

        Path parent = normalizedRoot.getParent();
        if (parent != null && ".worktrees".equals(parent.getFileName() == null ? null : parent.getFileName().toString())) {
            Path workspaceRoot = parent.getParent();
            return workspaceRoot == null ? normalizedRoot : workspaceRoot;
        }
        return parent;
    }

    private Path resolveStandardizedRoot(Path repoRoot, Path sharedDataRoot) {
        String configured = System.getenv("TERRAPEDIA_STANDARDIZED_OUTPUT_DIR");
        if (configured != null && !configured.isBlank()) {
            return resolveConfiguredPath(repoRoot, configured);
        }
        return sharedDataRoot.resolve(STANDARDIZED_DIR).toAbsolutePath().normalize();
    }

    private Path resolveConfiguredPath(Path repoRoot, String rawPath) {
        Path path = Path.of(rawPath);
        return (path.isAbsolute() ? path : repoRoot.resolve(path)).toAbsolutePath().normalize();
    }

    private String toDisplayPattern(Path repoRoot, Path dir, String glob) {
        String displayDir = toDisplayPath(repoRoot, dir);
        if (displayDir == null || displayDir.isBlank()) {
            return glob;
        }
        return displayDir.replace('\\', '/') + "/" + glob;
    }

    private ReadResult readProgressWithSharedFallback(Path repoRoot, Path relativePath) {
        Path primary = repoRoot.resolve(relativePath).normalize();
        ReadResult primaryResult = readJsonMap(primary);
        Path sharedFallback = resolveSharedDataRoot(repoRoot).resolve("generated").resolve(relativePath.getFileName()).normalize();
        if (primary.equals(sharedFallback)) {
            return primaryResult;
        }
        ReadResult sharedResult = readJsonMap(sharedFallback);
        return chooseProgressResult(primaryResult, sharedResult);
    }

    private ReadResult readProgressWithRedisFallback(Path repoRoot, String redisKey, Path relativePath) {
        if (redisRepository == null) {
            return readJsonMap(repoRoot.resolve(relativePath).normalize());
        }
        ReadResult redisState = readRedisState(redisKey, false);
        return redisState;
    }

    private ReadResult readProgressWithRedisAndSharedFallback(Path repoRoot, String redisKey, Path relativePath) {
        if (redisRepository == null) {
            return readProgressWithSharedFallback(repoRoot, relativePath);
        }
        ReadResult redisState = readRedisState(redisKey, false);
        return redisState;
    }

    private ReadResult chooseProgressResult(ReadResult primary, ReadResult shared) {
        if (primary.readable() && !shared.readable()) {
            return primary;
        }
        if (shared.readable() && !primary.readable()) {
            return shared;
        }
        if (primary.readable() && shared.readable()) {
            Instant primaryAt = progressEvidenceInstant(primary);
            Instant sharedAt = progressEvidenceInstant(shared);
            if (sharedAt != null && (primaryAt == null || sharedAt.isAfter(primaryAt))) {
                return shared;
            }
            return primary;
        }
        if (primary.found()) {
            return primary;
        }
        return shared.found() ? shared : primary;
    }

    private Instant progressEvidenceInstant(ReadResult result) {
        if (result.readable()) {
            Instant payloadInstant = progressPayloadInstant(result.payload());
            if (payloadInstant != null) {
                return payloadInstant;
            }
        }
        return readLastModifiedInstant(result.path());
    }

    private Instant progressPayloadInstant(Map<String, Object> payload) {
        Instant heartbeat = parseInstant(asString(payload.get("lastHeartbeatAt")));
        if (heartbeat != null) {
            return heartbeat;
        }
        return parseInstant(asString(payload.get("generatedAt")));
    }

    private List<CrawlerMonitorOverviewDTO.RegisteredTaskDTO> buildRegisteredTasks(
        Path repoRoot,
        CrawlerMonitorOverviewDTO.MonitorRunDTO latestRun
    ) {
        ReadResult itemProgress = readProgressWithRedisFallback(repoRoot, REDIS_ITEM_PROGRESS_KEY, WIKI_SYNC_PROGRESS_FILE);
        ReadResult buffFetchProgress = readProgressWithRedisAndSharedFallback(repoRoot, REDIS_BUFF_PROGRESS_KEY, BUFF_FETCH_PROGRESS_FILE);
        ReadResult npcCoverage = readJsonMap(repoRoot.resolve(NPC_COVERAGE_REPORT).normalize());

        List<CrawlerMonitorOverviewDTO.RegisteredTaskDTO> tasks = new ArrayList<>();
        tasks.add(buildWikiCoreRefreshTask(repoRoot, latestRun));
        tasks.add(buildBuffFetchRefreshTask(repoRoot, buffFetchProgress));
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
        appendUnregisteredLatestRunActions(repoRoot, latestRun, tasks);
        return tasks;
    }

    private CrawlerMonitorOverviewDTO.RegisteredTaskDTO buildWikiCoreRefreshTask(
        Path repoRoot,
        CrawlerMonitorOverviewDTO.MonitorRunDTO latestRun
    ) {
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO task = baseTask("wiki-core-refresh", "Wiki core refresh", "fetch", "p0");
        CrawlerMonitorOverviewDTO.MonitorActionDTO action = findAction(latestRun, "wiki-core-refresh");
        task.setStatus(action == null ? "pending" : firstNonBlank(action.getStatus(), "pending"));
        task.setQueueState(action == null
            ? "backend refresh action"
            : firstNonBlank(action.getMessage(), firstNonBlank(action.getPhase(), "backend refresh action")));
        task.setNextStep("Keep backend-refresh heartbeat current before dependent item/NPC fetches.");
        task.setDataStage("wiki API -> generated core JSON");
        task.setReportPath(latestRun == null ? null : firstNonBlank(latestRun.getPath(), latestRun.getSummaryPath()));
        task.setUpdatedAt(latestRun == null ? null : latestRun.getGeneratedAt());
        if (action != null) {
            copyTaskProgressFromAction(task, action);
            ReadResult childStatus = readBackendActionProgressState(repoRoot, action);
            task.setProgressPath(toDisplayPath(repoRoot, childStatus));
            applyProgressFileMetadata(task, repoRoot, childStatus);
            applyReadableProgressState(task);
        }
        return task;
    }

    private void appendUnregisteredLatestRunActions(
        Path repoRoot,
        CrawlerMonitorOverviewDTO.MonitorRunDTO latestRun,
        List<CrawlerMonitorOverviewDTO.RegisteredTaskDTO> tasks
    ) {
        if (latestRun == null || latestRun.getActions() == null || latestRun.getActions().isEmpty()) {
            return;
        }
        Set<String> knownIds = tasks.stream()
            .map(CrawlerMonitorOverviewDTO.RegisteredTaskDTO::getId)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());
        for (CrawlerMonitorOverviewDTO.MonitorActionDTO action : latestRun.getActions()) {
            String id = action.getId();
            if (id == null || id.isBlank() || knownIds.contains(id)) {
                continue;
            }
            tasks.add(buildUnregisteredLatestRunActionTask(repoRoot, action));
            knownIds.add(id);
        }
    }

    private CrawlerMonitorOverviewDTO.RegisteredTaskDTO buildUnregisteredLatestRunActionTask(
        Path repoRoot,
        CrawlerMonitorOverviewDTO.MonitorActionDTO action
    ) {
        String id = firstNonBlank(action.getId(), firstNonBlank(action.getRunner(), "backend-refresh-action"));
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO task = baseTask(id, id, "backend-refresh", "p2");
        task.setStatus(firstNonBlank(action.getStatus(), "pending"));
        task.setQueueState(firstNonBlank(action.getMessage(), firstNonBlank(action.getPhase(), task.getStatus())));
        task.setNextStep("Add a dedicated registered task if this backend-refresh action becomes operationally important.");
        task.setDataStage(firstNonBlank(action.getDataStage(), firstNonBlank(action.getRunner(), "backend-refresh action")));
        task.setProgressPath(action.getChildStatusPath());
        task.setUpdatedAt(firstNonBlank(action.getLastHeartbeatAt(), action.getUpdatedAt()));
        copyTaskProgressFromAction(task, action);

        ReadResult childStatus = readBackendActionProgressState(repoRoot, action);
        task.setProgressPath(toDisplayPath(repoRoot, childStatus));
        applyProgressFileMetadata(task, repoRoot, childStatus);
        if (childStatus.readable()) {
            task.setStatus(firstNonBlank(asString(childStatus.payload().get("status")), task.getStatus()));
            task.setQueueState(firstNonBlank(asString(childStatus.payload().get("message")), task.getQueueState()));
            task.setUpdatedAt(firstNonBlank(
                asString(childStatus.payload().get("lastHeartbeatAt")),
                firstNonBlank(asString(childStatus.payload().get("generatedAt")), task.getUpdatedAt())
            ));
            copyTaskProgressFromPayload(task, childStatus.payload());
        }
        applyReadableProgressState(task);
        return task;
    }

    private CrawlerMonitorOverviewDTO.RegisteredTaskDTO buildItemPagesRefreshTask(Path repoRoot, ReadResult progress) {
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO task = baseTask("item-pages-refresh", "Item page crawl shard", "fetch", "p0");
        task.setProgressPath(toDisplayPath(repoRoot, progress));
        applyProgressFileMetadata(task, repoRoot, progress);
        task.setInputPath("wiki item pages");
        task.setOutputPath("data/generated/wiki-item-pages*.json");
        task.setDataStage("wiki item pages -> crawler JSON");

        if (!progress.found()) {
            task.setStatus("missing");
            task.setProgressKind("missing");
            task.setQueueState("progress file missing");
            task.setNextStep("Start the item page crawler runner when the crawl slot is free.");
            return task;
        }
        if (!progress.readable()) {
            task.setStatus("blocked");
            task.setProgressKind("blocked");
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
        applyReadableProgressState(task);
        return task;
    }

    private CrawlerMonitorOverviewDTO.RegisteredTaskDTO buildBuffFetchRefreshTask(Path repoRoot, ReadResult progress) {
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO task = baseTask("buff-page-immunity-refresh", "Buff immunity page refresh", "fetch", "p0");
        task.setProgressPath(toDisplayPath(repoRoot, progress));
        applyProgressFileMetadata(task, repoRoot, progress);
        task.setInputPath("wiki buff pages");
        task.setOutputPath("data/terraPedia/raw/wiki/template__getbuffinfo.parsed.latest.json");
        task.setDataStage("wiki buff pages -> immunity evidence");

        if (!progress.found()) {
            task.setStatus("missing");
            task.setProgressKind("missing");
            task.setQueueState("progress file missing");
            task.setNextStep("Start or resume the buff page refresh before standardize-existing-data.");
            return task;
        }
        if (!progress.readable()) {
            task.setStatus("blocked");
            task.setProgressKind("blocked");
            task.setQueueState(progress.errorMessage());
            task.setNextStep("Repair the unreadable buff progress JSON before trusting completion state.");
            return task;
        }

        Map<String, Object> payload = progress.payload();
        task.setStatus(firstNonBlank(asString(payload.get("status")), "pending"));
        task.setQueueState(firstNonBlank(asString(payload.get("message")), task.getStatus()));
        task.setNextStep("Wait for buff page refresh to complete, then run standardize-existing-data and downstream relation sync.");
        task.setUpdatedAt(firstNonBlank(asString(payload.get("lastHeartbeatAt")), asString(payload.get("generatedAt"))));
        copyTaskProgressFromPayload(task, payload);
        applyReadableProgressState(task);
        String reportPath = normalizePayloadPath(repoRoot, payload.get("reportPath"));
        if (reportPath != null && !reportPath.isBlank()) {
            task.setReportPath(reportPath);
        }
        String outputPath = normalizePayloadPath(repoRoot, payload.get("outputPath"));
        if (outputPath != null && !outputPath.isBlank()) {
            task.setOutputPath(outputPath);
        }
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
            task.setProgressKind("missing");
            task.setQueueState("no report yet");
            return task;
        }

        ReadResult report = readJsonMap(reportPath);
        task.setUpdatedAt(readLastModifiedIso(reportPath));
        if (!report.readable()) {
            task.setStatus("blocked");
            task.setProgressKind("blocked");
            task.setQueueState(report.errorMessage());
            return task;
        }
        task.setStatus(statusFromReportPayload(report.payload(), "completed"));
        task.setProgressKind("report-only");
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
                task.setProgressKind("blocked");
            } else if (warnings > 0 || isWarningStatus(summaryStatus)) {
                task.setStatus("warning");
                task.setProgressKind("warning");
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
        task.setProgressKind(progressKindForStatus(status));
        return task;
    }

    private CrawlerMonitorOverviewDTO.RegisteredTaskDTO baseTask(String id, String label, String lane, String priority) {
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO task = new CrawlerMonitorOverviewDTO.RegisteredTaskDTO();
        task.setId(id);
        task.setLabel(label);
        task.setLane(lane);
        task.setPriority(priority);
        task.setStatus("pending");
        task.setProgressKind("queued");
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
        task.setPercent(firstNonNull(
            action.getPercent(),
            derivePercent(action.getOverallCurrent(), action.getOverallTotal(), action.getCurrent(), action.getTotal())
        ));
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
        task.setPercent(firstNonNull(
            clampPercent(asNullableDouble(payload.get("percent"))),
            derivePercent(overallCurrent, overallTotal, current, total)
        ));
        task.setPending(computePending(overallCurrent, overallTotal, current, total));
        task.setFailed(firstLong(payload, "failed", "failedCount", "failureCount"));
    }

    private void applyProgressFileMetadata(
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO task,
        Path repoRoot,
        ReadResult progress
    ) {
        task.setProgressSource(toDisplayPath(repoRoot, progress));
        task.setProgressFound(progress.found());
        task.setProgressReadable(progress.readable());
        task.setProgressUpdatedAt(readLastModifiedIso(progress.path()));
        task.setProgressErrorMessage(progress.errorMessage());
        if (!progress.readable()) {
            return;
        }

        String heartbeat = firstNonBlank(
            asString(progress.payload().get("lastHeartbeatAt")),
            firstNonBlank(asString(progress.payload().get("generatedAt")), task.getProgressUpdatedAt())
        );
        task.setProgressHeartbeatAt(heartbeat);
        Instant heartbeatAt = parseInstant(heartbeat);
        if (heartbeatAt != null) {
            task.setProgressHeartbeatAgeMs(Math.max(0L, Duration.between(heartbeatAt, Instant.now(clock)).toMillis()));
        }
    }

    private void applyReadableProgressState(CrawlerMonitorOverviewDTO.RegisteredTaskDTO task) {
        if (!task.isProgressReadable()) {
            return;
        }
        String status = task.getStatus() == null ? "" : task.getStatus().toLowerCase(Locale.ROOT);
        if ("running".equals(status)) {
            if (task.getProgressHeartbeatAgeMs() != null
                && task.getProgressHeartbeatAgeMs() > PROGRESS_STALE_THRESHOLD.toMillis()) {
                task.setStatus("stalled");
                task.setProgressKind("stalled");
                task.setProgressStale(true);
                task.setProgressStaleReason("running progress heartbeat is older than 10 minutes");
                return;
            }
            task.setProgressKind("live");
            task.setProgressStale(false);
            return;
        }
        task.setProgressKind(progressKindForStatus(status));
        task.setProgressStale(false);
    }

    private String progressKindForStatus(String status) {
        String normalized = status == null ? "" : status.toLowerCase(Locale.ROOT);
        if ("running".equals(normalized)) {
            return "live";
        }
        if ("queued".equals(normalized) || "pending".equals(normalized)) {
            return "queued";
        }
        if ("missing".equals(normalized)) {
            return "missing";
        }
        if ("blocked".equals(normalized)) {
            return "blocked";
        }
        if ("completed".equals(normalized)) {
            return "completed";
        }
        return normalized.isBlank() ? "completed" : normalized;
    }

    private Double derivePercent(Long overallCurrent, Long overallTotal, Long current, Long total) {
        if (overallCurrent != null && overallTotal != null && overallTotal > 0) {
            return clampPercent((overallCurrent.doubleValue() / overallTotal.doubleValue()) * 100.0d);
        }
        if (current != null && total != null && total > 0) {
            return clampPercent((current.doubleValue() / total.doubleValue()) * 100.0d);
        }
        return null;
    }

    private Double firstNonNull(Double first, Double second) {
        return first == null ? second : first;
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

    private void applyRedisHeartbeatState(Path repoRoot, CrawlerMonitorOverviewDTO overview) {
        Duration staleThreshold = resolveHeartbeatStaleThreshold(repoRoot);
        overview.setHeartbeatStaleAfterMs(staleThreshold.toMillis());
        if (redisTemplate == null) {
            return;
        }

        List<String> staleHeartbeats = new ArrayList<>();
        for (String entity : REDIS_HEARTBEAT_ENTITIES) {
            try {
                String payload = redisTemplate.opsForValue().get(redisHeartbeatKey(entity));
                Instant heartbeatAt = redisHeartbeatInstant(payload);
                if (heartbeatAt != null
                    && Duration.between(heartbeatAt, Instant.now(clock)).toMillis() > staleThreshold.toMillis()) {
                    staleHeartbeats.add(entity);
                }
            } catch (Exception ignored) {
                return;
            }
        }
        overview.setStaleHeartbeats(staleHeartbeats);
    }

    private Duration resolveHeartbeatStaleThreshold(Path repoRoot) {
        Path configPath = repoRoot.resolve(ALERT_CONFIG_FILE).normalize();
        if (!Files.isRegularFile(configPath)) {
            return DEFAULT_HEARTBEAT_STALE_THRESHOLD;
        }
        try {
            JsonNode root = objectMapper.readTree(configPath.toFile());
            long seconds = root.path("heartbeatStaleAfterSeconds").asLong(DEFAULT_HEARTBEAT_STALE_THRESHOLD.toSeconds());
            if (seconds <= 0) {
                return DEFAULT_HEARTBEAT_STALE_THRESHOLD;
            }
            return Duration.ofSeconds(seconds);
        } catch (Exception ignored) {
            return DEFAULT_HEARTBEAT_STALE_THRESHOLD;
        }
    }

    private String redisHeartbeatKey(String entity) {
        return "terrapedia:crawler:" + entity + ":heartbeat";
    }

    private Instant redisHeartbeatInstant(String payload) {
        if (payload == null || payload.isBlank()) {
            return null;
        }
        try {
            JsonNode root = objectMapper.readTree(payload);
            Instant timestamp = parseInstant(root.path("timestamp").asText(null));
            if (timestamp != null) {
                return timestamp;
            }
            return parseInstant(root.path("lastHeartbeatAt").asText(null));
        } catch (Exception ignored) {
            return null;
        }
    }

    private Instant findRefreshLastActivity(Path repoRoot, CrawlerMonitorOverviewDTO overview) {
        List<Instant> candidates = new ArrayList<>();
        addMonitorFileActivityCandidate(candidates, repoRoot, overview.getDaemon(), DAEMON_HEARTBEAT);
        addMonitorFileActivityCandidate(candidates, repoRoot, overview.getScheduler(), SCHEDULER_STATE);
        addMonitorFileActivityCandidate(candidates, repoRoot, overview.getLock(), LOCK_FILE);
        addLastModifiedCandidate(candidates, resolvePayloadPathInsideRepo(repoRoot, overview.getLatestRun().getPath()));
        addLastModifiedCandidate(candidates, resolvePayloadPathInsideRepo(repoRoot, overview.getLatestRun().getSummaryPath()));
        addInstantCandidate(candidates, overview.getLatestRun().getGeneratedAt());
        for (CrawlerMonitorOverviewDTO.RegisteredTaskDTO task : overview.getRegisteredTasks()) {
            if (task.isProgressReadable()) {
                addInstantCandidate(candidates, task.getProgressHeartbeatAt());
                addInstantCandidate(candidates, task.getProgressUpdatedAt());
            }
        }
        return candidates.stream().max(Comparator.naturalOrder()).orElse(null);
    }

    private void addMonitorFileActivityCandidate(
        List<Instant> candidates,
        Path repoRoot,
        CrawlerMonitorOverviewDTO.MonitorFileDTO monitorFile,
        Path legacyPath
    ) {
        if (monitorFile == null) {
            return;
        }
        addInstantCandidate(candidates, monitorFile.getUpdatedAt());
        if (monitorFile.getPath() != null && monitorFile.getPath().startsWith("redis://")) {
            Map<String, Object> payload = monitorFile.getPayload() == null ? Map.of() : monitorFile.getPayload();
            addInstantCandidate(candidates, asString(payload.get("lastHeartbeatAt")));
            addInstantCandidate(candidates, asString(payload.get("generatedAt")));
            return;
        }
        addLastModifiedCandidate(candidates, repoRoot.resolve(legacyPath).normalize());
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

    private ReadResult readBackendActionProgress(String actionId) {
        if (actionId == null || actionId.isBlank()) {
            return ReadResult.missing(null);
        }
        return readRedisState(REDIS_BACKEND_ACTION_PROGRESS_PREFIX + actionId + REDIS_BACKEND_ACTION_PROGRESS_SUFFIX, false);
    }

    private ReadResult readBackendActionProgressState(Path repoRoot, CrawlerMonitorOverviewDTO.MonitorActionDTO action) {
        ReadResult redisProgress = readBackendActionProgress(action.getId());
        if (redisRepository != null) {
            return redisProgress;
        }
        Path childStatusPath = resolvePayloadPathInsideRepo(repoRoot, action.getChildStatusPath());
        if (childStatusPath != null) {
            return readJsonMap(childStatusPath);
        }
        return redisProgress;
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
            return ReadResult.missing(path);
        }
        try {
            return new ReadResult(path, false, true, true, objectMapper.readValue(path.toFile(), MAP_TYPE), null);
        } catch (IOException exception) {
            return new ReadResult(path, false, true, false, Collections.emptyMap(), exception.getMessage());
        }
    }

    private ReadResult readRedisState(String redisKey, boolean required) {
        if (redisRepository == null) {
            return ReadResult.missingRedis(redisKey);
        }
        CrawlerStateRedisRepository.RedisState state = required
            ? redisRepository.readRequired(redisKey)
            : redisRepository.readOptional(redisKey);
        return new ReadResult(
            Path.of(state.path()),
            state.path(),
            true,
            state.found(),
            state.readable(),
            state.payload(),
            state.errorMessage()
        );
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
        String rawPath = path.toString();
        if (rawPath.startsWith("redis:/")) {
            return rawPath.replaceFirst("^redis:/+", "redis://");
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

    private String toDisplayPath(Path repoRoot, ReadResult result) {
        if (result == null) {
            return null;
        }
        if (result.redis()) {
            return result.displayPath();
        }
        return toDisplayPath(repoRoot, result.path());
    }

    private String readLastModifiedIso(Path path) {
        try {
            if (path == null) {
                return null;
            }
            if (path.toString().startsWith("redis:/")) {
                return null;
            }
            FileTime fileTime = Files.getLastModifiedTime(path);
            return fileTime.toInstant().toString();
        } catch (IOException ignored) {
            return null;
        }
    }

    private Instant readLastModifiedInstant(Path path) {
        try {
            if (path == null || path.toString().startsWith("redis:/") || !Files.exists(path)) {
                return null;
            }
            return Files.getLastModifiedTime(path).toInstant();
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
            if (path.toString().startsWith("redis:/")) {
                return null;
            }
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
        Path path,
        String displayPath,
        boolean redis,
        boolean found,
        boolean readable,
        Map<String, Object> payload,
        String errorMessage
    ) {
        ReadResult(
            Path path,
            boolean redis,
            boolean found,
            boolean readable,
            Map<String, Object> payload,
            String errorMessage
        ) {
            this(path, path == null ? null : path.toString(), redis, found, readable, payload, errorMessage);
        }

        static ReadResult missing(Path path) {
            return new ReadResult(path, false, false, false, Collections.emptyMap(), null);
        }

        static ReadResult missingRedis(String key) {
            String displayPath = key == null ? null : "redis://" + key;
            return new ReadResult(displayPath == null ? null : Path.of(displayPath), displayPath, true, false, false, Collections.emptyMap(), null);
        }
    }
}

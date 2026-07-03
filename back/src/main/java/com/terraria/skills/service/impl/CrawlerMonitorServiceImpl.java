package com.terraria.skills.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.CrawlerMonitorDispatchRequestDTO;
import com.terraria.skills.dto.CrawlerMonitorDispatchResultDTO;
import com.terraria.skills.dto.CrawlerMonitorAutoDispatchDTO;
import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import com.terraria.skills.dto.CrawlerMonitorReportDetailDTO;
import com.terraria.skills.dto.CrawlerMonitorTestStateDTO;
import com.terraria.skills.service.CrawlerMonitorService;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
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
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
public class CrawlerMonitorServiceImpl implements CrawlerMonitorService {

    private static final Logger log = LoggerFactory.getLogger(CrawlerMonitorServiceImpl.class);

    private static final TypeReference<LinkedHashMap<String, Object>> MAP_TYPE = new TypeReference<>() {};
    private static final Path REFRESH_DIR = Path.of("reports", "backend-refresh");
    private static final Path DAEMON_HEARTBEAT = REFRESH_DIR.resolve("backend-refresh-daemon.heartbeat.json");
    private static final Path SCHEDULER_STATE = REFRESH_DIR.resolve("backend-refresh-scheduler.latest.json");
    private static final Path LOCK_FILE = REFRESH_DIR.resolve("backend-refresh.lock.json");
    private static final Path TEST_STATE_FILE = REFRESH_DIR.resolve("manual-monitor-test.json");
    private static final Path ALERT_CONFIG_FILE = REFRESH_DIR.resolve("alert-config.json");
    private static final Path WIKI_SYNC_PROGRESS_FILE = Path.of("data", "generated", "wiki-sync-progress.latest.json");
    private static final Path BUFF_FETCH_PROGRESS_FILE = Path.of("data", "generated", "fetch-wiki-buffs-progress.latest.json");
    private static final Path BUFF_PAGE_EVIDENCE_CACHE_DIR = Path.of("data", "generated", "buff-page-evidence-cache");
    private static final Path WORLD_CONTEXT_FETCH_PROGRESS_FILE = Path.of("data", "generated", "wiki-world-contexts-progress.latest.json");
    private static final Path DOMAIN_SOURCE_BOSSES_PROGRESS_FILE = Path.of("data", "generated", "domain-source-bosses-progress.latest.json");
    private static final Path DOMAIN_SOURCE_ARMOR_SETS_PROGRESS_FILE = Path.of("data", "generated", "domain-source-armor-sets-progress.latest.json");
    private static final Path DOMAIN_SOURCE_ARMOR_ATTRIBUTES_PROGRESS_FILE = Path.of("data", "generated", "domain-source-armor-attributes-progress.latest.json");
    private static final Path DOMAIN_SOURCE_SHIMMER_PROGRESS_FILE = Path.of("data", "generated", "domain-source-shimmer-progress.latest.json");
    private static final Path DOMAIN_SOURCE_TOWN_NPC_MAINTENANCE_PROGRESS_FILE = Path.of("data", "generated", "domain-source-town-npc-maintenance-progress.latest.json");
    private static final Path WIKI_AUDIO_ASSETS_PROGRESS_FILE = Path.of("data", "generated", "wiki-audio-assets-progress.latest.json");
    private static final Path WIKI_SOURCE_UPDATE_STATE_FILE = Path.of("data", "generated", "source-update-monitor.latest.json");
    private static final Path SOURCE_UPDATE_MONITOR_PROGRESS_FILE = Path.of("data", "generated", "source-update-monitor-progress.latest.json");
    private static final Path AUTO_DISPATCH_CONFIG_FILE = Path.of("reports", "crawler-monitor", "auto-dispatch.config.json");
    private static final Path AUTO_DISPATCH_LAST_SWEEP_FILE = Path.of("reports", "crawler-monitor", "auto-dispatch.last-sweep.json");
    private static final Path WIKI_MONITOR_DISPATCH_FILE = Path.of("reports", "crawler-monitor", "wiki-monitor-dispatch.latest.json");
    private static final Path WIKI_MONITOR_DISPATCH_LOCK_FILE = Path.of("reports", "crawler-monitor", "wiki-monitor-dispatch.lock.json");
    private static final Path WIKI_MONITOR_DOMAIN_SMOKE_PROGRESS_FILE = Path.of("reports", "crawler-monitor", "wiki-monitor-domain-smoke-progress.latest.json");
    private static final Path WIKI_MONITOR_DOMAIN_SMOKE_LOCK_FILE = Path.of("reports", "crawler-monitor", "wiki-monitor-domain-smoke.lock.json");
    private static final Duration WIKI_MONITOR_DISPATCH_COOLDOWN = Duration.ofMinutes(30);
    private static final Duration WIKI_MONITOR_DISPATCH_TIMEOUT = Duration.ofMinutes(90);
    private static final int WIKI_MONITOR_RETRY_LIMIT = 3;
    // Lock staleness must be >= the dispatch timeout so an in-flight process is never
    // declared stale before the watcher has had a chance to reclaim it (see H1).
    private static final Duration WIKI_MONITOR_DISPATCH_LOCK_STALE = Duration.ofMinutes(120);
    private static final int WIKI_MONITOR_DOMAIN_SMOKE_LIMIT = 10;
    private static final Path CRAWLER_MONITOR_DIR = Path.of("reports", "crawler-monitor");
    private static final int DISPATCH_ARTIFACT_RETENTION_COUNT = 20;
    private static final Duration DISPATCH_ARTIFACT_MAX_AGE = Duration.ofDays(7);
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
    private static final List<String> WIKI_MONITOR_DOMAIN_SMOKE_DOMAINS = List.of(
        "items",
        "npcs",
        "projectiles",
        "armor_sets",
        "buffs",
        "biomes",
        "recipes",
        "bosses",
        "town_npc_maintenance",
        "shimmer"
    );
    private static final String REDIS_BACKEND_DAEMON_KEY = "terrapedia:crawler:backend-refresh:daemon";
    private static final String REDIS_BACKEND_SCHEDULER_KEY = "terrapedia:crawler:backend-refresh:scheduler";
    private static final String REDIS_BACKEND_LOCK_KEY = "terrapedia:crawler:backend-refresh:lock";
    private static final String REDIS_ITEM_PROGRESS_KEY = "terrapedia:crawler:item-pages-refresh:progress";
    private static final String REDIS_BUFF_PROGRESS_KEY = "terrapedia:crawler:buff-page-immunity-refresh:progress";
    private static final String REDIS_BACKEND_ACTION_PROGRESS_PREFIX = "terrapedia:crawler:backend-refresh:action:";
    private static final String REDIS_BACKEND_ACTION_PROGRESS_SUFFIX = ":progress";
    private static final List<WikiMonitorRule> WIKI_MONITOR_RULES = List.of(
        backendRule("items", "Items", "wiki.module.iteminfo", "Module:Iteminfo/data", "wiki-core-refresh"),
        backendRule("npcs", "NPCs", "wiki.module.npcinfo", "Module:Npcinfo/data", "wiki-core-refresh"),
        backendRule("projectiles", "Projectiles", "wiki.module.projectileinfo", "Module:Projectileinfo/data", "wiki-core-refresh"),
        directRule("buffs", "Buffs", "wiki.page.template_getbuffinfo", "Template:GetBuffInfo", "buff-page-immunity-refresh",
            "data/generated/fetch-wiki-buffs-progress.latest.json",
            List.of("node", "scripts/data/fetch/fetch-wiki-buffs.mjs", "--progress-path=data/generated/fetch-wiki-buffs-progress.latest.json")),
        directRule("armor_sets", "Armor sets", "wiki.module.armorsetbonuses", "Module:ArmorSetBonuses", "domain-source-armor-sets",
            "data/generated/domain-source-armor-sets-progress.latest.json",
            List.of("node", "scripts/data/fetch/fetch-wiki-armorsetbonuses.mjs", "--progress-path=data/generated/domain-source-armor-sets-progress.latest.json")),
        backendRule("recipes", "Recipes", "wiki.zh.recipes", "zh recipe source coverage", "recipe-reference-sync"),
        backendRule("biomes", "Biomes", "wiki.page.biomes_anchor", "Forest", "biome-sync"),
        directRule("bosses", "Bosses", "wiki.domain.bosses", "Boss source snapshot pages", "domain-source-bosses",
            "data/generated/domain-source-bosses-progress.latest.json",
            List.of("node", "scripts/data/fetch/fetch-wiki-bosses.mjs", "--progress-path=data/generated/domain-source-bosses-progress.latest.json")),
        directRule("town_npc_maintenance", "Town NPC maintenance", "wiki.domain.town_npc_maintenance", "Town NPC maintenance source page", "domain-source-town-npc-maintenance",
            "data/generated/domain-source-town-npc-maintenance-progress.latest.json",
            List.of("node", "scripts/data/fetch/fetch-wiki-town-npc-maintenance.mjs", "--progress-path=data/generated/domain-source-town-npc-maintenance-progress.latest.json")),
        directRule("shimmer", "Shimmer", "wiki.domain.shimmer", "Shimmer source page", "domain-source-shimmer",
            "data/generated/domain-source-shimmer-progress.latest.json",
            List.of("node", "scripts/data/fetch/fetch-wiki-shimmer-page.mjs", "--progress-path=data/generated/domain-source-shimmer-progress.latest.json")),
        operationalBackendRule("npc_loot", "NPC loot backfill", "npc.loot.backfill", "normal NPC loot import report", "npc-loot-backfill"),
        operationalBackendRule("boss_loot", "Boss loot backfill", "boss.loot.backfill", "boss loot import report", "boss-loot-backfill")
    );

    private final ObjectMapper objectMapper;
    private final Path repoRootOverride;
    private final Clock clock;
    private final StringRedisTemplate redisTemplate;
    private final CrawlerStateRedisRepository redisRepository;
    private final WikiMonitorDispatchQueueRepository queueRepository;
    private final CrawlerReportArchiver reportArchiver;
    private final ProcessLauncher processLauncher;
    private final CrawlerDomainStateReducer domainStateReducer = new CrawlerDomainStateReducer();
    private final Map<String, ActiveDispatchProcess> activeDispatchProcesses = new ConcurrentHashMap<>();
    private final Map<String, Process> activeDomainSmokeProcesses = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>> queueStartMetadata = new ConcurrentHashMap<>();
    private final Set<String> cancellingDispatches = ConcurrentHashMap.newKeySet();
    private volatile Duration dispatchTimeout = WIKI_MONITOR_DISPATCH_TIMEOUT;
    private static final long OVERVIEW_CACHE_TTL_NANOS = TimeUnit.SECONDS.toNanos(2);
    private volatile CrawlerMonitorOverviewDTO cachedOverview;
    private volatile long cachedOverviewAtNanos;

    void setDispatchTimeoutForTesting(Duration timeout) {
        this.dispatchTimeout = timeout == null ? WIKI_MONITOR_DISPATCH_TIMEOUT : timeout;
    }

    WikiMonitorQueueExecutor standardQueueExecutorForTesting() {
        return new StandardWikiMonitorQueueExecutor();
    }

    WikiMonitorQueueExecutor domainSmokeQueueExecutorForTesting() {
        return new DomainSmokeQueueExecutor();
    }

    String resolveSmokeTerminalStatusForTesting(
        String dispatchId,
        String reportPath,
        String latestPath,
        String progressPath,
        Integer exitCodeOrNull
    ) {
        return resolveSmokeTerminalStatus(resolveRepoRoot(), dispatchId, reportPath, latestPath, progressPath, exitCodeOrNull);
    }

    @Autowired
    public CrawlerMonitorServiceImpl(ObjectMapper objectMapper, @Autowired(required = false) StringRedisTemplate redisTemplate) {
        this(objectMapper, null, Clock.systemUTC(), redisTemplate);
    }

    CrawlerMonitorServiceImpl(ObjectMapper objectMapper, Path repoRootOverride) {
        this(objectMapper, repoRootOverride, Clock.systemUTC(), (StringRedisTemplate) null);
    }

    CrawlerMonitorServiceImpl(ObjectMapper objectMapper, Path repoRootOverride, Clock clock) {
        this(objectMapper, repoRootOverride, clock, (StringRedisTemplate) null);
    }

    CrawlerMonitorServiceImpl(ObjectMapper objectMapper, Path repoRootOverride, Clock clock, StringRedisTemplate redisTemplate) {
        this(objectMapper, repoRootOverride, clock, redisTemplate, new ProcessBuilderLauncher());
    }

    CrawlerMonitorServiceImpl(ObjectMapper objectMapper, Path repoRootOverride, Clock clock, ProcessLauncher processLauncher) {
        this(objectMapper, repoRootOverride, clock, null, processLauncher);
    }

    CrawlerMonitorServiceImpl(
        ObjectMapper objectMapper,
        Path repoRootOverride,
        Clock clock,
        StringRedisTemplate redisTemplate,
        ProcessLauncher processLauncher
    ) {
        this.objectMapper = objectMapper;
        this.repoRootOverride = repoRootOverride == null ? null : repoRootOverride.toAbsolutePath().normalize();
        this.clock = clock == null ? Clock.systemUTC() : clock;
        this.redisTemplate = redisTemplate;
        this.redisRepository = redisTemplate == null ? null : new CrawlerStateRedisRepository(objectMapper, redisTemplate);
        this.queueRepository = new WikiMonitorDispatchQueueRepository(
            objectMapper,
            resolveRepoRoot(),
            redisTemplate,
            this.clock
        );
        this.reportArchiver = new CrawlerReportArchiver(objectMapper);
        this.processLauncher = processLauncher == null ? new ProcessBuilderLauncher() : processLauncher;
    }

    /**
     * Reconciles the persisted dispatch lock against the live process table on startup so that a
     * backend restart does not leave a "running" dispatch stranded (lock held for hours, UI showing
     * running, controls broken). If the recorded process is still alive it is re-tracked and a fresh
     * watcher is attached; otherwise the dispatch is converged to {@code failed} and the lock released.
     */
    @PostConstruct
    void reconcileActiveDispatchesOnStartup() {
        try {
            Path repoRoot = resolveRepoRoot();
            Path lockPath = repoRoot.resolve(WIKI_MONITOR_DISPATCH_LOCK_FILE).normalize();
            ReadResult lock = readJsonMap(lockPath);
            if (!lock.readable()) {
                return;
            }
            Map<String, Object> payload = lock.payload();
            String dispatchId = asString(payload.get("dispatchId"));
            String domain = asString(payload.get("domain"));
            String actionId = asString(payload.get("actionId"));
            if (dispatchId == null || domain == null || actionId == null) {
                return;
            }
            WikiMonitorRule rule = findWikiMonitorRule(domain, actionId);
            if (rule == null) {
                return;
            }
            long pid = asLong(payload.get("pid"));
            Optional<ProcessHandle> handle = pid > 0 ? ProcessHandle.of(pid) : Optional.empty();
            if (handle.isPresent() && handle.get().isAlive() && processStartMatches(handle.get(), asString(payload.get("startedAt")))) {
                DispatchPaths paths = reconstructDispatchPaths(repoRoot, dispatchId, rule);
                Process process = new HandleBackedProcess(handle.get());
                activeDispatchProcesses.put(dispatchId, new ActiveDispatchProcess(dispatchId, domain, actionId, process, paths));
                watchDispatchProcess(repoRoot, null, dispatchId, rule, paths, process);
                log.info("Recovered running wiki monitor dispatch {} (pid={}) after restart.", dispatchId, pid);
            } else {
                convergeOrphanedDispatch(repoRoot, lockPath, dispatchId, rule);
                log.warn("Released orphaned wiki monitor dispatch lock {} after restart (pid={} not alive).", dispatchId, pid);
            }
        } catch (RuntimeException exception) {
            log.warn("Failed to reconcile active dispatches on startup: {}", exception.getMessage());
        }
    }

    private void convergeOrphanedDispatch(Path repoRoot, Path lockPath, String dispatchId, WikiMonitorRule rule) {
        Path statePath = repoRoot.resolve(WIKI_MONITOR_DISPATCH_FILE).normalize();
        ReadResult state = readJsonMap(statePath);
        if (state.readable()
            && dispatchId.equals(asString(state.payload().get("dispatchId")))
            && "running".equals(asString(state.payload().get("status")))) {
            LinkedHashMap<String, Object> merged = new LinkedHashMap<>(state.payload());
            merged.put("status", "failed");
            merged.put("message", "dispatch orphaned by backend restart");
            merged.put("completedAt", Instant.now(clock).toString());
            writeJsonFile(statePath, merged);
        }
        releaseDispatchLock(lockPath, dispatchId);
    }

    private WikiMonitorRule findWikiMonitorRule(String domain, String actionId) {
        return WIKI_MONITOR_RULES.stream()
            .filter(rule -> rule.domain().equals(domain) && rule.actionId().equals(actionId))
            .findFirst()
            .orElse(null);
    }

    private DispatchPaths reconstructDispatchPaths(Path repoRoot, String dispatchId, WikiMonitorRule rule) {
        ReadResult state = readJsonMap(repoRoot.resolve(WIKI_MONITOR_DISPATCH_FILE).normalize());
        if (state.readable() && dispatchId.equals(asString(state.payload().get("dispatchId")))) {
            Map<String, Object> payload = state.payload();
            return new DispatchPaths(
                asString(payload.get("reportPath")),
                asString(payload.get("progressPath")),
                asString(payload.get("lockPath")),
                asString(payload.get("outputPath")),
                asString(payload.get("logPath"))
            );
        }
        return buildDispatchPaths(repoRoot, rule, dispatchId);
    }

    @Override
    public CrawlerMonitorOverviewDTO getOverview() {
        CrawlerMonitorOverviewDTO cached = cachedOverview;
        if (cached != null && (System.nanoTime() - cachedOverviewAtNanos) < OVERVIEW_CACHE_TTL_NANOS) {
            return cached;
        }
        CrawlerMonitorOverviewDTO overview = computeOverview();
        cachedOverview = overview;
        cachedOverviewAtNanos = System.nanoTime();
        return overview;
    }

    private CrawlerMonitorOverviewDTO computeOverview() {
        Path repoRoot = resolveRepoRoot();
        queueRepository.withDrainLock("overview-reconcile", "all", false, () -> reconcileQueueRuntimeState(repoRoot));
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
        overview.setWikiMonitor(buildWikiMonitor(repoRoot));
        applyRedisHeartbeatState(repoRoot, overview);
        applyRefreshStaleState(repoRoot, overview);
        return overview;
    }

    @Override
    public CrawlerMonitorReportDetailDTO getReportDetail(String path) {
        return reportArchiver.getReportDetail(resolveRepoRoot(), path);
    }

    @Override
    public CrawlerMonitorDispatchResultDTO dispatchWikiMonitorTask(CrawlerMonitorDispatchRequestDTO request) {
        Path repoRoot = resolveRepoRoot();
        pruneDispatchArtifacts(repoRoot);
        WikiMonitorRule rule = resolveWikiMonitorRule(request);
        return dispatchWikiMonitorTask(repoRoot, rule, Map.of());
    }

    private CrawlerMonitorDispatchResultDTO dispatchWikiMonitorTask(Path repoRoot, WikiMonitorRule rule, Map<String, Object> metadata) {
        WikiMonitorDispatchQueueRepository.EnqueueResult enqueue = enqueueWikiMonitorRequest(
            repoRoot,
            "standard",
            rule.domain(),
            rule.actionId(),
            metadata
        );
        WikiMonitorQueueItem item = enqueue.item();
        if (!enqueue.created()) {
            return dispatchResponseFromQueueItem(repoRoot, item);
        }
        if (!canClaimImmediateQueueItem(repoRoot, item)) {
            return dispatchResponseFromQueueItem(repoRoot, item);
        }
        WikiMonitorDispatchQueueRepository.ClaimResult claim =
            queueRepository.claimForStart(item.getQueueId(), queueClaimOwner(item.getLane()));
        invalidateCachedOverview();
        if (!claim.claimed() || claim.item().isEmpty()) {
            return dispatchResponseFromQueueItem(repoRoot, queueRepository.findItem(item.getQueueId()).orElse(item));
        }
        return startWikiMonitorQueueItem(repoRoot, claim.item().get(), metadata);
    }

    private WikiMonitorDispatchQueueRepository.EnqueueResult enqueueWikiMonitorRequest(
        Path repoRoot,
        String lane,
        String requestedDomain,
        String actionId,
        Map<String, Object> metadata
    ) {
        WikiMonitorQueueItem item = new WikiMonitorQueueItem();
        item.setLane(lane);
        item.setDomain(requestedDomain);
        item.setCoveredDomains(coveredDomainsFromMetadata(actionId, metadata));
        item.setActionId(actionId);
        item.setRequestedAt(Instant.now(clock));
        item.setRequestedBy("admin");
        item.setMessage(firstNonBlank(asString(metadata.get("message")), "已加入队列"));
        Instant cooldownUntil = cooldownUntilFor(repoRoot, lane, actionId).orElse(null);
        attachQueueBlocker(repoRoot, item, lane, actionId, cooldownUntil);
        WikiMonitorDispatchQueueRepository.EnqueueResult result = queueRepository.enqueue(item, cooldownUntil);
        invalidateCachedOverview();
        return result;
    }

    private List<String> coveredDomainsFromMetadata(String actionId, Map<String, Object> metadata) {
        Object rawCoveredDomains = metadata == null ? null : metadata.get("coveredDomains");
        if (rawCoveredDomains instanceof List<?> rawList) {
            List<String> covered = rawList.stream()
                .map(value -> value == null ? "" : String.valueOf(value).trim())
                .filter(value -> !value.isBlank())
                .toList();
            if (!covered.isEmpty()) {
                return covered;
            }
        }
        return coveredDomainsFor(actionId);
    }

    private void attachQueueBlocker(Path repoRoot, WikiMonitorQueueItem item, String lane, String actionId, Instant cooldownUntil) {
        if (item == null) {
            return;
        }
        Path lockPath = "domain_smoke".equals(lane)
            ? repoRoot.resolve(WIKI_MONITOR_DOMAIN_SMOKE_LOCK_FILE).normalize()
            : repoRoot.resolve(WIKI_MONITOR_DISPATCH_LOCK_FILE).normalize();
        ReadResult lock = readJsonMap(lockPath);
        if (lock.readable()) {
            Map<String, Object> payload = lock.payload();
            item.setBlockedByDispatchId(asString(payload.get("dispatchId")));
            item.setBlockedByDomain(asString(payload.get("domain")));
            item.setBlockedByActionId(asString(payload.get("actionId")));
            item.setBlockedSince(parseInstant(asString(payload.get("lockedAt"))));
            return;
        }
        if (cooldownUntil != null && cooldownUntil.isAfter(Instant.now(clock))) {
            item.setBlockedByActionId(actionId);
            item.setBlockedSince(Instant.now(clock));
        }
    }

    private CrawlerMonitorDispatchResultDTO startWikiMonitorQueueItem(
        Path repoRoot,
        WikiMonitorQueueItem item,
        Map<String, Object> metadata
    ) {
        if (item == null || !"starting".equals(item.getStatus())) {
            return dispatchResponseFromQueueItem(repoRoot, item);
        }
        WikiMonitorQueueExecutor executor = executorFor(item);
        Map<String, Object> safeMetadata = metadata == null ? Map.of() : new LinkedHashMap<>(metadata);
        if ("standard".equals(item.getLane()) && !safeMetadata.isEmpty()) {
            queueStartMetadata.put(item.getQueueId(), safeMetadata);
        }
        WikiMonitorQueueStartResult start;
        try {
            start = executor.start(repoRoot, item);
        } finally {
            if ("standard".equals(item.getLane())) {
                queueStartMetadata.remove(item.getQueueId());
            }
        }
        if (start.getStatus() == StartStatus.LOCK_BUSY) {
            queueRepository.releaseStartingClaimToQueued(item.getQueueId(), "已加入队列，等待当前任务完成后启动");
            invalidateCachedOverview();
            return dispatchResponseFromQueueItem(repoRoot, queueRepository.findItem(item.getQueueId()).orElse(item));
        }
        if (start.getStatus() == StartStatus.LAUNCH_FAILED) {
            releaseLaneLock(repoRoot, item.getLane(), start.getDispatchId());
            queueRepository.markTerminal(
                item.getQueueId(),
                "failed",
                Instant.now(clock),
                firstNonBlank(start.getMessage(), "队列项启动失败")
            );
            invalidateCachedOverview();
            return dispatchResponseFromQueueItem(repoRoot, queueRepository.findItem(item.getQueueId()).orElse(item));
        }
        queueRepository.markRunning(
            item.getQueueId(),
            start.getDispatchId(),
            start.getPid() == null ? -1L : start.getPid(),
            start.getProcessStartedAt(),
            start.getStartedAt(),
            new WikiMonitorDispatchQueueRepository.QueuePaths(
                start.getProgressPath(),
                start.getReportPath(),
                start.getLockPath(),
                start.getOutputPath(),
                start.getLogPath()
            )
        );
        attachQueueWatcher(repoRoot, item, start);
        invalidateCachedOverview();
        return dispatchResponseFromQueueItem(repoRoot, queueRepository.findItem(item.getQueueId()).orElse(item));
    }

    private void attachQueueWatcher(Path repoRoot, WikiMonitorQueueItem item, WikiMonitorQueueStartResult start) {
        if (item == null || start == null || start.getProcess() == null) {
            return;
        }
        if ("domain_smoke".equals(item.getLane())) {
            watchDomainSmokeProcess(
                repoRoot,
                item.getQueueId(),
                start.getDispatchId(),
                repoRoot.resolve(WIKI_MONITOR_DOMAIN_SMOKE_LOCK_FILE).normalize(),
                start.getProcess()
            );
            return;
        }
        WikiMonitorRule rule = findWikiMonitorRule(item.getDomain(), item.getActionId());
        if (rule == null) {
            return;
        }
        watchDispatchProcess(
            repoRoot,
            item.getQueueId(),
            start.getDispatchId(),
            rule,
            new DispatchPaths(start.getReportPath(), start.getProgressPath(), start.getLockPath(), start.getOutputPath(), start.getLogPath()),
            start.getProcess()
        );
    }

    private WikiMonitorQueueExecutor executorFor(WikiMonitorQueueItem item) {
        WikiMonitorQueueExecutor executor = "domain_smoke".equals(item.getLane())
            ? new DomainSmokeQueueExecutor()
            : new StandardWikiMonitorQueueExecutor();
        if (!executor.supports(item)) {
            throw new IllegalArgumentException("No queue executor supports item " + item.getQueueId());
        }
        return executor;
    }

    private boolean canClaimImmediateQueueItem(Path repoRoot, WikiMonitorQueueItem item) {
        if (item == null || !"queued".equals(item.getStatus())) {
            return false;
        }
        if (queueRepository.positionFor(item.getQueueId()).map(WikiMonitorDispatchQueueRepository.QueuePosition::lanePosition).orElse(0) != 1) {
            return false;
        }
        return !laneLockExists(repoRoot, item.getLane());
    }

    private boolean laneLockExists(Path repoRoot, String lane) {
        Path lockPath = "domain_smoke".equals(lane)
            ? repoRoot.resolve(WIKI_MONITOR_DOMAIN_SMOKE_LOCK_FILE).normalize()
            : repoRoot.resolve(WIKI_MONITOR_DISPATCH_LOCK_FILE).normalize();
        releaseStaleDispatchLock(lockPath);
        return Files.exists(lockPath);
    }

    private void releaseLaneLock(Path repoRoot, String lane, String dispatchId) {
        Path lockPath = "domain_smoke".equals(lane)
            ? repoRoot.resolve(WIKI_MONITOR_DOMAIN_SMOKE_LOCK_FILE).normalize()
            : repoRoot.resolve(WIKI_MONITOR_DISPATCH_LOCK_FILE).normalize();
        releaseDispatchLock(lockPath, dispatchId);
    }

    private CrawlerMonitorDispatchResultDTO dispatchResponseFromQueueItem(Path repoRoot, WikiMonitorQueueItem item) {
        CrawlerMonitorDispatchResultDTO result = new CrawlerMonitorDispatchResultDTO();
        if (item == null) {
            result.setAccepted(false);
            result.setStatus("missing");
            result.setQueued(false);
            result.setMessage("未找到队列项");
            return result;
        }
        result.setAccepted(!"failed".equals(item.getStatus()));
        result.setQueueId(item.getQueueId());
        result.setDispatchId(item.getDispatchId());
        result.setDomain(item.getDomain());
        result.setCoveredDomains(item.getCoveredDomains());
        result.setActionId(item.getActionId());
        result.setStatus(item.getStatus());
        result.setRequestedAt(formatInstant(item.getRequestedAt()));
        result.setProgressPath(item.getProgressPath());
        result.setLockPath(firstNonBlank(item.getLockPath(), executorForLenient(item).map(executor -> executor.lockPath(repoRoot)).orElse(null)));
        result.setReportPath(item.getReportPath());
        result.setBlockedByDispatchId(item.getBlockedByDispatchId());
        result.setBlockedByDomain(item.getBlockedByDomain());
        result.setBlockedByActionId(item.getBlockedByActionId());
        result.setBlockedSince(formatInstant(item.getBlockedSince()));
        result.setCooldownUntil(formatInstant(item.getCooldownUntil()));
        result.setMessage(item.getMessage());
        boolean waiting = item.isWaiting();
        result.setQueued(waiting);
        if (waiting) {
            queueRepository.positionFor(item.getQueueId()).ifPresent(position -> result.setQueuePosition(position.lanePosition()));
            result.setQueueMessage(queueMessage(item, result.getQueuePosition()));
        } else {
            result.setQueuePosition(null);
            result.setQueueMessage(null);
        }
        return result;
    }

    private Optional<WikiMonitorQueueExecutor> executorForLenient(WikiMonitorQueueItem item) {
        if (item == null) {
            return Optional.empty();
        }
        if ("domain_smoke".equals(item.getLane())) {
            return Optional.of(new DomainSmokeQueueExecutor());
        }
        if ("standard".equals(item.getLane())) {
            return Optional.of(new StandardWikiMonitorQueueExecutor());
        }
        return Optional.empty();
    }

    private String queueMessage(WikiMonitorQueueItem item, Integer lanePosition) {
        String blocker = queueBlockerDescription(item);
        if (blocker != null) {
            return "已加入队列第 " + (lanePosition == null ? "-" : lanePosition) + " 位，被 " + blocker + " 占用，等待其释放锁。";
        }
        if ("blocked_cooldown".equals(item.getStatus())) {
            return "冷却中，已加入队列第 " + (lanePosition == null ? "-" : lanePosition) + " 位";
        }
        return "已加入队列第 " + (lanePosition == null ? "-" : lanePosition) + " 位";
    }

    private String queueBlockerDescription(WikiMonitorQueueItem item) {
        if (item == null) {
            return null;
        }
        List<String> parts = new ArrayList<>();
        if (trimToNull(item.getBlockedByDomain()) != null) {
            parts.add("域 " + item.getBlockedByDomain());
        }
        if (trimToNull(item.getBlockedByActionId()) != null) {
            parts.add("动作 " + item.getBlockedByActionId());
        }
        if (trimToNull(item.getBlockedByDispatchId()) != null) {
            parts.add("派发 " + item.getBlockedByDispatchId());
        }
        return parts.isEmpty() ? null : String.join(" / ", parts);
    }

    private Optional<Instant> cooldownUntilFor(Path repoRoot, String lane, String actionId) {
        Optional<Instant> queued = queueRepository.cooldownUntilFor(lane, actionId)
            .filter(cooldownUntil -> cooldownUntil.isAfter(Instant.now(clock)));
        if (queued.isPresent()) {
            return queued;
        }
        if (!"standard".equals(lane)) {
            return Optional.empty();
        }
        ReadResult latestDispatch = readJsonMap(repoRoot.resolve(WIKI_MONITOR_DISPATCH_FILE).normalize());
        Map<String, Object> payload = latestDispatch.readable() ? latestDispatch.payload() : Map.of();
        if (!isActionInCooldown(actionId, payload)) {
            return Optional.empty();
        }
        Instant completedAt = parseInstant(asString(payload.get("completedAt")));
        return completedAt == null ? Optional.empty() : Optional.of(completedAt.plus(WIKI_MONITOR_DISPATCH_COOLDOWN));
    }

    private List<String> coveredDomainsFor(String actionId) {
        List<String> domains = WIKI_MONITOR_RULES.stream()
            .filter(rule -> rule.actionId().equals(actionId))
            .filter(WikiMonitorRule::wikiDomain)
            .map(WikiMonitorRule::domain)
            .distinct()
            .toList();
        return domains.isEmpty() ? List.of() : domains;
    }

    private String queueClaimOwner(String lane) {
        return "dispatch:" + (lane == null || lane.isBlank() ? "-" : lane) + ":" + Instant.now(clock);
    }

    private String formatInstant(Instant instant) {
        return instant == null ? null : instant.toString();
    }

    private void invalidateCachedOverview() {
        cachedOverview = null;
        cachedOverviewAtNanos = 0L;
    }

    @Override
    public CrawlerMonitorDispatchResultDTO controlWikiMonitorDispatch(CrawlerMonitorDispatchRequestDTO request) {
        Path repoRoot = resolveRepoRoot();
        String controlAction = trimToNull(request == null ? null : request.getControlAction());
        if ("cancelQueued".equals(controlAction)) {
            return cancelQueuedWikiMonitorDispatch(repoRoot, request);
        }
        if ("forceReclaim".equals(controlAction)) {
            WikiMonitorRule reclaimRule = controlQueueItem(request)
                .map(item -> resolveWikiMonitorControlRuleFromQueueItem(request, item))
                .orElseGet(() -> resolveWikiMonitorControlRule(request));
            return reclaimDomain(repoRoot, reclaimRule, "管理员强制回收占用");
        }
        if (isDomainSmokeControl(request)) {
            return controlWikiMonitorDomainSmoke(repoRoot, request);
        }
        Optional<WikiMonitorQueueItem> controlQueueItem = controlQueueItem(request);
        WikiMonitorRule rule = controlQueueItem
            .map(item -> resolveWikiMonitorControlRuleFromQueueItem(request, item))
            .orElseGet(() -> resolveWikiMonitorControlRule(request));
        if (!"pause".equals(controlAction) && !"resume".equals(controlAction) && !"cancel".equals(controlAction) && !"retry".equals(controlAction)) {
            throw new IllegalArgumentException("控制动作不支持 " + (controlAction == null ? "<空>" : controlAction) + "，请使用 pause、resume、cancel、retry 或 cancelQueued。");
        }
        ReadResult latestDispatch = readJsonMap(repoRoot.resolve(WIKI_MONITOR_DISPATCH_FILE).normalize());
        Map<String, Object> payload = latestDispatch.readable() ? latestDispatch.payload() : Map.of();
        if ("retry".equals(controlAction)) {
            return retryWikiMonitorDispatch(repoRoot, rule, payload);
        }
        String dispatchId = controlQueueItem.map(WikiMonitorQueueItem::getDispatchId).orElseGet(() -> asString(payload.get("dispatchId")));
        boolean latestMatches = dispatchId != null
            && rule.domain().equals(asString(payload.get("domain")))
            && rule.actionId().equals(asString(payload.get("actionId")));
        ActiveDispatchProcess active = latestMatches ? activeDispatchProcesses.get(dispatchId) : null;
        if (active == null && controlQueueItem.isPresent()) {
            active = activeDispatchProcesses.get(dispatchId);
        }
        if (active == null) {
            active = findActiveDispatchProcess(rule);
            if (active != null) {
                dispatchId = active.dispatchId();
            }
        }
        if (active == null) {
            active = reconstructDispatchFromLock(repoRoot, rule);
            if (active != null) {
                dispatchId = active.dispatchId();
            }
        }
        if (active == null && controlQueueItem.isPresent()) {
            active = reconstructDispatchFromQueueItem(rule, controlQueueItem.get());
            if (active != null) {
                dispatchId = active.dispatchId();
            }
        }
        if (dispatchId == null || active == null) {
            Process legacyProcess = processLauncher.findLegacyProcess(buildLegacyProcessRequest(repoRoot, rule));
            if (legacyProcess == null || !legacyProcess.isAlive()) {
                if ("cancel".equals(controlAction) && controlQueueItem.isPresent() && "running".equals(controlQueueItem.get().getStatus())) {
                    return cancelOrphanedRunningQueueItem(repoRoot, rule, controlQueueItem.get(), dispatchId);
                }
                return missingActiveDispatch(rule, repoRoot);
            }
            String legacyDispatchId = controlQueueItem
                .map(WikiMonitorQueueItem::getDispatchId)
                .filter(value -> value != null && !value.isBlank())
                .orElse("legacy-os-process");
            DispatchPaths legacyPaths = controlQueueItem
                .map(item -> dispatchPathsFromQueueItem(item, rule))
                .orElseGet(() -> buildLegacyDispatchPaths(rule));
            active = new ActiveDispatchProcess(legacyDispatchId, rule.domain(), rule.actionId(), legacyProcess, legacyPaths);
            dispatchId = active.dispatchId();
        }
        if (!active.process().isAlive()) {
            return rejectedDispatch(rule, "uncontrollable", "派发进程已不在当前后端实例控制中；请刷新阶段进度确认是否已结束，必要时重新加入队列。");
        }

        String status = switch (controlAction) {
            case "pause" -> "paused";
            case "resume" -> "running";
            default -> "cancelled";
        };
        String message = switch (controlAction) {
            case "pause" -> "dispatch paused";
            case "resume" -> "dispatch resumed";
            default -> "dispatch cancelled";
        };
        if ("cancel".equals(controlAction)) {
            cancellingDispatches.add(dispatchId);
        }
        boolean signalSent = switch (controlAction) {
            case "pause" -> processLauncher.pause(active.process());
            case "resume" -> processLauncher.resume(active.process());
            default -> processLauncher.destroy(active.process());
        };
        if (!signalSent) {
            if ("cancel".equals(controlAction)) {
                cancellingDispatches.remove(dispatchId);
            }
            return rejectedDispatch(rule, "uncontrollable", "派发进程控制信号发送失败；请刷新阶段进度后重试，或检查后端进程权限。");
        }

        DispatchPaths paths = active.paths();
        LinkedHashMap<String, Object> state = latestMatches
            ? new LinkedHashMap<>(payload)
            : buildDispatchState(dispatchId, rule, status, Instant.now(clock).toString(), null, paths, message);
        state.put("status", status);
        state.put("message", message);
        state.put("controlAction", controlAction);
        state.put("controlledAt", Instant.now(clock).toString());
        if ("cancel".equals(controlAction)) {
            state.put("completedAt", Instant.now(clock).toString());
        }
        writeJsonFile(repoRoot.resolve(WIKI_MONITOR_DISPATCH_FILE).normalize(), state);
        WikiMonitorDispatchQueueRepository.TransitionResult controlTransition = null;
        if (!"cancel".equals(controlAction)) {
            Optional<WikiMonitorQueueItem> itemToSync = controlQueueItem.isPresent()
                ? controlQueueItem
                : queueRepository.findByDispatchId(dispatchId);
            if (itemToSync.isPresent()) {
                controlTransition = queueRepository.markControlStatus(itemToSync.get().getQueueId(), status, message);
                invalidateCachedOverview();
            }
        }
        WikiMonitorDispatchQueueRepository.TransitionResult cancelTransition = null;
        if ("cancel".equals(controlAction)) {
            releaseDispatchLock(repoRoot.resolve(WIKI_MONITOR_DISPATCH_LOCK_FILE).normalize(), dispatchId);
            activeDispatchProcesses.remove(dispatchId);
            cleanupDispatchArtifacts(repoRoot, paths);
            cancelTransition = markRunningQueueItemCancelled(controlQueueItem.orElse(null), dispatchId, message);
            cancellingDispatches.remove(dispatchId);
            if (controlQueueItem.isPresent() && !cancelTransition.changed() && cancelTransition.item() == null) {
                CrawlerMonitorDispatchResultDTO result = rejectedDispatch(
                    rule,
                    "queue_missing",
                    "已向运行进程发送终止信号，但未能清理队列占用：queueId="
                        + controlQueueItem.get().getQueueId()
                        + "，domain=" + rule.domain()
                        + "，actionId=" + rule.actionId()
                        + "。请刷新阶段进度；如果该队列项仍显示 running，请用队列中的“终止运行”按钮重试。"
                );
                result.setQueueId(controlQueueItem.get().getQueueId());
                return result;
            }
            drainWikiMonitorDispatchQueue("active-cancel-standard", true);
        }

        CrawlerMonitorDispatchResultDTO result = acceptedDispatch(rule, dispatchId, paths, status, message);
        if (controlTransition != null && controlTransition.item() != null) {
            result.setQueueId(controlTransition.item().getQueueId());
        } else {
            controlQueueItem.map(WikiMonitorQueueItem::getQueueId).ifPresent(result::setQueueId);
        }
        return result;
    }

    private CrawlerMonitorDispatchResultDTO cancelQueuedWikiMonitorDispatch(Path repoRoot, CrawlerMonitorDispatchRequestDTO request) {
        String queueId = trimToNull(request == null ? null : request.getQueueId());
        if (queueId == null) {
            CrawlerMonitorDispatchResultDTO result = new CrawlerMonitorDispatchResultDTO();
            result.setAccepted(false);
            result.setStatus("missing");
            result.setQueued(false);
            result.setMessage("queueId 不能为空，请刷新队列后重试。");
            return result;
        }
        Optional<WikiMonitorQueueItem> current = queueRepository.findItem(queueId);
        if (current.isEmpty()) {
            CrawlerMonitorDispatchResultDTO result = new CrawlerMonitorDispatchResultDTO();
            result.setAccepted(false);
            result.setQueueId(queueId);
            result.setStatus("missing");
            result.setQueued(false);
            result.setMessage("未找到队列任务，可能已完成、已取消，或队列状态已刷新。请刷新阶段进度后重试。");
            return result;
        }
        WikiMonitorQueueItem item = current.get();
        if ("starting".equals(item.getStatus())) {
            CrawlerMonitorDispatchResultDTO result = dispatchResponseFromQueueItem(repoRoot, item);
            result.setAccepted(false);
            result.setQueued(false);
            result.setMessage("队列任务正在启动，请稍后刷新阶段进度；如果已开始运行，请使用当前运行任务的终止按钮。");
            return result;
        }
        if ("running".equals(item.getStatus())) {
            CrawlerMonitorDispatchResultDTO result = dispatchResponseFromQueueItem(repoRoot, item);
            result.setAccepted(false);
            result.setQueued(false);
            result.setMessage("队列任务已开始运行，请使用当前运行任务的终止按钮。");
            return result;
        }
        WikiMonitorDispatchQueueRepository.CancelResult cancelResult =
            queueRepository.cancelQueued(queueId, "已取消排队任务。");
        WikiMonitorQueueItem resultItem = cancelResult.item() == null
            ? queueRepository.findItem(queueId).orElse(item)
            : cancelResult.item();
        CrawlerMonitorDispatchResultDTO result = dispatchResponseFromQueueItem(repoRoot, resultItem);
        result.setAccepted(cancelResult.cancelled());
        result.setQueued(false);
        if (cancelResult.cancelled()) {
            result.setMessage("已取消排队任务。");
            invalidateCachedOverview();
            drainWikiMonitorDispatchQueue("queued-cancel", true);
            return result;
        }
        result.setMessage("队列任务当前状态为 " + cancelResult.status() + "，不能按排队任务取消；请刷新阶段进度后重试。");
        return result;
    }

    private boolean isDomainSmokeControl(CrawlerMonitorDispatchRequestDTO request) {
        return request != null && "wiki-monitor-domain-smoke".equals(trimToNull(request.getActionId()));
    }

    private CrawlerMonitorDispatchResultDTO controlWikiMonitorDomainSmoke(Path repoRoot, CrawlerMonitorDispatchRequestDTO request) {
        String controlAction = trimToNull(request.getControlAction());
        if (!"cancel".equals(controlAction)) {
            CrawlerMonitorDispatchResultDTO result = smokeDispatchResult(
                "wiki-monitor-domain-smoke-control",
                false,
                "unsupported",
                "10 域样本爬取暂不支持暂停或继续；如需停止，请使用终止。"
            );
            return result;
        }

        ReadResult lock = readJsonMap(repoRoot.resolve(WIKI_MONITOR_DOMAIN_SMOKE_LOCK_FILE).normalize());
        String dispatchId = lock.readable()
            ? firstNonBlank(asString(lock.payload().get("dispatchId")), "wiki-monitor-domain-smoke-active")
            : "wiki-monitor-domain-smoke-active";
        Process active = activeDomainSmokeProcesses.get(dispatchId);
        if (active == null || !active.isAlive()) {
            CrawlerMonitorDispatchResultDTO result = smokeDispatchResult(
                dispatchId,
                false,
                "missing",
                "未找到正在运行的 10 域样本爬取任务；可能已结束、后端已重启，或只剩进度文件。actionId=wiki-monitor-domain-smoke，progressPath="
                    + WIKI_MONITOR_DOMAIN_SMOKE_PROGRESS_FILE.toString().replace('\\', '/')
                    + "，lockPath=" + WIKI_MONITOR_DOMAIN_SMOKE_LOCK_FILE.toString().replace('\\', '/')
                    + "。如需删除样本产物，请使用“清理样本”。"
            );
            attachBlockedDispatch(repoRoot, repoRoot.resolve(WIKI_MONITOR_DOMAIN_SMOKE_LOCK_FILE).normalize(), result);
            return result;
        }

        cancellingDispatches.add(dispatchId);
        boolean signalSent = processLauncher.destroy(active);
        if (!signalSent) {
            cancellingDispatches.remove(dispatchId);
            return smokeDispatchResult(dispatchId, false, "uncontrollable", "10 域样本爬取进程存在，但终止信号发送失败；请刷新阶段进度后重试。");
        }
        activeDomainSmokeProcesses.remove(dispatchId);
        releaseDispatchLock(repoRoot.resolve(WIKI_MONITOR_DOMAIN_SMOKE_LOCK_FILE).normalize(), dispatchId);
        markRunningQueueItemCancelled(dispatchId, "已终止 10 域样本爬取；样本产物可继续查看或手动清理。");
        drainWikiMonitorDispatchQueue("active-cancel-smoke", true);
        cancellingDispatches.remove(dispatchId);
        return smokeDispatchResult(dispatchId, true, "cancelled", "已终止 10 域样本爬取；样本产物可继续查看或手动清理。");
    }

    private WikiMonitorDispatchQueueRepository.TransitionResult markRunningQueueItemCancelled(String dispatchId, String message) {
        Optional<WikiMonitorQueueItem> item = queueRepository.findByDispatchId(dispatchId);
        if (item.isEmpty()) {
            return new WikiMonitorDispatchQueueRepository.TransitionResult(false, "missing", null);
        }
        WikiMonitorDispatchQueueRepository.TransitionResult result =
            queueRepository.markTerminal(item.get().getQueueId(), "cancelled", Instant.now(clock), message);
        invalidateCachedOverview();
        return result;
    }

    private WikiMonitorDispatchQueueRepository.TransitionResult markRunningQueueItemCancelled(WikiMonitorQueueItem item, String dispatchId, String message) {
        if (item != null && item.getQueueId() != null) {
            WikiMonitorDispatchQueueRepository.TransitionResult result =
                queueRepository.markTerminal(item.getQueueId(), "cancelled", Instant.now(clock), message);
            invalidateCachedOverview();
            return result;
        }
        return markRunningQueueItemCancelled(dispatchId, message);
    }

    private CrawlerMonitorDispatchResultDTO reclaimDomain(Path repoRoot, WikiMonitorRule rule, String reason) {
        String domain = rule.domain();
        String actionId = rule.actionId();
        String safeReason = firstNonBlank(reason, "已强制回收占用");

        // 1) 尽力杀掉仍活着的进程（找不到也无妨——幂等）
        ActiveDispatchProcess active = findActiveDispatchProcess(rule);
        if (active == null) {
            active = reconstructDispatchFromLock(repoRoot, rule);
        }
        String dispatchId = active == null ? null : active.dispatchId();
        if (active != null && active.process() != null && active.process().isAlive()) {
            cancellingDispatches.add(dispatchId);
            processLauncher.destroy(active.process());
        }
        if (dispatchId != null) {
            activeDispatchProcesses.remove(dispatchId);
        }

        // 2) 释放本域所属 lane 的锁（best-effort，不误删其它 lane）
        Path standardLock = repoRoot.resolve(WIKI_MONITOR_DISPATCH_LOCK_FILE).normalize();
        Path smokeLock = repoRoot.resolve(WIKI_MONITOR_DOMAIN_SMOKE_LOCK_FILE).normalize();
        boolean smokeLane = actionId != null && actionId.startsWith("wiki-monitor-domain-smoke");
        if (smokeLane) {
            forceDeleteLock(smokeLock);
        } else {
            forceDeleteLock(standardLock);
        }

        // 3) 写终态证据（不删进度/派发文件）
        writeReclaimTerminalProgress(repoRoot, dispatchId, rule, safeReason);

        // 4) 队列项标终态（本域 + 覆盖域，全部幂等）。
        //    注：这是尽力而为；drain 前的并发入队窗口极小，滑入项会被下次回收/drain 收敛。
        markDomainQueueItemsReclaimed(domain, actionId, safeReason);
        for (String covered : coveredDomainsFor(actionId)) {
            markDomainQueueItemsReclaimed(covered, actionId, safeReason);
        }

        // 5) 触发 drain，让后续排队项可启动
        drainWikiMonitorDispatchQueue("force-reclaim", true);
        if (dispatchId != null) {
            cancellingDispatches.remove(dispatchId);
        }
        invalidateCachedOverview();

        CrawlerMonitorDispatchResultDTO result = new CrawlerMonitorDispatchResultDTO();
        result.setAccepted(true);
        result.setDomain(domain);
        result.setActionId(actionId);
        result.setStatus("force_reclaimed");
        result.setQueued(false);
        result.setMessage(safeReason);
        return result;
    }

    private void forceDeleteLock(Path lockPath) {
        try {
            Files.deleteIfExists(lockPath);
        } catch (IOException ignored) {
            log.warn("Failed to delete lock {}: {}", lockPath, ignored.getMessage());
        }
    }

    private void writeReclaimTerminalProgress(Path repoRoot, String dispatchId, WikiMonitorRule rule, String reason) {
        Path dispatchFile = repoRoot.resolve(WIKI_MONITOR_DISPATCH_FILE).normalize();
        ReadResult current = readJsonMap(dispatchFile);
        LinkedHashMap<String, Object> state = current.readable()
            ? new LinkedHashMap<>(current.payload())
            : new LinkedHashMap<>();
        if (dispatchId != null) {
            state.putIfAbsent("dispatchId", dispatchId);
        }
        state.putIfAbsent("domain", rule.domain());
        state.putIfAbsent("actionId", rule.actionId());
        state.put("status", "force_reclaimed");
        state.put("message", reason);
        state.put("controlAction", "forceReclaim");
        state.put("controlledAt", Instant.now(clock).toString());
        state.put("completedAt", Instant.now(clock).toString());
        writeJsonFile(dispatchFile, state);
    }

    private void markDomainQueueItemsReclaimed(String domain, String actionId, String reason) {
        for (WikiMonitorQueueItem item : queueRepository.listItems()) {
            if (item.isTerminal()) {
                continue;
            }
            boolean matchesDomain = domain != null && domain.equals(item.getDomain());
            boolean matchesAction = actionId != null && actionId.equals(item.getActionId());
            boolean matchesCovered = item.getCoveredDomains() != null && item.getCoveredDomains().contains(domain);
            if (matchesDomain || matchesAction || matchesCovered) {
                queueRepository.markTerminal(item.getQueueId(), "cancelled", Instant.now(clock), reason);
            }
        }
    }

    private void drainWikiMonitorDispatchQueue(String reason) {
        drainWikiMonitorDispatchQueue(reason, false);
    }

    private void drainWikiMonitorDispatchQueue(String reason, boolean waitIfBusy) {
        queueRepository.withDrainLock(reason, "all", waitIfBusy, () -> {
            Path repoRoot = resolveRepoRoot();
            reconcileQueueRuntimeState(repoRoot);
            drainWikiMonitorDispatchQueueLane(repoRoot, "standard");
            drainWikiMonitorDispatchQueueLane(repoRoot, "domain_smoke");
        });
    }

    private void reconcileQueueRuntimeState(Path repoRoot) {
        ReadResult latestDispatch = readJsonMap(repoRoot.resolve(WIKI_MONITOR_DISPATCH_FILE).normalize());
        Map<String, Object> latestPayload = latestDispatch.readable() ? latestDispatch.payload() : Map.of();
        for (WikiMonitorQueueItem item : queueRepository.listItems()) {
            if (reconcileQueueItemFromLatestDispatch(item, latestPayload)) {
                continue;
            }
            if ("starting".equals(item.getStatus())) {
                reconcileStartingQueueItem(repoRoot, item);
                continue;
            }
            if (!"running".equals(item.getStatus())) {
                continue;
            }
            if (cancellingDispatches.contains(item.getDispatchId())) {
                continue;
            }
            if (hasTrackedActiveQueueProcess(item)) {
                continue;
            }
            Long pid = item.getPid();
            Optional<ProcessHandle> handle = pid == null || pid <= 0 ? Optional.empty() : ProcessHandle.of(pid);
            if (handle.isPresent() && handle.get().isAlive()) {
                continue;
            }
            queueRepository.markTerminal(
                item.getQueueId(),
                "timed_out",
                Instant.now(clock),
                "运行进程已不存在，队列项已标记为超时。"
            );
            releaseLaneLock(repoRoot, item.getLane(), item.getDispatchId());
            invalidateCachedOverview();
        }
    }

    private boolean reconcileQueueItemFromLatestDispatch(WikiMonitorQueueItem item, Map<String, Object> latestPayload) {
        if (item == null || latestPayload == null || latestPayload.isEmpty()) {
            return false;
        }
        String latestStatus = asString(latestPayload.get("status"));
        if (!"paused".equals(latestStatus) && !"running".equals(latestStatus)) {
            return false;
        }
        String itemStatus = item.getStatus();
        if (!"paused".equals(itemStatus) && !"running".equals(itemStatus)) {
            return false;
        }
        if (latestStatus.equals(itemStatus)) {
            return false;
        }
        if (!latestDispatchMatchesQueueItem(item, latestPayload)) {
            return false;
        }
        String message = firstNonBlank(asString(latestPayload.get("message")), "dispatch " + latestStatus)
            + "（已从 latest dispatch 自动校准）";
        WikiMonitorDispatchQueueRepository.TransitionResult transition =
            queueRepository.markControlStatus(item.getQueueId(), latestStatus, message);
        if (transition.changed()) {
            invalidateCachedOverview();
        }
        return transition.changed();
    }

    private boolean latestDispatchMatchesQueueItem(WikiMonitorQueueItem item, Map<String, Object> latestPayload) {
        String queueId = asString(latestPayload.get("queueId"));
        if (queueId != null && queueId.equals(item.getQueueId())) {
            return true;
        }
        String dispatchId = asString(latestPayload.get("dispatchId"));
        if (dispatchId != null && dispatchId.equals(item.getDispatchId())) {
            return true;
        }
        return Objects.equals(asString(latestPayload.get("domain")), item.getDomain())
            && Objects.equals(asString(latestPayload.get("actionId")), item.getActionId());
    }

    private void reconcileStartingQueueItem(Path repoRoot, WikiMonitorQueueItem item) {
        Instant claimExpiresAt = item.getClaimExpiresAt();
        if (claimExpiresAt != null && claimExpiresAt.isAfter(Instant.now(clock))) {
            return;
        }
        if (hasDurableQueueEvidence(repoRoot, item)) {
            return;
        }
        queueRepository.markExpiredStartingFailed(
            item.getQueueId(),
            "队列项启动超时，未检测到对应运行进程；请重新加入队列。"
        );
        invalidateCachedOverview();
    }

    private boolean hasDurableQueueEvidence(Path repoRoot, WikiMonitorQueueItem item) {
        Path lockPath = "domain_smoke".equals(item.getLane())
            ? repoRoot.resolve(WIKI_MONITOR_DOMAIN_SMOKE_LOCK_FILE).normalize()
            : repoRoot.resolve(WIKI_MONITOR_DISPATCH_LOCK_FILE).normalize();
        ReadResult lock = readJsonMap(lockPath);
        if (lock.readable() && item.getQueueId().equals(asString(lock.payload().get("queueId")))) {
            return true;
        }
        if (!"standard".equals(item.getLane())) {
            return false;
        }
        ReadResult latest = readJsonMap(repoRoot.resolve(WIKI_MONITOR_DISPATCH_FILE).normalize());
        return latest.readable() && item.getQueueId().equals(asString(latest.payload().get("queueId")));
    }

    private boolean hasTrackedActiveQueueProcess(WikiMonitorQueueItem item) {
        if (item == null || item.getDispatchId() == null) {
            return false;
        }
        if ("domain_smoke".equals(item.getLane())) {
            Process process = activeDomainSmokeProcesses.get(item.getDispatchId());
            return process != null && process.isAlive();
        }
        ActiveDispatchProcess active = activeDispatchProcesses.get(item.getDispatchId());
        return active != null && active.process().isAlive();
    }

    private CrawlerMonitorDispatchResultDTO cancelOrphanedRunningQueueItem(
        Path repoRoot,
        WikiMonitorRule rule,
        WikiMonitorQueueItem item,
        String dispatchIdOrNull
    ) {
        String dispatchId = firstNonBlank(firstNonBlank(dispatchIdOrNull, item.getDispatchId()), "orphaned-queue-process");
        String message = "运行进程已不存在或后端无法接管，已按 queueId 清理队列占用。";
        DispatchPaths paths = dispatchPathsFromQueueItem(item, rule);
        WikiMonitorDispatchQueueRepository.TransitionResult transition =
            markRunningQueueItemCancelled(item, dispatchId, message);
        if (!transition.changed() && transition.item() == null) {
            CrawlerMonitorDispatchResultDTO result = rejectedDispatch(
                rule,
                "queue_missing",
                "未能清理队列占用：queueId=" + item.getQueueId()
                    + "，domain=" + rule.domain()
                    + "，actionId=" + rule.actionId()
                    + "。请刷新阶段进度后确认该队列项是否仍存在。"
            );
            result.setQueueId(item.getQueueId());
            return result;
        }

        releaseLaneLock(repoRoot, item.getLane(), dispatchId);
        cleanupDispatchArtifacts(repoRoot, paths);
        Instant startedAt = item.getStartedAt() == null
            ? firstNonNullInstant(item.getRequestedAt(), Instant.now(clock))
            : item.getStartedAt();
        LinkedHashMap<String, Object> state = buildDispatchState(
            dispatchId,
            rule,
            "cancelled",
            formatInstant(startedAt),
            Instant.now(clock).toString(),
            paths,
            message
        );
        state.put("queueId", item.getQueueId());
        state.put("controlAction", "cancel");
        state.put("controlledAt", Instant.now(clock).toString());
        writeJsonFile(repoRoot.resolve(WIKI_MONITOR_DISPATCH_FILE).normalize(), state);
        drainWikiMonitorDispatchQueue("orphaned-running-cancel", true);

        CrawlerMonitorDispatchResultDTO result = acceptedDispatch(rule, dispatchId, paths, "cancelled", message);
        result.setQueueId(item.getQueueId());
        result.setQueued(false);
        return result;
    }

    private Instant firstNonNullInstant(Instant first, Instant second) {
        return first == null ? second : first;
    }

    private void drainWikiMonitorDispatchQueueLane(Path repoRoot, String lane) {
        if (laneLockExists(repoRoot, lane)) {
            return;
        }
        for (WikiMonitorQueueItem item : queueRepository.listItems()) {
            if (!lane.equals(item.getLane())) {
                continue;
            }
            if ("starting".equals(item.getStatus()) || "running".equals(item.getStatus())) {
                return;
            }
            if ("blocked_cooldown".equals(item.getStatus())
                && item.getCooldownUntil() != null
                && item.getCooldownUntil().isAfter(Instant.now(clock))) {
                return;
            }
            if (!item.isWaiting()) {
                continue;
            }
            WikiMonitorDispatchQueueRepository.ClaimResult claim =
                queueRepository.claimForStart(item.getQueueId(), queueClaimOwner(lane));
            if (!claim.claimed() || claim.item().isEmpty()) {
                return;
            }
            startWikiMonitorQueueItem(repoRoot, claim.item().get(), Map.of());
            return;
        }
    }

    private CrawlerMonitorDispatchResultDTO retryWikiMonitorDispatch(
        Path repoRoot,
        WikiMonitorRule rule,
        Map<String, Object> latestPayload
    ) {
        String failedDispatchId = asString(latestPayload.get("dispatchId"));
        boolean latestMatches = failedDispatchId != null
            && rule.domain().equals(asString(latestPayload.get("domain")))
            && rule.actionId().equals(asString(latestPayload.get("actionId")));
        if (!latestMatches) {
            return rejectedDispatch(rule, "missing", "未找到可重试的 Wiki 派发记录；请刷新阶段进度后确认该任务是否已生成失败记录。");
        }
        if (!"failed".equals(asString(latestPayload.get("status")))) {
            return rejectedDispatch(rule, "not_failed", "只有失败状态的 Wiki 派发任务可以重试；当前任务不是失败状态。");
        }
        long retryCount = asLong(latestPayload.get("retryCount"));
        if (retryCount >= WIKI_MONITOR_RETRY_LIMIT) {
            return rejectedDispatch(rule, "retry_limit", "该 Wiki 派发任务已达到重试次数上限，请检查报告后手动重新加入队列。");
        }
        LinkedHashMap<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("retryOf", failedDispatchId);
        metadata.put("retryCount", retryCount + 1);
        metadata.put("retryReason", firstNonBlank(asString(latestPayload.get("message")), "previous dispatch failed"));
        metadata.put("controlAction", "retry");
        metadata.put("controlledAt", Instant.now(clock).toString());
        metadata.put("message", "retrying failed dispatch " + failedDispatchId);
        return dispatchWikiMonitorTask(repoRoot, rule, metadata);
    }

    public CrawlerMonitorDispatchResultDTO dispatchWikiMonitorDomainSmoke() {
        return dispatchWikiMonitorDomainSmoke(new CrawlerMonitorDispatchRequestDTO());
    }

    @Override
    public CrawlerMonitorDispatchResultDTO dispatchWikiMonitorDomainSmoke(CrawlerMonitorDispatchRequestDTO request) {
        Path repoRoot = resolveRepoRoot();
        pruneDispatchArtifacts(repoRoot);
        List<String> selectedDomains = normalizeDomainSmokeDomains(request);
        String queueMode = normalizeDomainSmokeQueueMode(request);
        if ("per_domain".equals(queueMode)) {
            return dispatchWikiMonitorDomainSmokePerDomain(repoRoot, selectedDomains);
        }
        return dispatchWikiMonitorDomainSmokeGrouped(repoRoot, selectedDomains);
    }

    private CrawlerMonitorDispatchResultDTO dispatchWikiMonitorDomainSmokeGrouped(Path repoRoot, List<String> selectedDomains) {
        String requestedDomain = isAllDomainSmoke(selectedDomains) ? "all" : "selected";
        WikiMonitorDispatchQueueRepository.EnqueueResult enqueue = enqueueWikiMonitorRequest(
            repoRoot,
            "domain_smoke",
            requestedDomain,
            "wiki-monitor-domain-smoke",
            Map.of(
                "message", domainSmokeAcceptedMessage(selectedDomains),
                "coveredDomains", selectedDomains
            )
        );
        WikiMonitorQueueItem item = enqueue.item();
        if (!enqueue.created()) {
            return dispatchResponseFromQueueItem(repoRoot, item);
        }
        if (!canClaimImmediateQueueItem(repoRoot, item)) {
            return dispatchResponseFromQueueItem(repoRoot, item);
        }
        WikiMonitorDispatchQueueRepository.ClaimResult claim =
            queueRepository.claimForStart(item.getQueueId(), queueClaimOwner(item.getLane()));
        invalidateCachedOverview();
        if (!claim.claimed() || claim.item().isEmpty()) {
            return dispatchResponseFromQueueItem(repoRoot, queueRepository.findItem(item.getQueueId()).orElse(item));
        }
        return startWikiMonitorQueueItem(repoRoot, claim.item().get(), Map.of("message", domainSmokeAcceptedMessage(selectedDomains)));
    }

    private CrawlerMonitorDispatchResultDTO dispatchWikiMonitorDomainSmokePerDomain(Path repoRoot, List<String> selectedDomains) {
        List<WikiMonitorQueueItem> items = new ArrayList<>();
        for (String domain : selectedDomains) {
            WikiMonitorDispatchQueueRepository.EnqueueResult enqueue = enqueueWikiMonitorRequest(
                repoRoot,
                "domain_smoke",
                domain,
                "wiki-monitor-domain-smoke",
                Map.of(
                    "message", domainSmokeAcceptedMessage(List.of(domain)),
                    "coveredDomains", List.of(domain)
                )
            );
            items.add(enqueue.item());
        }
        WikiMonitorQueueItem first = items.isEmpty() ? null : items.get(0);
        if (first == null) {
            return dispatchResponseFromQueueItem(repoRoot, null);
        }
        if (!canClaimImmediateQueueItem(repoRoot, first)) {
            return dispatchResponseFromQueueItem(repoRoot, first);
        }
        WikiMonitorDispatchQueueRepository.ClaimResult claim =
            queueRepository.claimForStart(first.getQueueId(), queueClaimOwner(first.getLane()));
        invalidateCachedOverview();
        if (!claim.claimed() || claim.item().isEmpty()) {
            return dispatchResponseFromQueueItem(repoRoot, queueRepository.findItem(first.getQueueId()).orElse(first));
        }
        return startWikiMonitorQueueItem(repoRoot, claim.item().get(), Map.of("message", domainSmokeAcceptedMessage(first.getCoveredDomains())));
    }

    private List<String> normalizeDomainSmokeDomains(CrawlerMonitorDispatchRequestDTO request) {
        List<String> rawDomains = request == null ? null : request.getDomains();
        if ((rawDomains == null || rawDomains.isEmpty()) && request != null && trimToNull(request.getDomain()) != null && !"all".equals(request.getDomain())) {
            rawDomains = List.of(request.getDomain());
        }
        if (rawDomains == null || rawDomains.isEmpty()) {
            return WIKI_MONITOR_DOMAIN_SMOKE_DOMAINS;
        }
        List<String> normalized = rawDomains.stream()
            .map(value -> value == null ? "" : value.trim())
            .filter(value -> !value.isBlank())
            .distinct()
            .toList();
        if (normalized.isEmpty()) {
            return WIKI_MONITOR_DOMAIN_SMOKE_DOMAINS;
        }
        List<String> unknown = normalized.stream()
            .filter(domain -> !WIKI_MONITOR_DOMAIN_SMOKE_DOMAINS.contains(domain))
            .toList();
        if (!unknown.isEmpty()) {
            throw new IllegalArgumentException("Unknown wiki monitor domain smoke domain(s): " + String.join(", ", unknown));
        }
        return WIKI_MONITOR_DOMAIN_SMOKE_DOMAINS.stream()
            .filter(normalized::contains)
            .toList();
    }

    private String normalizeDomainSmokeQueueMode(CrawlerMonitorDispatchRequestDTO request) {
        String value = request == null ? null : trimToNull(request.getQueueMode());
        if (value == null || "single".equals(value)) {
            return "single";
        }
        if ("per_domain".equals(value)) {
            return "per_domain";
        }
        throw new IllegalArgumentException("Unsupported domain smoke queueMode: " + value);
    }

    private boolean isAllDomainSmoke(List<String> domains) {
        return domains != null && domains.size() == WIKI_MONITOR_DOMAIN_SMOKE_DOMAINS.size() && domains.containsAll(WIKI_MONITOR_DOMAIN_SMOKE_DOMAINS);
    }

    private String domainSmokeAcceptedMessage(List<String> domains) {
        return "domain smoke accepted: " + String.join(",", domains == null || domains.isEmpty() ? WIKI_MONITOR_DOMAIN_SMOKE_DOMAINS : domains);
    }

    @Override
    public CrawlerMonitorDispatchResultDTO cleanupWikiMonitorDomainSmoke() {
        Path repoRoot = resolveRepoRoot();
        Path dir = repoRoot.resolve(CRAWLER_MONITOR_DIR).normalize();
        int deletedCount = 0;
        if (Files.isDirectory(dir)) {
            try (Stream<Path> entries = Files.list(dir)) {
                for (Path entry : entries.filter(this::isWikiMonitorDomainSmokeArtifact).toList()) {
                    deletedCount += deleteCrawlerMonitorArtifact(entry, repoRoot);
                }
            } catch (IOException exception) {
                log.warn("Failed to clean up wiki monitor domain smoke artifacts in {}: {}", dir, exception.getMessage());
            }
        }
        CrawlerMonitorDispatchResultDTO result = smokeDispatchResult(
            "wiki-monitor-domain-smoke-cleanup",
            true,
            "cleaned",
            "domain smoke artifacts cleaned; deleted=" + deletedCount
        );
        result.setReportPath(CRAWLER_MONITOR_DIR.resolve("wiki-monitor-domain-smoke.latest.json").toString().replace('\\', '/'));
        return result;
    }

    private CrawlerMonitorOverviewDTO.WikiMonitorDTO buildWikiMonitor(Path repoRoot) {
        ReadResult sourceState = readJsonMap(repoRoot.resolve(WIKI_SOURCE_UPDATE_STATE_FILE).normalize());
        ReadResult dispatchState = readJsonMap(repoRoot.resolve(WIKI_MONITOR_DISPATCH_FILE).normalize());
        Map<String, Object> dispatchPayload = dispatchState.readable() ? dispatchState.payload() : Map.of();
        Map<String, Object> sourcePayload = sourceState.readable() ? sourceState.payload() : Map.of();
        Map<String, Map<String, Object>> sourceByKey = sourceMap(sourcePayload.get("sources"));

        List<WikiMonitorQueueItem> queueItemsForState = queueRepository.listItems();
        List<CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO> domains = WIKI_MONITOR_RULES.stream()
            .filter(WikiMonitorRule::wikiDomain)
            .map(rule -> buildWikiMonitorDomain(repoRoot, rule, sourcePayload, sourceByKey.get(rule.sourceKey()), dispatchPayload, queueItemsForState))
            .toList();
        List<CrawlerMonitorOverviewDTO.WikiMonitorDispatchPlanDTO> dispatchPlan =
            buildDispatchPlanFromDetection(sourcePayload, sourceByKey, dispatchPayload);

        CrawlerMonitorOverviewDTO.WikiMonitorDTO monitor = new CrawlerMonitorOverviewDTO.WikiMonitorDTO();
        CrawlerMonitorAutoDispatchDTO settings = readAutoDispatchSettings(repoRoot);
        monitor.setGeneratedAt(Instant.now(clock).toString());
        monitor.setDispatchMode(settings.isEnabled() ? "changed-only" : "manual");
        monitor.setAutoDispatchEnabled(settings.isEnabled());
        monitor.setAutoDispatchSettings(settings);
        monitor.setLastSweep(readLastSweep(repoRoot));
        monitor.setDomains(domains);
        monitor.setDispatchPlan(dispatchPlan);
        monitor.setDispatchQueue(buildWikiMonitorDispatchQueue());
        monitor.setPendingDispatches(buildPendingDispatches(repoRoot, domains, dispatchPayload, dispatchPlan));

        CrawlerMonitorOverviewDTO.WikiMonitorSummaryDTO summary = new CrawlerMonitorOverviewDTO.WikiMonitorSummaryDTO();
        summary.setDomainCount(domains.size());
        summary.setChangedCount(domains.stream().filter(CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO::isChanged).count());
        summary.setPendingApprovalCount(domains.stream().filter(this::isPendingApprovalDomain).count());
        summary.setRunningCount(domains.stream().filter(domain -> "running".equals(domain.getStatus())).count());
        summary.setFailedCount(domains.stream().filter(domain -> "failed".equals(domain.getStatus())).count());
        monitor.setSummary(summary);
        return monitor;
    }

    private List<CrawlerMonitorOverviewDTO.WikiMonitorQueueItemDTO> buildWikiMonitorDispatchQueue() {
        List<WikiMonitorQueueItem> items = queueRepository.listItems();
        return items.stream()
            .map(item -> {
                CrawlerMonitorOverviewDTO.WikiMonitorQueueItemDTO dto = new CrawlerMonitorOverviewDTO.WikiMonitorQueueItemDTO();
                dto.setQueueId(item.getQueueId());
                dto.setDispatchId(item.getDispatchId());
                dto.setLane(item.getLane());
                dto.setDomain(item.getDomain());
                dto.setCoveredDomains(item.getCoveredDomains());
                dto.setActionId(item.getActionId());
                dto.setStatus(item.getStatus());
                dto.setRequestedAt(formatInstant(item.getRequestedAt()));
                dto.setStartedAt(formatInstant(item.getStartedAt()));
                dto.setCompletedAt(formatInstant(item.getCompletedAt()));
                dto.setPid(item.getPid());
                dto.setProcessStartedAt(formatInstant(item.getProcessStartedAt()));
                dto.setRequestedBy(item.getRequestedBy());
                dto.setBlockedByDispatchId(item.getBlockedByDispatchId());
                dto.setBlockedByDomain(item.getBlockedByDomain());
                dto.setBlockedByActionId(item.getBlockedByActionId());
                dto.setBlockedSince(formatInstant(item.getBlockedSince()));
                dto.setCooldownUntil(formatInstant(item.getCooldownUntil()));
                dto.setProgressPath(item.getProgressPath());
                dto.setReportPath(item.getReportPath());
                dto.setLockPath(item.getLockPath());
                dto.setOutputPath(item.getOutputPath());
                dto.setLogPath(firstNonBlank(item.getLogPath(), queueItemLogPath(item)));
                dto.setMessage(item.getMessage());
                queueRepository.positionFor(item.getQueueId()).ifPresent(position -> {
                    dto.setPosition(position.position());
                    dto.setLanePosition(position.lanePosition());
                });
                return dto;
            })
            .toList();
    }

    private String queueItemLogPath(WikiMonitorQueueItem item) {
        if (item == null || trimToNull(item.getDispatchId()) == null) {
            return null;
        }
        if ("domain_smoke".equals(item.getLane())) {
            return "reports/crawler-monitor/" + item.getDispatchId() + ".log";
        }
        return "reports/crawler-monitor/wiki-monitor-dispatch-" + item.getDispatchId() + ".log";
    }

    private CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO buildWikiMonitorDomain(
        Path repoRoot,
        WikiMonitorRule rule,
        Map<String, Object> sourcePayload,
        Map<String, Object> source,
        Map<String, Object> dispatchPayload,
        List<WikiMonitorQueueItem> queueItems
    ) {
        CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO domain = new CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO();
        domain.setDomain(rule.domain());
        domain.setLabel(rule.label());
        domain.setSourceKey(rule.sourceKey());
        domain.setLocator(rule.locator());
        domain.setRecommendedActionId(rule.actionId());
        domain.setProgressPath(rule.backendRefresh() ? backendProgressTemplate(rule.actionId()) : rule.progressPath());
        domain.setRequiresApproval(true);
        boolean autoEligible = isAutoEligibleRule(rule);
        domain.setAutoEligible(autoEligible);
        domain.setAutoDispatchReason(autoEligible ? "source update covered and progress-safe" : "not covered by v1 auto dispatch");
        domain.setDispatchMode(autoEligible ? "changed-only" : "manual");
        domain.setCooldownMinutes(WIKI_MONITOR_DISPATCH_COOLDOWN.toMinutes());
        domain.setMaxConcurrent(1L);
        domain.setFailureCircuitBreaker("disabled until auto dispatch is enabled");

        boolean changed = Boolean.TRUE.equals(source == null ? null : source.get("changed"));
        domain.setChanged(changed);
        domain.setLastCheckedAt(firstNonBlank(asString(source == null ? null : source.get("checkedAt")), asString(sourcePayload.get("checkedAt"))));
        domain.setCurrentValue(asString(source == null ? null : source.get("currentValue")));
        domain.setPreviousValue(asString(source == null ? null : source.get("previousValue")));

        String dispatchStatus = dispatchStatusForDomain(repoRoot, rule, dispatchPayload);
        domain.setStatus(firstNonBlank(dispatchStatus, source == null ? "unknown" : changed ? "changed" : "unchanged"));
        domain.setMessage(changed ? "changed source awaiting approval" : source == null ? "source state missing" : "no upstream change detected");
        String lastAutoRunAt = asString(dispatchPayload.get("completedAt"));
        if (lastAutoRunAt != null && rule.domain().equals(asString(dispatchPayload.get("domain")))) {
            domain.setLastAutoRunAt(lastAutoRunAt);
        }

        java.util.function.Predicate<WikiMonitorQueueItem> matchesDomain = item ->
            rule.domain().equals(item.getDomain())
            || rule.actionId().equals(item.getActionId())
            || (item.getCoveredDomains() != null && item.getCoveredDomains().contains(rule.domain()));

        WikiMonitorQueueItem queueItem = queueItems.stream()
            .filter(item -> !item.isTerminal())
            .filter(matchesDomain)
            .findFirst()
            .orElseGet(() -> queueItems.stream()
                .filter(matchesDomain)
                .reduce((first, second) -> second)  // 取最后一个(通常最近)终态匹配项
                .orElse(null));

        CrawlerDomainStateReducer.Input reducerInput = CrawlerDomainStateReducer.Input.builder()
            .queueStatus(queueItem == null ? null : queueItem.getStatus())
            .progressStatus(dispatchStatus)
            .domainStatus(domain.getStatus())
            .blockedByDomain(queueItem == null ? null : queueItem.getBlockedByDomain())
            .blockedByActionId(queueItem == null ? null : queueItem.getBlockedByActionId())
            .blockedByDispatchId(queueItem == null ? null : queueItem.getBlockedByDispatchId())
            .leaseExpiresAt(queueItem == null ? null : queueItem.getClaimExpiresAt())
            .now(Instant.now(clock))
            .build();
        CrawlerDomainStateReducer.State reduced = domainStateReducer.reduce(reducerInput);

        CrawlerMonitorOverviewDTO.WikiMonitorDomainStateDTO stateDto = new CrawlerMonitorOverviewDTO.WikiMonitorDomainStateDTO();
        stateDto.setStatus(reduced.status());
        stateDto.setNextAction(reduced.nextAction());
        stateDto.setBlocker(reduced.blocker());
        stateDto.setBlockerLabel(reduced.blockerLabel());
        stateDto.setEvidence(firstNonBlank(domain.getProgressPath(), asString(dispatchPayload.get("reportPath"))));
        stateDto.setUpdatedAt(Instant.now(clock).toString());
        domain.setState(stateDto);
        return domain;
    }

    private List<CrawlerMonitorOverviewDTO.WikiMonitorDispatchDTO> buildPendingDispatches(
        Path repoRoot,
        List<CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO> domains,
        Map<String, Object> dispatchPayload,
        List<CrawlerMonitorOverviewDTO.WikiMonitorDispatchPlanDTO> dispatchPlan
    ) {
        List<CrawlerMonitorOverviewDTO.WikiMonitorDispatchDTO> pending = new ArrayList<>();
        List<String> orderedDomains = dispatchPlan.stream()
            .flatMap(plan -> plan.getCoveredDomains().stream())
            .toList();
        List<CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO> ordered = domains.stream()
            .sorted(Comparator.comparingInt(domain -> {
                int index = orderedDomains.indexOf(domain.getDomain());
                return index < 0 ? Integer.MAX_VALUE : index;
            }))
            .toList();
        for (CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO domain : ordered) {
            if (!isPendingApprovalDomain(domain)) {
                continue;
            }
            CrawlerMonitorOverviewDTO.WikiMonitorDispatchDTO dispatch = new CrawlerMonitorOverviewDTO.WikiMonitorDispatchDTO();
            dispatch.setDomain(domain.getDomain());
            dispatch.setActionId(domain.getRecommendedActionId());
            dispatch.setStatus("pending_approval");
            dispatch.setCommandPreview(domain.getLabel() + " refresh");
            dispatch.setProgressPath(domain.getProgressPath());
            dispatch.setLockPath(toDisplayPath(repoRoot, repoRoot.resolve(WIKI_MONITOR_DISPATCH_LOCK_FILE).normalize()));
            dispatch.setMessage("awaiting approval");
            if (domain.getDomain().equals(asString(dispatchPayload.get("domain")))) {
                dispatch.setDispatchId(asString(dispatchPayload.get("dispatchId")));
                dispatch.setReportPath(asString(dispatchPayload.get("reportPath")));
                dispatch.setRequestedAt(asString(dispatchPayload.get("requestedAt")));
                dispatch.setStartedAt(asString(dispatchPayload.get("startedAt")));
                dispatch.setCompletedAt(asString(dispatchPayload.get("completedAt")));
            }
            pending.add(dispatch);
        }
        return pending;
    }

    private boolean isPendingApprovalDomain(CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO domain) {
        if (!domain.isChanged() || !domain.isRequiresApproval() || domain.getRecommendedActionId() == null) {
            return false;
        }
        String status = String.valueOf(domain.getStatus() == null ? "" : domain.getStatus()).toLowerCase(Locale.ROOT);
        return !Set.of("running", "stalled", "blocked", "completed").contains(status);
    }

    private boolean isAutoEligibleRule(WikiMonitorRule rule) {
        return Set.of(
            "items",
            "npcs",
            "projectiles",
            "armor_sets",
            "buffs",
            "biomes"
        ).contains(rule.domain());
    }

    private CrawlerMonitorAutoDispatchDTO readAutoDispatchSettings(Path repoRoot) {
        CrawlerMonitorAutoDispatchDTO defaults = new CrawlerMonitorAutoDispatchDTO();
        ReadResult config = readJsonMap(repoRoot.resolve(AUTO_DISPATCH_CONFIG_FILE).normalize());
        if (!config.readable()) {
            return defaults;
        }
        defaults.setEnabled(asBoolean(config.payload().get("enabled")));
        defaults.setMode("changed-only");
        int interval = asInt(config.payload().get("sweepIntervalMinutes"), 60);
        defaults.setSweepIntervalMinutes(Math.max(1, interval));
        return defaults;
    }

    private CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO readLastSweep(Path repoRoot) {
        ReadResult lastSweep = readJsonMap(repoRoot.resolve(AUTO_DISPATCH_LAST_SWEEP_FILE).normalize());
        if (!lastSweep.readable()) {
            return null;
        }
        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO dto = new CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO();
        dto.setCheckedAt(asString(lastSweep.payload().get("checkedAt")));
        dto.setStatus(asString(lastSweep.payload().get("status")));
        dto.setDetected(asMapList(lastSweep.payload().get("detected")));
        dto.setDispatched(asMapList(lastSweep.payload().get("dispatched")));
        dto.setSkipped(asMapList(lastSweep.payload().get("skipped")));
        return dto;
    }

    private List<CrawlerMonitorOverviewDTO.WikiMonitorDispatchPlanDTO> buildDispatchPlanFromDetection(
        Map<String, Object> sourcePayload,
        Map<String, Map<String, Object>> sourceByKey,
        Map<String, Object> dispatchPayload
    ) {
        Map<String, DispatchPlanAccumulator> byActionId = new LinkedHashMap<>();
        Map<String, String> advisoryByActionId = advisoryNotesByActionId(sourcePayload.get("recommendedActions"));
        for (WikiMonitorRule rule : WIKI_MONITOR_RULES) {
            if (!rule.wikiDomain()) {
                continue;
            }
            Map<String, Object> source = sourceByKey.get(rule.sourceKey());
            if (source == null) {
                continue;
            }
            boolean changed = asBoolean(source == null ? null : source.get("changed"));
            boolean requiresFullRefetch = asBoolean(source == null ? null : source.get("requiresFullRefetch"));
            if (!changed && !requiresFullRefetch) {
                continue;
            }
            DispatchPlanAccumulator accumulator = byActionId.computeIfAbsent(
                rule.actionId(),
                actionId -> new DispatchPlanAccumulator(actionId, advisoryByActionId.get(actionId))
            );
            accumulator.coveredDomains.add(rule.domain());
            if (changed) {
                accumulator.changedDomains.add(rule.domain());
            }
            if (requiresFullRefetch) {
                accumulator.fullRefetchDomains.add(rule.domain());
            }
        }
        for (DispatchPlanAccumulator accumulator : byActionId.values()) {
            accumulator.coveredDomains.clear();
            WIKI_MONITOR_RULES.stream()
                .filter(WikiMonitorRule::wikiDomain)
                .filter(rule -> accumulator.actionId.equals(rule.actionId()))
                .map(WikiMonitorRule::domain)
                .forEach(accumulator.coveredDomains::add);
        }
        return byActionId.values().stream()
            .map(accumulator -> toDispatchPlanDTO(accumulator, dispatchPayload))
            .sorted(Comparator
                .comparingInt(this::dispatchPlanSortRank)
                .thenComparing(CrawlerMonitorOverviewDTO.WikiMonitorDispatchPlanDTO::getActionId))
            .toList();
    }

    private CrawlerMonitorOverviewDTO.WikiMonitorDispatchPlanDTO toDispatchPlanDTO(
        DispatchPlanAccumulator accumulator,
        Map<String, Object> dispatchPayload
    ) {
        CrawlerMonitorOverviewDTO.WikiMonitorDispatchPlanDTO plan = new CrawlerMonitorOverviewDTO.WikiMonitorDispatchPlanDTO();
        plan.setActionId(accumulator.actionId);
        plan.setCoveredDomains(new ArrayList<>(accumulator.coveredDomains));
        boolean cooldown = isActionInCooldown(accumulator.actionId, dispatchPayload);
        if (cooldown) {
            plan.setPriority("p9_cooldown");
        } else if (!accumulator.fullRefetchDomains.isEmpty()) {
            plan.setPriority("p0_full_refetch");
        } else {
            plan.setPriority("p1_changed");
        }
        List<String> triggeringDomains = !accumulator.fullRefetchDomains.isEmpty()
            ? accumulator.fullRefetchDomains
            : accumulator.changedDomains;
        String reason = "source domain changed: " + String.join(", ", triggeringDomains);
        if (!accumulator.fullRefetchDomains.isEmpty()) {
            reason = reason + "; full refetch required";
        }
        if (cooldown) {
            reason = reason + "; cooldown active";
        }
        plan.setReason(reason);
        plan.setAdvisoryNote(accumulator.advisoryNote);
        return plan;
    }

    private int dispatchPlanSortRank(CrawlerMonitorOverviewDTO.WikiMonitorDispatchPlanDTO plan) {
        return switch (String.valueOf(plan.getPriority())) {
            case "p0_full_refetch" -> 0;
            case "p1_changed" -> 1;
            default -> 9;
        };
    }

    private Map<String, String> advisoryNotesByActionId(Object value) {
        Map<String, String> notes = new LinkedHashMap<>();
        for (String note : toStringList(value)) {
            for (WikiMonitorRule rule : WIKI_MONITOR_RULES) {
                if (rule.wikiDomain() && !notes.containsKey(rule.actionId()) && note.contains(rule.actionId())) {
                    notes.put(rule.actionId(), note);
                }
            }
        }
        return notes;
    }

    private Map<String, Map<String, Object>> sourceMap(Object value) {
        if (!(value instanceof List<?> sources)) {
            return Map.of();
        }
        Map<String, Map<String, Object>> byKey = new LinkedHashMap<>();
        for (Object source : sources) {
            if (source instanceof Map<?, ?> raw) {
                Map<String, Object> copy = copyObjectMap(raw);
                String key = asString(copy.get("key"));
                if (key != null) {
                    byKey.put(key, copy);
                }
            }
        }
        return byKey;
    }

    private String dispatchStatusForDomain(Path repoRoot, WikiMonitorRule rule, Map<String, Object> dispatchPayload) {
        if (!rule.domain().equals(asString(dispatchPayload.get("domain")))) {
            return null;
        }
        String progressPath = asString(dispatchPayload.get("progressPath"));
        String dispatchStatus = asString(dispatchPayload.get("status"));
        if (progressPath != null) {
            ReadResult progress = readJsonMap(repoRoot.resolve(progressPath).normalize());
            if (progress.readable()) {
                String progressStatus = asString(progress.payload().get("status"));
                if ("completed".equals(progressStatus) || "failed".equals(progressStatus)) {
                    return progressStatus;
                }
                if ("running".equals(progressStatus)) {
                    return progressHeartbeatIsStale(progress) ? "stalled" : "running";
                }
            }
        }
        if ("running".equals(dispatchStatus)) {
            return "stalled";
        }
        return dispatchStatus;
    }

    private boolean progressHeartbeatIsStale(ReadResult progress) {
        String heartbeat = firstNonBlank(asString(progress.payload().get("lastHeartbeatAt")), asString(progress.payload().get("generatedAt")));
        if (heartbeat == null) {
            return false;
        }
        try {
            return Duration.between(Instant.parse(heartbeat), Instant.now(clock)).compareTo(PROGRESS_STALE_THRESHOLD) > 0;
        } catch (RuntimeException exception) {
            return false;
        }
    }

    private WikiMonitorRule resolveWikiMonitorRule(CrawlerMonitorDispatchRequestDTO request) {
        if (request == null) {
            throw new IllegalArgumentException("派发请求不能为空，请刷新页面后重试。");
        }
        String domain = trimToNull(request.getDomain());
        if (domain == null) {
            throw new IllegalArgumentException("域不能为空，请选择要派发的域。");
        }
        String actionId = trimToNull(request.getActionId());
        if (actionId == null) {
            throw new IllegalArgumentException("动作不能为空，请选择要执行的任务。");
        }
        return WIKI_MONITOR_RULES.stream()
            .filter(rule -> rule.domain().equals(domain) && rule.actionId().equals(actionId))
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("动作 " + actionId + " 不允许用于域 " + domain + "。"));
    }

    private WikiMonitorRule resolveWikiMonitorControlRule(CrawlerMonitorDispatchRequestDTO request) {
        if (request == null) {
            throw new IllegalArgumentException("派发控制请求不能为空，请刷新页面后重试。");
        }
        String domain = trimToNull(request.getDomain());
        String actionId = trimToNull(request.getActionId());
        if (actionId == null) {
            throw new IllegalArgumentException("动作不能为空，请选择要操作的任务。");
        }
        if (domain != null) {
            return resolveWikiMonitorRule(request);
        }
        List<WikiMonitorRule> matches = WIKI_MONITOR_RULES.stream()
            .filter(rule -> rule.actionId().equals(actionId))
            .toList();
        if (matches.isEmpty()) {
            throw new IllegalArgumentException("动作 " + actionId + " 不在允许的 Wiki 派发任务中。");
        }
        if (matches.size() == 1) {
            return matches.get(0);
        }
        return matches.stream()
            .filter(rule -> findActiveDispatchProcess(rule) != null)
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("动作 " + actionId + " 对应多个域，请先选择具体域后再操作。"));
    }

    private Optional<WikiMonitorQueueItem> controlQueueItem(CrawlerMonitorDispatchRequestDTO request) {
        String queueId = trimToNull(request == null ? null : request.getQueueId());
        return queueId == null ? Optional.empty() : queueRepository.findItem(queueId);
    }

    private WikiMonitorRule resolveWikiMonitorControlRuleFromQueueItem(CrawlerMonitorDispatchRequestDTO request, WikiMonitorQueueItem item) {
        if (item == null) {
            return resolveWikiMonitorControlRule(request);
        }
        if (!"standard".equals(item.getLane())) {
            return resolveWikiMonitorControlRule(request);
        }
        WikiMonitorRule rule = findWikiMonitorRule(item.getDomain(), item.getActionId());
        if (rule == null) {
            throw new IllegalArgumentException("队列任务 " + item.getQueueId() + " 对应的动作不在允许的 Wiki 派发任务中。");
        }
        return rule;
    }

    private ActiveDispatchProcess findActiveDispatchProcess(WikiMonitorRule rule) {
        return activeDispatchProcesses.values().stream()
            .filter(active -> active.domain().equals(rule.domain()) && active.actionId().equals(rule.actionId()))
            .filter(active -> active.process().isAlive())
            .findFirst()
            .orElse(null);
    }

    private static long safePid(Process process) {
        try {
            return process.pid();
        } catch (UnsupportedOperationException exception) {
            return -1L;
        }
    }

    /**
     * Persists the launched process PID and start time to the lock and state files so that the
     * dispatch can be controlled by precise PID ownership after the in-memory tracking is lost
     * (e.g. a backend restart), instead of resorting to fuzzy {@code /proc} command matching.
     */
    private void recordDispatchRuntime(Path repoRoot, Path lockPath, String dispatchId, long pid, String startedAt) {
        if (pid <= 0) {
            return;
        }
        LinkedHashMap<String, Object> runtime = new LinkedHashMap<>();
        runtime.put("pid", pid);
        runtime.put("startedAt", startedAt);
        mergeDispatchJson(lockPath, dispatchId, runtime);
        mergeDispatchJson(repoRoot.resolve(WIKI_MONITOR_DISPATCH_FILE).normalize(), dispatchId, Map.of("pid", pid));
    }

    private void mergeDispatchJson(Path path, String dispatchId, Map<String, Object> updates) {
        ReadResult result = readJsonMap(path);
        if (!result.readable() || !dispatchId.equals(asString(result.payload().get("dispatchId")))) {
            return;
        }
        LinkedHashMap<String, Object> merged = new LinkedHashMap<>(result.payload());
        merged.putAll(updates);
        writeJsonFile(path, merged);
    }

    /**
     * Reconstructs an {@link ActiveDispatchProcess} for the given rule from the persisted lock file
     * by resolving the recorded PID. Only returns a process whose recorded ownership (matching
     * domain/action and a start time not predating the dispatch) checks out.
     */
    private ActiveDispatchProcess reconstructDispatchFromLock(Path repoRoot, WikiMonitorRule rule) {
        ReadResult lock = readJsonMap(repoRoot.resolve(WIKI_MONITOR_DISPATCH_LOCK_FILE).normalize());
        if (!lock.readable()) {
            return null;
        }
        Map<String, Object> payload = lock.payload();
        if (!rule.domain().equals(asString(payload.get("domain"))) || !rule.actionId().equals(asString(payload.get("actionId")))) {
            return null;
        }
        long pid = asLong(payload.get("pid"));
        String dispatchId = asString(payload.get("dispatchId"));
        if (pid <= 0 || dispatchId == null) {
            return null;
        }
        Optional<ProcessHandle> handle = ProcessHandle.of(pid);
        if (handle.isEmpty() || !handle.get().isAlive()) {
            return null;
        }
        if (!processStartMatches(handle.get(), asString(payload.get("startedAt")))) {
            return null;
        }
        return new ActiveDispatchProcess(dispatchId, rule.domain(), rule.actionId(),
            new HandleBackedProcess(handle.get()), buildLegacyDispatchPaths(rule));
    }

    private ActiveDispatchProcess reconstructDispatchFromQueueItem(WikiMonitorRule rule, WikiMonitorQueueItem item) {
        if (item == null || !"running".equals(item.getStatus())) {
            return null;
        }
        if (!rule.domain().equals(item.getDomain()) || !rule.actionId().equals(item.getActionId())) {
            return null;
        }
        Long pid = item.getPid();
        String dispatchId = item.getDispatchId();
        if (pid == null || pid <= 0 || dispatchId == null || dispatchId.isBlank()) {
            return null;
        }
        Optional<ProcessHandle> handle = ProcessHandle.of(pid);
        if (handle.isEmpty() || !handle.get().isAlive()) {
            return null;
        }
        if (!processStartMatches(handle.get(), formatInstant(item.getProcessStartedAt()))) {
            return null;
        }
        return new ActiveDispatchProcess(
            dispatchId,
            rule.domain(),
            rule.actionId(),
            new HandleBackedProcess(handle.get()),
            dispatchPathsFromQueueItem(item, rule)
        );
    }

    /**
     * Guards against PID reuse: the OS process must not have started measurably before the dispatch
     * was recorded. A small tolerance absorbs clock skew between the recorded timestamp and the
     * kernel-reported start time.
     */
    private static boolean processStartMatches(ProcessHandle handle, String recordedStartedAt) {
        if (recordedStartedAt == null) {
            return true;
        }
        Optional<Instant> processStart = handle.info().startInstant();
        if (processStart.isEmpty()) {
            return true;
        }
        try {
            Instant recorded = Instant.parse(recordedStartedAt);
            return !processStart.get().isBefore(recorded.minus(Duration.ofMinutes(2)));
        } catch (RuntimeException exception) {
            return true;
        }
    }

    /**
     * Implements the "终止并清理文件" (terminate and clean up files) contract surfaced by the cancel
     * dialog: removes the report, output, log and progress artifacts produced by this dispatch. Deletions are
     * confined to the {@code reports/} and {@code data/generated/} namespaces inside the repo, and the
     * shared dispatch state/lock index files are never touched.
     */
    private void cleanupDispatchArtifacts(Path repoRoot, DispatchPaths paths) {
        if (paths == null) {
            return;
        }
        deleteDispatchArtifact(repoRoot, paths.reportPath());
        deleteDispatchArtifact(repoRoot, paths.outputPath());
        deleteDispatchArtifact(repoRoot, paths.logPath());
        deleteDispatchArtifact(repoRoot, paths.progressPath());
    }

    private void deleteDispatchArtifact(Path repoRoot, String relativePath) {
        if (relativePath == null || relativePath.isBlank()) {
            return;
        }
        Path resolved = repoRoot.resolve(relativePath).normalize();
        if (!resolved.startsWith(repoRoot)) {
            return;
        }
        String relative = repoRoot.relativize(resolved).toString().replace('\\', '/');
        if (!relative.startsWith("reports/") && !relative.startsWith("data/generated/")) {
            return;
        }
        if (relative.equals(WIKI_MONITOR_DISPATCH_FILE.toString().replace('\\', '/'))
            || relative.equals(WIKI_MONITOR_DISPATCH_LOCK_FILE.toString().replace('\\', '/'))) {
            return;
        }
        try {
            Files.deleteIfExists(resolved);
            if (relative.endsWith(".json")) {
                Path runtimeDir = resolved.resolveSibling(resolved.getFileName().toString().replace(".json", ".runtime"));
                deleteRecursivelyQuietly(runtimeDir, repoRoot);
            }
        } catch (IOException exception) {
            log.warn("Failed to clean up dispatch artifact {}: {}", relative, exception.getMessage());
        }
    }

    private void deleteRecursivelyQuietly(Path dir, Path repoRoot) {
        Path normalized = dir.normalize();
        if (!normalized.startsWith(repoRoot) || !Files.isDirectory(normalized)) {
            return;
        }
        try (Stream<Path> walk = Files.walk(normalized)) {
            walk.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException ignored) {
                }
            });
        } catch (IOException ignored) {
        }
    }

    /**
     * Bounds the growth of the dispatch output directory (L4): keeps the most recent
     * {@value #DISPATCH_ARTIFACT_RETENTION_COUNT} dispatch logs / smoke output directories and prunes
     * anything older than {@link #DISPATCH_ARTIFACT_MAX_AGE}. Lock and state index files are excluded.
     */
    private void pruneDispatchArtifacts(Path repoRoot) {
        Path dir = repoRoot.resolve(CRAWLER_MONITOR_DIR).normalize();
        if (!Files.isDirectory(dir)) {
            return;
        }
        Instant cutoff = Instant.now(clock).minus(DISPATCH_ARTIFACT_MAX_AGE);
        try (Stream<Path> entries = Files.list(dir)) {
            List<Path> candidates = entries
                .filter(this::isPrunableDispatchArtifact)
                .sorted(Comparator.comparing(this::lastModifiedOrEpoch).reversed())
                .toList();
            for (int index = 0; index < candidates.size(); index += 1) {
                Path candidate = candidates.get(index);
                boolean overCount = index >= DISPATCH_ARTIFACT_RETENTION_COUNT;
                boolean tooOld = lastModifiedOrEpoch(candidate).isBefore(cutoff);
                if (!overCount && !tooOld) {
                    continue;
                }
                if (Files.isDirectory(candidate)) {
                    deleteRecursivelyQuietly(candidate, repoRoot);
                } else {
                    try {
                        Files.deleteIfExists(candidate);
                    } catch (IOException ignored) {
                    }
                }
            }
        } catch (IOException exception) {
            log.warn("Failed to prune dispatch artifacts in {}: {}", dir, exception.getMessage());
        }
    }

    private boolean isPrunableDispatchArtifact(Path path) {
        String name = path.getFileName().toString();
        if (name.endsWith(".log")) {
            return true;
        }
        return Files.isDirectory(path) && name.startsWith("wiki-monitor-domain-smoke-");
    }

    private boolean isWikiMonitorDomainSmokeArtifact(Path path) {
        String name = path.getFileName().toString();
        return name.equals("wiki-monitor-domain-smoke.latest.json")
            || name.equals(WIKI_MONITOR_DOMAIN_SMOKE_PROGRESS_FILE.getFileName().toString())
            || name.equals(WIKI_MONITOR_DOMAIN_SMOKE_LOCK_FILE.getFileName().toString())
            || name.startsWith("wiki-monitor-domain-smoke-");
    }

    private int deleteCrawlerMonitorArtifact(Path path, Path repoRoot) {
        Path normalized = path.normalize();
        if (!normalized.startsWith(repoRoot.resolve(CRAWLER_MONITOR_DIR).normalize())) {
            return 0;
        }
        if (Files.isDirectory(normalized)) {
            deleteRecursivelyQuietly(normalized, repoRoot);
            return Files.exists(normalized) ? 0 : 1;
        }
        try {
            return Files.deleteIfExists(normalized) ? 1 : 0;
        } catch (IOException exception) {
            log.warn("Failed to delete crawler monitor artifact {}: {}", normalized, exception.getMessage());
            return 0;
        }
    }

    private Instant lastModifiedOrEpoch(Path path) {
        try {
            return Files.getLastModifiedTime(path).toInstant();
        } catch (IOException exception) {
            return Instant.EPOCH;
        }
    }

    private boolean isInCooldown(WikiMonitorRule rule, Map<String, Object> payload) {
        if (!rule.domain().equals(asString(payload.get("domain"))) || !"completed".equals(asString(payload.get("status")))) {
            return false;
        }
        return completedDispatchIsInCooldown(payload);
    }

    private boolean isActionInCooldown(String actionId, Map<String, Object> payload) {
        if (!actionId.equals(asString(payload.get("actionId"))) || !"completed".equals(asString(payload.get("status")))) {
            return false;
        }
        return completedDispatchIsInCooldown(payload);
    }

    private boolean completedDispatchIsInCooldown(Map<String, Object> payload) {
        String completedAt = asString(payload.get("completedAt"));
        if (completedAt == null) {
            return false;
        }
        try {
            return Duration.between(Instant.parse(completedAt), Instant.now(clock)).compareTo(WIKI_MONITOR_DISPATCH_COOLDOWN) < 0;
        } catch (RuntimeException exception) {
            return false;
        }
    }

    private CrawlerMonitorDispatchResultDTO rejectedDispatch(WikiMonitorRule rule, String status, String message) {
        CrawlerMonitorDispatchResultDTO result = new CrawlerMonitorDispatchResultDTO();
        result.setAccepted(false);
        result.setDomain(rule.domain());
        result.setActionId(rule.actionId());
        result.setStatus(status);
        result.setProgressPath(rule.progressPath());
        result.setMessage(message);
        return result;
    }

    private CrawlerMonitorDispatchResultDTO missingActiveDispatch(WikiMonitorRule rule, Path repoRoot) {
        String progressPath = rule.progressPath();
        String lockPath = toDisplayPath(repoRoot, repoRoot.resolve(WIKI_MONITOR_DISPATCH_LOCK_FILE).normalize());
        return rejectedDispatch(
            rule,
            "missing",
            "未找到正在运行的 Wiki 派发任务；可能任务已结束、后端重启后进程未接管，或当前按钮对应的不是正式派发任务。"
                + " domain=" + rule.domain()
                + "，actionId=" + rule.actionId()
                + "，progressPath=" + progressPath
                + "，lockPath=" + lockPath
                + "。请先刷新阶段进度；如是 10 域样本任务，请使用样本任务的终止或清理样本。"
        );
    }

    private CrawlerMonitorDispatchResultDTO acceptedDispatch(
        WikiMonitorRule rule,
        String dispatchId,
        DispatchPaths paths,
        String status,
        String message
    ) {
        CrawlerMonitorDispatchResultDTO result = new CrawlerMonitorDispatchResultDTO();
        result.setAccepted(true);
        result.setDispatchId(dispatchId);
        result.setDomain(rule.domain());
        result.setActionId(rule.actionId());
        result.setStatus(status);
        result.setProgressPath(paths.progressPath());
        result.setLockPath(paths.lockPath());
        result.setReportPath(paths.reportPath());
        result.setMessage(message);
        return result;
    }

    private WikiMonitorQueueStartResult startStandardQueueItemRaw(
        Path repoRoot,
        WikiMonitorQueueItem queueItem,
        WikiMonitorRule rule
    ) {
        return startStandardQueueItemRaw(repoRoot, queueItem, rule, Map.of());
    }

    private WikiMonitorQueueStartResult startStandardQueueItemRaw(
        Path repoRoot,
        WikiMonitorQueueItem queueItem,
        WikiMonitorRule rule,
        Map<String, Object> metadata
    ) {
        String timestamp = Instant.now(clock).toString();
        String dispatchId = "wiki-monitor-" + timestamp.replaceAll("[^0-9A-Za-z]+", "-") + "-" + UUID.randomUUID().toString().substring(0, 8);
        String queueId = queueItem == null ? null : trimToNull(queueItem.getQueueId());
        Path lockPath = repoRoot.resolve(WIKI_MONITOR_DISPATCH_LOCK_FILE).normalize();
        LinkedHashMap<String, Object> lockPayload = new LinkedHashMap<>();
        lockPayload.put("dispatchId", dispatchId);
        lockPayload.put("domain", rule.domain());
        lockPayload.put("actionId", rule.actionId());
        lockPayload.put("lockedAt", timestamp);
        releaseStaleDispatchLock(lockPath);
        if (!acquireDispatchLock(lockPath, lockPayload)) {
            return queueStartResult(
                queueId,
                dispatchId,
                StartStatus.LOCK_BUSY,
                toDisplayPath(repoRoot, lockPath),
                null,
                null,
                null,
                null,
                Instant.parse(timestamp),
                null,
                null,
                null,
                "已有 10 域样本爬取正在运行，已保留队列项等待当前任务结束。"
            );
        }

        DispatchPaths dispatchPaths = buildDispatchPaths(repoRoot, rule, dispatchId);
        Map<String, Object> queueMetadata = queueId == null ? Map.of() : queueStartMetadata.getOrDefault(queueId, Map.of());
        Map<String, Object> effectiveMetadata = metadata == null || metadata.isEmpty()
            ? queueMetadata
            : metadata;
        String message = firstNonBlank(
            queueItem == null ? null : queueItem.getMessage(),
            firstNonBlank(asString(effectiveMetadata.get("message")), "dispatch accepted")
        );
        LinkedHashMap<String, Object> state = buildDispatchState(dispatchId, rule, "running", timestamp, null, dispatchPaths, message);
        state.putAll(effectiveMetadata);
        if (queueId != null) {
            state.put("queueId", queueId);
        }
        writeJsonFile(repoRoot.resolve(WIKI_MONITOR_DISPATCH_FILE).normalize(), state);

        LaunchRequest launchRequest = buildLaunchRequest(repoRoot, rule, dispatchPaths);
        try {
            Process process = processLauncher.launch(launchRequest);
            long pid = safePid(process);
            Instant processStartedAt = Instant.parse(timestamp);
            recordDispatchRuntime(repoRoot, lockPath, dispatchId, pid, timestamp);
            activeDispatchProcesses.put(dispatchId, new ActiveDispatchProcess(dispatchId, rule.domain(), rule.actionId(), process, dispatchPaths));
            if (queueId == null) {
                watchDispatchProcess(repoRoot, null, dispatchId, rule, dispatchPaths, process);
            }
            return queueStartResult(
                queueId,
                dispatchId,
                StartStatus.STARTED,
                dispatchPaths.lockPath(),
                dispatchPaths.progressPath(),
                dispatchPaths.reportPath(),
                null,
                dispatchPaths.logPath(),
                processStartedAt,
                pid,
                processStartedAt,
                process,
                message
            );
        } catch (IOException exception) {
            writeJsonFile(repoRoot.resolve(WIKI_MONITOR_DISPATCH_FILE).normalize(),
                buildDispatchState(dispatchId, rule, "failed", timestamp, Instant.now(clock).toString(), dispatchPaths, exception.getMessage()));
            releaseDispatchLock(lockPath, dispatchId);
            return queueStartResult(
                queueId,
                dispatchId,
                StartStatus.LAUNCH_FAILED,
                dispatchPaths.lockPath(),
                dispatchPaths.progressPath(),
                dispatchPaths.reportPath(),
                null,
                dispatchPaths.logPath(),
                Instant.parse(timestamp),
                null,
                null,
                null,
                exception.getMessage()
            );
        }
    }

    private WikiMonitorQueueStartResult startDomainSmokeQueueItemRaw(Path repoRoot, WikiMonitorQueueItem queueItem) {
        String timestamp = Instant.now(clock).toString();
        String dispatchId = "wiki-monitor-domain-smoke-" + timestamp.replaceAll("[^0-9A-Za-z]+", "-") + "-" + UUID.randomUUID().toString().substring(0, 8);
        String queueId = queueItem == null ? null : trimToNull(queueItem.getQueueId());
        List<String> coveredDomains = domainSmokeCoveredDomains(queueItem);
        Path lockPath = repoRoot.resolve(WIKI_MONITOR_DOMAIN_SMOKE_LOCK_FILE).normalize();
        LinkedHashMap<String, Object> lockPayload = new LinkedHashMap<>();
        lockPayload.put("dispatchId", dispatchId);
        lockPayload.put("domain", queueItem == null ? "all" : firstNonBlank(queueItem.getDomain(), "all"));
        lockPayload.put("coveredDomains", coveredDomains);
        lockPayload.put("actionId", "wiki-monitor-domain-smoke");
        lockPayload.put("limit", WIKI_MONITOR_DOMAIN_SMOKE_LIMIT);
        lockPayload.put("lockedAt", timestamp);
        if (queueId != null) {
            lockPayload.put("queueId", queueId);
        }
        releaseStaleDispatchLock(lockPath);
        if (!acquireDispatchLock(lockPath, lockPayload)) {
            return queueStartResult(
                queueId,
                dispatchId,
                StartStatus.LOCK_BUSY,
                toDisplayPath(repoRoot, lockPath),
                toDisplayPath(repoRoot, repoRoot.resolve(WIKI_MONITOR_DOMAIN_SMOKE_PROGRESS_FILE).normalize()),
                null,
                null,
                null,
                Instant.parse(timestamp),
                null,
                null,
                null,
                "已有 10 域样本爬取正在运行，已保留队列项等待当前任务结束。"
            );
        }

        String reportPath = "reports/crawler-monitor/" + dispatchId + ".json";
        String outputDir = "reports/crawler-monitor/" + dispatchId;
        String progressPath = toDisplayPath(repoRoot, repoRoot.resolve(WIKI_MONITOR_DOMAIN_SMOKE_PROGRESS_FILE).normalize());
        String logPath = "reports/crawler-monitor/" + dispatchId + ".log";
        LaunchRequest launchRequest = buildDomainSmokeLaunchRequest(repoRoot, dispatchId, reportPath, outputDir, progressPath, logPath, coveredDomains);
        try {
            Process process = processLauncher.launch(launchRequest);
            long pid = safePid(process);
            Instant processStartedAt = Instant.parse(timestamp);
            activeDomainSmokeProcesses.put(dispatchId, process);
            if (queueId == null) {
                watchDomainSmokeProcess(repoRoot, null, dispatchId, lockPath, process);
            }
            return queueStartResult(
                queueId,
                dispatchId,
                StartStatus.STARTED,
                toDisplayPath(repoRoot, lockPath),
                progressPath,
                reportPath,
                outputDir,
                logPath,
                processStartedAt,
                pid,
                processStartedAt,
                process,
                "domain smoke accepted"
            );
        } catch (IOException exception) {
            releaseDispatchLock(lockPath, dispatchId);
            return queueStartResult(
                queueId,
                dispatchId,
                StartStatus.LAUNCH_FAILED,
                toDisplayPath(repoRoot, lockPath),
                progressPath,
                reportPath,
                outputDir,
                logPath,
                Instant.parse(timestamp),
                null,
                null,
                null,
                exception.getMessage()
            );
        }
    }

    private WikiMonitorQueueStartResult queueStartResult(
        String queueId,
        String dispatchId,
        StartStatus status,
        String lockPath,
        String progressPath,
        String reportPath,
        String outputPath,
        String logPath,
        Instant startedAt,
        Long pid,
        Instant processStartedAt,
        Process process,
        String message
    ) {
        WikiMonitorQueueStartResult result = new WikiMonitorQueueStartResult();
        result.setQueueId(queueId);
        result.setDispatchId(dispatchId);
        result.setStatus(status);
        result.setLockPath(lockPath);
        result.setProgressPath(progressPath);
        result.setReportPath(reportPath);
        result.setOutputPath(outputPath);
        result.setLogPath(logPath);
        result.setStartedAt(startedAt);
        result.setPid(pid);
        result.setProcessStartedAt(processStartedAt);
        result.setProcess(process);
        result.setMessage(message);
        return result;
    }

    private void attachBlockedDispatch(Path repoRoot, Path lockPath, CrawlerMonitorDispatchResultDTO result) {
        ReadResult lock = readJsonMap(lockPath);
        if (!lock.readable()) {
            return;
        }
        Map<String, Object> payload = lock.payload();
        result.setBlockedByDispatchId(asString(payload.get("dispatchId")));
        result.setBlockedByDomain(asString(payload.get("domain")));
        result.setBlockedByActionId(asString(payload.get("actionId")));
        result.setBlockedSince(asString(payload.get("lockedAt")));
        result.setLockPath(toDisplayPath(repoRoot, lockPath));
    }

    private boolean acquireDispatchLock(Path lockPath, Map<String, Object> payload) {
        try {
            Files.createDirectories(lockPath.getParent());
            Files.writeString(lockPath, objectMapper.writeValueAsString(payload), StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
            return true;
        } catch (IOException exception) {
            return false;
        }
    }

    private void releaseDispatchLock(Path lockPath, String dispatchId) {
        ReadResult lock = readJsonMap(lockPath);
        if (lock.readable() && dispatchId.equals(asString(lock.payload().get("dispatchId")))) {
            try {
                Files.deleteIfExists(lockPath);
            } catch (IOException ignored) {
            }
        }
    }

    private void releaseStaleDispatchLock(Path lockPath) {
        ReadResult lock = readJsonMap(lockPath);
        if (!lock.readable()) {
            return;
        }
        Map<String, Object> payload = lock.payload();
        String lockedAt = asString(payload.get("lockedAt"));
        if (lockedAt == null) {
            return;
        }
        try {
            if (Duration.between(Instant.parse(lockedAt), Instant.now(clock)).compareTo(WIKI_MONITOR_DISPATCH_LOCK_STALE) <= 0) {
                return;
            }
            if (isRecordedProcessAlive(payload)) {
                log.warn("Wiki monitor dispatch lock {} is past the stale threshold but its recorded process (pid={}) is still alive; keeping the lock.",
                    lockPath, asLong(payload.get("pid")));
                return;
            }
            Files.deleteIfExists(lockPath);
        } catch (RuntimeException | IOException ignored) {
        }
    }

    private boolean isRecordedProcessAlive(Map<String, Object> payload) {
        long pid = asLong(payload.get("pid"));
        if (pid <= 0) {
            return false;
        }
        Optional<ProcessHandle> handle = ProcessHandle.of(pid);
        return handle.isPresent() && handle.get().isAlive() && processStartMatches(handle.get(), asString(payload.get("startedAt")));
    }

    private DispatchPaths buildDispatchPaths(Path repoRoot, WikiMonitorRule rule, String dispatchId) {
        String reportPath = "reports/backend-refresh/history/backend-data-refresh-" + dispatchId + ".json";
        String progressPath = rule.backendRefresh()
            ? reportPath.replace(".json", ".runtime/" + rule.actionId() + ".child-status.json")
            : rule.progressPath();
        String lockPath = toDisplayPath(repoRoot, repoRoot.resolve(WIKI_MONITOR_DISPATCH_LOCK_FILE).normalize());
        String logPath = "reports/crawler-monitor/wiki-monitor-dispatch-" + dispatchId + ".log";
        return new DispatchPaths(reportPath, progressPath, lockPath, null, logPath);
    }

    private DispatchPaths buildLegacyDispatchPaths(WikiMonitorRule rule) {
        return new DispatchPaths(null, rule.progressPath(), null, null, null);
    }

    private DispatchPaths dispatchPathsFromQueueItem(WikiMonitorQueueItem item, WikiMonitorRule rule) {
        if (item == null) {
            return buildLegacyDispatchPaths(rule);
        }
        return new DispatchPaths(
            firstNonBlank(item.getReportPath(), null),
            firstNonBlank(item.getProgressPath(), rule.progressPath()),
            firstNonBlank(item.getLockPath(), null),
            firstNonBlank(item.getOutputPath(), null),
            firstNonBlank(item.getLogPath(), null)
        );
    }

    private LegacyProcessRequest buildLegacyProcessRequest(Path repoRoot, WikiMonitorRule rule) {
        List<String> commandNeedles = rule.command().stream()
            .filter(token -> token != null && !token.isBlank())
            .filter(token -> token.contains("/") || token.contains("=") || token.endsWith(".mjs") || token.endsWith(".py"))
            .toList();
        return new LegacyProcessRequest(rule.actionId(), repoRoot, commandNeedles, legacyMinStartEpochMillis(repoRoot, rule));
    }

    /**
     * Lower-bounds the {@code /proc} scan to processes started no earlier than the most recent
     * dispatch for this rule, so an unrelated long-running process that merely shares the script
     * path and cwd is never matched and paused/killed (see H2).
     */
    private long legacyMinStartEpochMillis(Path repoRoot, WikiMonitorRule rule) {
        ReadResult latest = readJsonMap(repoRoot.resolve(WIKI_MONITOR_DISPATCH_FILE).normalize());
        if (!latest.readable()
            || !rule.domain().equals(asString(latest.payload().get("domain")))
            || !rule.actionId().equals(asString(latest.payload().get("actionId")))) {
            return 0L;
        }
        String startedAt = asString(latest.payload().get("startedAt"));
        if (startedAt == null) {
            return 0L;
        }
        try {
            return Instant.parse(startedAt).minus(Duration.ofMinutes(2)).toEpochMilli();
        } catch (RuntimeException exception) {
            return 0L;
        }
    }

    private LinkedHashMap<String, Object> buildDispatchState(
        String dispatchId,
        WikiMonitorRule rule,
        String status,
        String startedAt,
        String completedAt,
        DispatchPaths paths,
        String message
    ) {
        LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
        payload.put("dispatchId", dispatchId);
        payload.put("domain", rule.domain());
        payload.put("actionId", rule.actionId());
        payload.put("status", status);
        payload.put("commandPreview", rule.label() + " refresh");
        payload.put("progressPath", paths.progressPath());
        payload.put("lockPath", paths.lockPath());
        payload.put("reportPath", paths.reportPath());
        payload.put("logPath", paths.logPath());
        payload.put("requestedAt", startedAt);
        payload.put("startedAt", startedAt);
        if (completedAt != null) {
            payload.put("completedAt", completedAt);
        }
        payload.put("message", message);
        return payload;
    }

    private LaunchRequest buildLaunchRequest(Path repoRoot, WikiMonitorRule rule, DispatchPaths paths) {
        List<String> command = new ArrayList<>();
        for (String token : rule.command()) {
            if ("<reportPath>".equals(token)) {
                command.add(paths.reportPath());
            } else if (token != null && token.contains("<reportPath>")) {
                command.add(token.replace("<reportPath>", paths.reportPath()));
            } else {
                command.add(token);
            }
        }
        Map<String, String> environment = new LinkedHashMap<>();
        environment.put("WORKTREE_ROOT", repoRoot.toString());
        environment.put("TERRAPEDIA_CRAWLER_ACTION_ID", rule.actionId());
        environment.put("TERRAPEDIA_CRAWLER_PROGRESS_PATH", paths.progressPath());
        return new LaunchRequest(command, repoRoot.toFile(), environment, repoRoot.resolve(paths.logPath()).normalize().toFile());
    }

    private LaunchRequest buildDomainSmokeLaunchRequest(
        Path repoRoot,
        String dispatchId,
        String reportPath,
        String outputDir,
        String progressPath,
        String logPath,
        List<String> domains
    ) {
        List<String> command = new ArrayList<>();
        command.add("node");
        command.add("scripts/data/monitor/wiki-monitor-domain-smoke.mjs");
        command.add("--limit=" + WIKI_MONITOR_DOMAIN_SMOKE_LIMIT);
        command.add("--run-id=" + dispatchId);
        command.add("--report-path=" + reportPath);
        command.add("--output-dir=" + outputDir);
        command.add("--progress-path=" + progressPath);
        List<String> selectedDomains = domains == null || domains.isEmpty() ? WIKI_MONITOR_DOMAIN_SMOKE_DOMAINS : domains;
        if (!isAllDomainSmoke(selectedDomains)) {
            command.add("--domains=" + String.join(",", selectedDomains));
        }
        Map<String, String> environment = new LinkedHashMap<>();
        environment.put("WORKTREE_ROOT", repoRoot.toString());
        environment.put("TERRAPEDIA_CRAWLER_ACTION_ID", "wiki-monitor-domain-smoke");
        environment.put("TERRAPEDIA_CRAWLER_PROGRESS_PATH", progressPath);
        return new LaunchRequest(command, repoRoot.toFile(), environment, repoRoot.resolve(logPath).normalize().toFile());
    }

    private List<String> domainSmokeCoveredDomains(WikiMonitorQueueItem queueItem) {
        if (queueItem == null || queueItem.getCoveredDomains() == null || queueItem.getCoveredDomains().isEmpty()) {
            return WIKI_MONITOR_DOMAIN_SMOKE_DOMAINS;
        }
        return queueItem.getCoveredDomains();
    }

    private CrawlerMonitorDispatchResultDTO smokeDispatchResult(
        String dispatchId,
        boolean accepted,
        String status,
        String message
    ) {
        CrawlerMonitorDispatchResultDTO result = new CrawlerMonitorDispatchResultDTO();
        result.setAccepted(accepted);
        result.setDispatchId(dispatchId);
        result.setDomain("all");
        result.setActionId("wiki-monitor-domain-smoke");
        result.setStatus(status);
        result.setProgressPath(WIKI_MONITOR_DOMAIN_SMOKE_PROGRESS_FILE.toString().replace('\\', '/'));
        result.setLockPath(WIKI_MONITOR_DOMAIN_SMOKE_LOCK_FILE.toString().replace('\\', '/'));
        result.setMessage(message);
        return result;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private void watchDispatchProcess(Path repoRoot, String queueIdOrNull, String dispatchId, WikiMonitorRule rule, DispatchPaths paths, Process process) {
        Duration timeout = dispatchTimeout;
        Thread thread = new Thread(() -> {
            boolean timedOut = false;
            boolean controlledCancel = false;
            int exitCode = -1;
            try {
                if (process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS)) {
                    exitCode = process.exitValue();
                } else {
                    timedOut = true;
                    log.warn("Wiki monitor dispatch {} ({}/{}) exceeded {} min timeout; reclaiming process tree.",
                        dispatchId, rule.domain(), rule.actionId(), timeout.toMinutes());
                    processLauncher.destroy(process);
                }
                ReadResult currentDispatch = readJsonMap(repoRoot.resolve(WIKI_MONITOR_DISPATCH_FILE).normalize());
                if (cancellingDispatches.contains(dispatchId)) {
                    controlledCancel = true;
                    return;
                }
                if (currentDispatch.readable()
                    && dispatchId.equals(asString(currentDispatch.payload().get("dispatchId")))
                    && isWikiMonitorDispatchTerminalStatus(asString(currentDispatch.payload().get("status")))) {
                    return;
                }
                String status;
                String message;
                if (timedOut) {
                    status = "timed_out";
                    message = "dispatch timed out after " + timeout.toMinutes() + " minutes";
                } else {
                    status = exitCode == 0 ? "completed" : "failed";
                    message = status + " with exit code " + exitCode;
                }
                LinkedHashMap<String, Object> state = buildDispatchState(dispatchId, rule, status, asString(currentDispatch.payload().get("startedAt")),
                    Instant.now(clock).toString(), paths, message);
                preserveDispatchMetadata(currentDispatch.payload(), state);
                writeJsonFile(repoRoot.resolve(WIKI_MONITOR_DISPATCH_FILE).normalize(), state);
                if (queueIdOrNull != null) {
                    queueRepository.markTerminal(queueIdOrNull, status, Instant.now(clock), message);
                    invalidateCachedOverview();
                }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            } finally {
                releaseDispatchLock(repoRoot.resolve(WIKI_MONITOR_DISPATCH_LOCK_FILE).normalize(), dispatchId);
                activeDispatchProcesses.remove(dispatchId);
                if (!controlledCancel) {
                    cancellingDispatches.remove(dispatchId);
                    drainWikiMonitorDispatchQueue("standard-terminal");
                }
            }
        }, "wiki-monitor-dispatch-" + dispatchId);
        thread.setDaemon(true);
        thread.start();
    }

    private boolean isWikiMonitorDispatchTerminalStatus(String status) {
        return "completed".equals(status)
            || "failed".equals(status)
            || "timed_out".equals(status)
            || "cancelled".equals(status);
    }

    private void preserveDispatchMetadata(Map<String, Object> currentPayload, LinkedHashMap<String, Object> target) {
        for (String key : List.of("retryOf", "retryCount", "retryReason", "controlAction", "controlledAt", "pid")) {
            if (currentPayload.containsKey(key)) {
                target.put(key, currentPayload.get(key));
            }
        }
    }

    private void watchDomainSmokeProcess(Path repoRoot, String queueIdOrNull, String dispatchId, Path lockPath, Process process) {
        Duration timeout = dispatchTimeout;
        Thread thread = new Thread(() -> {
            boolean timedOut = false;
            Integer exitCode = null;
            boolean controlledCancel = false;
            try {
                if (process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS)) {
                    exitCode = process.exitValue();
                } else {
                    timedOut = true;
                    log.warn("Wiki monitor domain smoke {} exceeded {} min timeout; reclaiming process tree.",
                        dispatchId, timeout.toMinutes());
                    processLauncher.destroy(process);
                }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            } finally {
                if (cancellingDispatches.contains(dispatchId)) {
                    controlledCancel = true;
                    releaseDispatchLock(lockPath, dispatchId);
                    activeDomainSmokeProcesses.remove(dispatchId);
                    return;
                }
                String reportPath = "reports/crawler-monitor/" + dispatchId + ".json";
                String status = resolveSmokeTerminalStatus(
                    repoRoot,
                    dispatchId,
                    reportPath,
                    "reports/crawler-monitor/wiki-monitor-domain-smoke.latest.json",
                    toDisplayPath(repoRoot, repoRoot.resolve(WIKI_MONITOR_DOMAIN_SMOKE_PROGRESS_FILE).normalize()),
                    timedOut ? null : exitCode
                );
                log.debug("Wiki monitor domain smoke {} completed with terminal status {} (queueId={}).",
                    dispatchId, status, queueIdOrNull);
                if (queueIdOrNull != null) {
                    queueRepository.markTerminal(queueIdOrNull, status, Instant.now(clock), "domain smoke " + status);
                    invalidateCachedOverview();
                }
                releaseDispatchLock(lockPath, dispatchId);
                activeDomainSmokeProcesses.remove(dispatchId);
                if (!controlledCancel) {
                    drainWikiMonitorDispatchQueue("smoke-terminal");
                }
            }
        }, "wiki-monitor-domain-smoke-" + dispatchId);
        thread.setDaemon(true);
        thread.start();
    }

    private String resolveSmokeTerminalStatus(
        Path repoRoot,
        String dispatchId,
        String reportPath,
        String latestPath,
        String progressPath,
        Integer exitCodeOrNull
    ) {
        String fileStatus = firstResolvedSmokeStatus(repoRoot, dispatchId, reportPath, latestPath, progressPath);
        if (fileStatus != null) {
            return fileStatus;
        }
        if (exitCodeOrNull == null) {
            return "timed_out";
        }
        return exitCodeOrNull == 0 ? "timed_out" : "failed";
    }

    private String firstResolvedSmokeStatus(Path repoRoot, String dispatchId, String... displayPaths) {
        for (String displayPath : displayPaths) {
            if (displayPath == null || displayPath.isBlank()) {
                continue;
            }
            ReadResult result = readJsonMap(repoRoot.resolve(displayPath).normalize());
            if (!result.readable()) {
                continue;
            }
            if (dispatchId != null) {
                String fileDispatchId = asString(result.payload().get("dispatchId"));
                String runId = asString(result.payload().get("runId"));
                if (fileDispatchId != null && !dispatchId.equals(fileDispatchId)) {
                    continue;
                }
                if (fileDispatchId == null && runId != null && !dispatchId.equals(runId)) {
                    continue;
                }
            }
            String status = asString(result.payload().get("status"));
            if ("completed".equals(status)) {
                return "completed";
            }
            if ("partial".equals(status) || "failed".equals(status)) {
                return "failed";
            }
        }
        return null;
    }

    private class StandardWikiMonitorQueueExecutor implements WikiMonitorQueueExecutor {

        @Override
        public String lane() {
            return "standard";
        }

        @Override
        public boolean supports(WikiMonitorQueueItem item) {
            return item != null
                && lane().equals(item.getLane())
                && findWikiMonitorRule(item.getDomain(), item.getActionId()) != null;
        }

        @Override
        public WikiMonitorQueueStartResult start(Path repoRoot, WikiMonitorQueueItem item) {
            if (!supports(item)) {
                throw new IllegalArgumentException("standard queue executor does not support item");
            }
            return startStandardQueueItemRaw(repoRoot, item, findWikiMonitorRule(item.getDomain(), item.getActionId()));
        }

        @Override
        public String lockPath(Path repoRoot) {
            return toDisplayPath(repoRoot, repoRoot.resolve(WIKI_MONITOR_DISPATCH_LOCK_FILE).normalize());
        }

        @Override
        public String progressPath(Path repoRoot, WikiMonitorQueueItem item) {
            WikiMonitorRule rule = item == null ? null : findWikiMonitorRule(item.getDomain(), item.getActionId());
            return rule == null ? null : rule.progressPath();
        }

        @Override
        public String reportPath(Path repoRoot, WikiMonitorQueueItem item) {
            return item == null ? null : item.getReportPath();
        }
    }

    private class DomainSmokeQueueExecutor implements WikiMonitorQueueExecutor {

        @Override
        public String lane() {
            return "domain_smoke";
        }

        @Override
        public boolean supports(WikiMonitorQueueItem item) {
            return item != null
                && lane().equals(item.getLane())
                && "wiki-monitor-domain-smoke".equals(item.getActionId());
        }

        @Override
        public WikiMonitorQueueStartResult start(Path repoRoot, WikiMonitorQueueItem item) {
            if (!supports(item)) {
                throw new IllegalArgumentException("domain smoke queue executor does not support item");
            }
            return startDomainSmokeQueueItemRaw(repoRoot, item);
        }

        @Override
        public String lockPath(Path repoRoot) {
            return toDisplayPath(repoRoot, repoRoot.resolve(WIKI_MONITOR_DOMAIN_SMOKE_LOCK_FILE).normalize());
        }

        @Override
        public String progressPath(Path repoRoot, WikiMonitorQueueItem item) {
            return toDisplayPath(repoRoot, repoRoot.resolve(WIKI_MONITOR_DOMAIN_SMOKE_PROGRESS_FILE).normalize());
        }

        @Override
        public String reportPath(Path repoRoot, WikiMonitorQueueItem item) {
            return item == null ? null : item.getReportPath();
        }
    }

    private void writeJsonFile(Path path, Map<String, Object> payload) {
        try {
            Files.createDirectories(path.getParent());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(path.toFile(), payload);
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to write " + path, exception);
        }
    }

    @Override
    public CrawlerMonitorAutoDispatchDTO getAutoDispatchSettings() {
        return readAutoDispatchSettings(resolveRepoRoot());
    }

    @Override
    public CrawlerMonitorAutoDispatchDTO updateAutoDispatchSettings(CrawlerMonitorAutoDispatchDTO settings) {
        CrawlerMonitorAutoDispatchDTO normalized = normalizeAutoDispatchSettings(settings);
        Path repoRoot = resolveRepoRoot();
        Path absolutePath = repoRoot.resolve(AUTO_DISPATCH_CONFIG_FILE).normalize();
        LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
        payload.put("enabled", normalized.isEnabled());
        payload.put("mode", normalized.getMode());
        payload.put("sweepIntervalMinutes", normalized.getSweepIntervalMinutes());
        payload.put("updatedAt", Instant.now(clock).toString());
        writeJsonFile(absolutePath, payload);
        return normalized;
    }

    public CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO runAutoDispatchSweepOnce() {
        Path repoRoot = resolveRepoRoot();
        CrawlerMonitorAutoDispatchDTO settings = readAutoDispatchSettings(repoRoot);
        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = new CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO();
        sweep.setCheckedAt(Instant.now(clock).toString());
        if (!settings.isEnabled()) {
            sweep.setStatus("disabled");
            writeLastSweep(repoRoot, sweep);
            return sweep;
        }
        SourceUpdateCheckResult sourceUpdateCheck = runSourceUpdateMonitorCheck(repoRoot);
        if (!sourceUpdateCheck.success()) {
            sweep.setStatus("error");
            LinkedHashMap<String, Object> skipped = new LinkedHashMap<>();
            skipped.put("domain", "all");
            skipped.put("actionId", "source-update-monitor-check");
            skipped.put("reason", "source_update_check_failed");
            skipped.put("message", sourceUpdateCheck.message());
            sweep.getSkipped().add(skipped);
            writeLastSweep(repoRoot, sweep);
            return sweep;
        }

        ReadResult sourceState = readJsonMap(repoRoot.resolve(WIKI_SOURCE_UPDATE_STATE_FILE).normalize());
        Map<String, Map<String, Object>> sourceByKey = sourceMap(sourceState.readable() ? sourceState.payload().get("sources") : null);
        Map<String, List<WikiMonitorRule>> changedByAction = new LinkedHashMap<>();
        for (WikiMonitorRule rule : WIKI_MONITOR_RULES) {
            if (!rule.wikiDomain()) {
                continue;
            }
            Map<String, Object> source = sourceByKey.get(rule.sourceKey());
            if (source == null) {
                continue;
            }
            boolean changed = asBoolean(source == null ? null : source.get("changed"));
            LinkedHashMap<String, Object> detected = new LinkedHashMap<>();
            detected.put("domain", rule.domain());
            detected.put("sourceKey", rule.sourceKey());
            detected.put("actionId", rule.actionId());
            detected.put("changed", changed);
            sweep.getDetected().add(detected);
            if (!changed) {
                continue;
            }
            if (!isAutoEligibleRule(rule)) {
                LinkedHashMap<String, Object> skipped = new LinkedHashMap<>();
                skipped.put("domain", rule.domain());
                skipped.put("actionId", rule.actionId());
                skipped.put("reason", "not_auto_eligible");
                skipped.put("message", "domain is outside v1 changed-only auto dispatch coverage");
                sweep.getSkipped().add(skipped);
                continue;
            }
            changedByAction.computeIfAbsent(rule.actionId(), ignored -> new ArrayList<>()).add(rule);
        }

        for (Map.Entry<String, List<WikiMonitorRule>> entry : changedByAction.entrySet()) {
            WikiMonitorRule firstRule = entry.getValue().get(0);
            CrawlerMonitorDispatchResultDTO result = dispatchWikiMonitorTask(repoRoot, firstRule, Map.of(
                "message", "auto dispatch changed covered source",
                "dispatchSource", "auto-dispatch"
            ));
            LinkedHashMap<String, Object> dispatched = new LinkedHashMap<>();
            dispatched.put("actionId", entry.getKey());
            dispatched.put("domains", entry.getValue().stream().map(WikiMonitorRule::domain).toList());
            dispatched.put("accepted", result.isAccepted());
            dispatched.put("dispatchId", result.getDispatchId());
            dispatched.put("status", result.getStatus());
            dispatched.put("message", result.getMessage());
            sweep.getDispatched().add(dispatched);
        }
        sweep.setStatus("completed");
        writeLastSweep(repoRoot, sweep);
        return sweep;
    }

    private SourceUpdateCheckResult runSourceUpdateMonitorCheck(Path repoRoot) {
        String timestamp = Instant.now(clock).toString();
        String logPath = "reports/crawler-monitor/source-update-monitor-check-"
            + timestamp.replaceAll("[^0-9A-Za-z]+", "-")
            + ".log";
        LaunchRequest request = new LaunchRequest(
            List.of(
                "node",
                "scripts/data/monitor/check-source-updates.mjs",
                "--state-file=" + WIKI_SOURCE_UPDATE_STATE_FILE.toString().replace('\\', '/'),
                "--manifest-path=data/generated/wiki-source-manifest.latest.json",
                "--progress-path=" + SOURCE_UPDATE_MONITOR_PROGRESS_FILE.toString().replace('\\', '/')
            ),
            repoRoot.toFile(),
            Map.of(
                "WORKTREE_ROOT", repoRoot.toString(),
                "TERRAPEDIA_CRAWLER_ACTION_ID", "source-update-monitor-check",
                "TERRAPEDIA_CRAWLER_PROGRESS_PATH", SOURCE_UPDATE_MONITOR_PROGRESS_FILE.toString().replace('\\', '/')
            ),
            repoRoot.resolve(logPath).normalize().toFile()
        );
        try {
            Process process = processLauncher.launch(request);
            int exitCode = process.waitFor();
            if (exitCode != 0) {
                return new SourceUpdateCheckResult(false, "source update monitor check exited with code " + exitCode);
            }
            return new SourceUpdateCheckResult(true, "source update monitor check completed");
        } catch (IOException exception) {
            return new SourceUpdateCheckResult(false, exception.getMessage());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return new SourceUpdateCheckResult(false, "source update monitor check interrupted");
        }
    }

    @Scheduled(fixedDelayString = "${terrapedia.crawler-monitor.auto-dispatch.poll-ms:60000}")
    public void scheduledAutoDispatchSweep() {
        try {
            CrawlerMonitorAutoDispatchDTO settings = readAutoDispatchSettings(resolveRepoRoot());
            if (!settings.isEnabled()) {
                return;
            }
            runAutoDispatchSweepOnce();
        } catch (RuntimeException exception) {
            log.warn("Crawler monitor auto-dispatch sweep failed: {}", exception.getMessage(), exception);
        }
    }

    @Scheduled(fixedDelayString = "${terrapedia.crawler-monitor.dispatch-queue.drain-poll-ms:15000}")
    public void scheduledWikiMonitorQueueDrainSweep() {
        try {
            drainWikiMonitorDispatchQueue("scheduled-drain");
        } catch (RuntimeException exception) {
            log.warn("Crawler monitor dispatch queue drain failed: {}", exception.getMessage(), exception);
        }
    }

    private void writeLastSweep(Path repoRoot, CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep) {
        LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
        payload.put("checkedAt", sweep.getCheckedAt());
        payload.put("status", sweep.getStatus());
        payload.put("detected", sweep.getDetected());
        payload.put("dispatched", sweep.getDispatched());
        payload.put("skipped", sweep.getSkipped());
        writeJsonFile(repoRoot.resolve(AUTO_DISPATCH_LAST_SWEEP_FILE).normalize(), payload);
    }

    private CrawlerMonitorAutoDispatchDTO normalizeAutoDispatchSettings(CrawlerMonitorAutoDispatchDTO settings) {
        CrawlerMonitorAutoDispatchDTO normalized = new CrawlerMonitorAutoDispatchDTO();
        normalized.setEnabled(settings != null && settings.isEnabled());
        normalized.setMode("changed-only");
        int interval = settings == null ? 60 : settings.getSweepIntervalMinutes();
        normalized.setSweepIntervalMinutes(Math.max(1, interval));
        return normalized;
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
        ReadResult worldContextFetchProgress = readProgressWithSharedFallback(repoRoot, WORLD_CONTEXT_FETCH_PROGRESS_FILE);
        ReadResult domainSourceBossesProgress = readJsonMap(repoRoot.resolve(DOMAIN_SOURCE_BOSSES_PROGRESS_FILE).normalize());
        ReadResult domainSourceArmorSetsProgress = readJsonMap(repoRoot.resolve(DOMAIN_SOURCE_ARMOR_SETS_PROGRESS_FILE).normalize());
        ReadResult domainSourceArmorAttributesProgress = readJsonMap(repoRoot.resolve(DOMAIN_SOURCE_ARMOR_ATTRIBUTES_PROGRESS_FILE).normalize());
        ReadResult domainSourceShimmerProgress = readJsonMap(repoRoot.resolve(DOMAIN_SOURCE_SHIMMER_PROGRESS_FILE).normalize());
        ReadResult domainSourceTownNpcMaintenanceProgress = readJsonMap(repoRoot.resolve(DOMAIN_SOURCE_TOWN_NPC_MAINTENANCE_PROGRESS_FILE).normalize());
        ReadResult wikiAudioAssetsProgress = readJsonMap(repoRoot.resolve(WIKI_AUDIO_ASSETS_PROGRESS_FILE).normalize());
        ReadResult domainSmokeProgress = readJsonMap(repoRoot.resolve(WIKI_MONITOR_DOMAIN_SMOKE_PROGRESS_FILE).normalize());
        ReadResult sourceUpdateMonitorProgress = readJsonMap(repoRoot.resolve(SOURCE_UPDATE_MONITOR_PROGRESS_FILE).normalize());
        ReadResult npcCoverage = readJsonMap(repoRoot.resolve(NPC_COVERAGE_REPORT).normalize());

        List<CrawlerMonitorOverviewDTO.RegisteredTaskDTO> tasks = new ArrayList<>();
        tasks.add(buildWikiCoreRefreshTask(repoRoot, latestRun));
        tasks.add(buildBuffFetchRefreshTask(repoRoot, buffFetchProgress));
        tasks.add(buildWorldContextFetchRefreshTask(repoRoot, worldContextFetchProgress));
        tasks.add(buildDomainSourceSnapshotTask(
            repoRoot,
            "domain-source-bosses",
            "Domain source: Bosses",
            DOMAIN_SOURCE_BOSSES_PROGRESS_FILE,
            "data/generated/wiki-bosses.latest.json",
            domainSourceBossesProgress
        ));
        tasks.add(buildDomainSourceSnapshotTask(
            repoRoot,
            "domain-source-armor-sets",
            "Domain source: Armor sets",
            DOMAIN_SOURCE_ARMOR_SETS_PROGRESS_FILE,
            "data/generated/wiki-armor-sets.latest.json",
            domainSourceArmorSetsProgress
        ));
        tasks.add(buildDomainSourceSnapshotTask(
            repoRoot,
            "domain-source-armor-attributes",
            "Domain source: Armor attributes",
            DOMAIN_SOURCE_ARMOR_ATTRIBUTES_PROGRESS_FILE,
            "data/generated/wiki-armor-attributes.latest.json",
            domainSourceArmorAttributesProgress
        ));
        tasks.add(buildDomainSourceSnapshotTask(
            repoRoot,
            "domain-source-shimmer",
            "Domain source: Shimmer",
            DOMAIN_SOURCE_SHIMMER_PROGRESS_FILE,
            "data/generated/shimmer/wiki-shimmer-manifest.latest.json",
            domainSourceShimmerProgress
        ));
        tasks.add(buildDomainSourceSnapshotTask(
            repoRoot,
            "domain-source-town-npc-maintenance",
            "Domain source: Town NPC maintenance",
            DOMAIN_SOURCE_TOWN_NPC_MAINTENANCE_PROGRESS_FILE,
            "data/generated/wiki-town-npc-maintenance.latest.json",
            domainSourceTownNpcMaintenanceProgress
        ));
        tasks.add(buildDomainSourceSnapshotTask(
            repoRoot,
            "wiki-audio-assets-refresh",
            "Wiki audio assets refresh",
            WIKI_AUDIO_ASSETS_PROGRESS_FILE,
            "data/terraPedia/generated/wiki-audio-assets.latest.json",
            wikiAudioAssetsProgress,
            "p1",
            "wiki allimages/imageinfo -> shared audio metadata",
            "Review audio metadata and keep DB/UI playback wiring in a separate task."
        ));
        tasks.add(buildItemPagesRefreshTask(repoRoot, itemProgress));
        tasks.add(buildWikiMonitorDomainSmokeTask(repoRoot, domainSmokeProgress));
        tasks.addAll(buildWikiMonitorDomainSmokeDomainTasks(repoRoot, domainSmokeProgress));
        tasks.add(buildDomainSourceSnapshotTask(
            repoRoot,
            "source-update-monitor-check",
            "Source update monitor check",
            SOURCE_UPDATE_MONITOR_PROGRESS_FILE,
            "data/generated/source-update-monitor.latest.json",
            sourceUpdateMonitorProgress,
            "p0",
            "wiki/API source fingerprints -> crawler monitor source state",
            "Review changed covered sources, then dispatch eligible refresh actions."
        ));
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
            findLatestReport(repoRoot, REPORTS_DIR, "normal-npc-loot-import-", ".json"),
            "reports/normal-npc-loot-import-*.json",
            "Validate restored normal NPC loot, then rerun relation health.",
            "restored loot evidence -> maint item sources"
        ));
        tasks.add(buildReportBackedTask(
            repoRoot,
            "boss-loot-backfill",
            "Boss loot backfill restore",
            "backfill",
            "p0",
            findLatestReport(repoRoot, REPORTS_DIR, "boss-loot-import-", ".json"),
            "reports/boss-loot-import-*.json",
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
        applyWikiMonitorControlState(repoRoot, tasks);
        return tasks;
    }

    private void applyWikiMonitorControlState(
        Path repoRoot,
        List<CrawlerMonitorOverviewDTO.RegisteredTaskDTO> tasks
    ) {
        ReadResult dispatchState = readJsonMap(repoRoot.resolve(WIKI_MONITOR_DISPATCH_FILE).normalize());
        if (!dispatchState.readable()) {
            return;
        }
        Map<String, Object> payload = dispatchState.payload();
        String actionId = asString(payload.get("actionId"));
        String status = asString(payload.get("status"));
        if (actionId == null || !isWikiMonitorDispatchTerminalStatus(status) && !"paused".equals(status)) {
            return;
        }
        for (CrawlerMonitorOverviewDTO.RegisteredTaskDTO task : tasks) {
            if (!actionId.equals(task.getId())) {
                continue;
            }
            task.setStatus(status);
            task.setProgressKind(progressKindForStatus(status));
            task.setProgressStale(false);
            task.setProgressStaleReason(null);
            task.setQueueState(firstNonBlank(asString(payload.get("message")), "dispatch " + status));
            task.setUpdatedAt(firstNonBlank(firstNonBlank(asString(payload.get("controlledAt")), asString(payload.get("completedAt"))), task.getUpdatedAt()));
            return;
        }
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
        applyBuffFetchOutputFallback(repoRoot, task);
        return task;
    }

    private void applyBuffFetchOutputFallback(Path repoRoot, CrawlerMonitorOverviewDTO.RegisteredTaskDTO task) {
        Path outputPath = resolvePayloadPathInsideRepo(repoRoot, task.getOutputPath());
        if (outputPath != null && Files.exists(outputPath)) {
            return;
        }
        Path cacheDir = repoRoot.resolve(BUFF_PAGE_EVIDENCE_CACHE_DIR).normalize();
        if (Files.isDirectory(cacheDir) && containsJsonFile(cacheDir)) {
            task.setOutputPath(toDisplayPath(repoRoot, cacheDir));
        }
    }

    private boolean containsJsonFile(Path directory) {
        try (Stream<Path> stream = Files.list(directory)) {
            return stream.anyMatch(path -> Files.isRegularFile(path)
                && path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".json"));
        } catch (IOException ignored) {
            return false;
        }
    }

    private CrawlerMonitorOverviewDTO.RegisteredTaskDTO buildWorldContextFetchRefreshTask(Path repoRoot, ReadResult progress) {
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO task = baseTask("world-contexts-refresh", "World contexts source refresh", "fetch", "p1");
        task.setProgressPath(toDisplayPath(repoRoot, progress));
        applyProgressFileMetadata(task, repoRoot, progress);
        task.setInputPath("wiki world context pages");
        task.setOutputPath("data/terraPedia/generated/wiki-world-contexts.latest.json");
        task.setReportPath("reports/wiki-world-contexts-summary-*.md");
        task.setDataStage("wiki pages -> generated world context source");

        if (!progress.found()) {
            task.setStatus("missing");
            task.setProgressKind("missing");
            task.setQueueState("progress file missing");
            task.setNextStep("Run scripts/data/fetch/fetch-wiki-world-contexts.mjs before transform/import.");
            return task;
        }
        if (!progress.readable()) {
            task.setStatus("blocked");
            task.setProgressKind("blocked");
            task.setQueueState(progress.errorMessage());
            task.setNextStep("Repair the unreadable world-context progress JSON before trusting completion state.");
            return task;
        }

        Map<String, Object> payload = progress.payload();
        task.setStatus(firstNonBlank(asString(payload.get("status")), "pending"));
        task.setQueueState(firstNonBlank(asString(payload.get("message")), task.getStatus()));
        task.setNextStep("Transform wiki-world-contexts.latest.json, dry-run import, then apply to terria_v1_local.world_contexts.");
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

    private CrawlerMonitorOverviewDTO.RegisteredTaskDTO buildDomainSourceSnapshotTask(
        Path repoRoot,
        String id,
        String label,
        Path progressPath,
        String outputPath,
        ReadResult progress
    ) {
        return buildDomainSourceSnapshotTask(
            repoRoot,
            id,
            label,
            progressPath,
            outputPath,
            progress,
            "p0",
            "wiki domain source pages -> generated source snapshot",
            "Review source snapshot output and report evidence before downstream domain gates."
        );
    }

    private CrawlerMonitorOverviewDTO.RegisteredTaskDTO buildDomainSourceSnapshotTask(
        Path repoRoot,
        String id,
        String label,
        Path progressPath,
        String outputPath,
        ReadResult progress,
        String priority,
        String dataStage,
        String defaultNextStep
    ) {
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO task = baseTask(id, label, "fetch", priority);
        task.setProgressPath(toDisplayPath(repoRoot, repoRoot.resolve(progressPath).normalize()));
        applyProgressFileMetadata(task, repoRoot, progress);
        task.setInputPath("wiki domain source pages");
        task.setOutputPath(outputPath);
        task.setDataStage(dataStage);

        if (!progress.found()) {
            task.setStatus("missing");
            task.setProgressKind("missing");
            task.setQueueState("progress file missing");
            task.setNextStep("Run the domain source snapshot fetch before downstream audit evidence.");
            return task;
        }
        if (!progress.readable()) {
            task.setStatus("blocked");
            task.setProgressKind("blocked");
            task.setQueueState(progress.errorMessage());
            task.setNextStep("Repair the unreadable domain source progress JSON before trusting completion state.");
            return task;
        }

        Map<String, Object> payload = progress.payload();
        task.setStatus(firstNonBlank(asString(payload.get("status")), "pending"));
        task.setQueueState(firstNonBlank(asString(payload.get("message")), firstNonBlank(asString(payload.get("phase")), task.getStatus())));
        task.setNextStep(firstNonBlank(
            asString(payload.get("nextStep")),
            defaultNextStep
        ));
        task.setUpdatedAt(firstNonBlank(asString(payload.get("lastHeartbeatAt")), asString(payload.get("generatedAt"))));
        copyTaskProgressFromPayload(task, payload);
        applyReadableProgressState(task);

        String reportPath = normalizePayloadPath(repoRoot, payload.get("reportPath"));
        if (reportPath != null && !reportPath.isBlank()) {
            task.setReportPath(reportPath);
        }
        String payloadOutputPath = normalizePayloadPath(repoRoot, payload.get("outputPath"));
        if (payloadOutputPath != null && !payloadOutputPath.isBlank()) {
            task.setOutputPath(payloadOutputPath);
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

    private CrawlerMonitorOverviewDTO.RegisteredTaskDTO buildWikiMonitorDomainSmokeTask(
        Path repoRoot,
        ReadResult progress
    ) {
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO task = baseTask(
            "wiki-monitor-domain-smoke",
            "Wiki monitor: 每域 10 条真实下载",
            "test",
            "manual"
        );
        task.setProgressPath(toDisplayPath(repoRoot, repoRoot.resolve(WIKI_MONITOR_DOMAIN_SMOKE_PROGRESS_FILE).normalize()));
        task.setInputPath("wiki API search/revisions");
        task.setOutputPath("reports/crawler-monitor/<run-id>/*.json");
        task.setDataStage("wiki API -> crawler-monitor smoke reports");
        task.setNextStep("Use the test page button to start a bounded smoke download when manual verification is needed.");
        applyProgressFileMetadata(task, repoRoot, progress);

        if (!progress.found()) {
            task.setStatus("missing");
            task.setProgressKind("missing");
            task.setQueueState("domain smoke progress file missing");
            return task;
        }
        if (!progress.readable()) {
            task.setStatus("blocked");
            task.setProgressKind("blocked");
            task.setQueueState(progress.errorMessage());
            return task;
        }

        Map<String, Object> payload = progress.payload();
        task.setStatus(firstNonBlank(asString(payload.get("status")), "pending"));
        task.setQueueState(firstNonBlank(asString(payload.get("message")), firstNonBlank(asString(payload.get("phase")), task.getStatus())));
        task.setUpdatedAt(firstNonBlank(asString(payload.get("lastHeartbeatAt")), asString(payload.get("generatedAt"))));
        copyTaskProgressFromPayload(task, payload);
        String reportPath = normalizePayloadPath(repoRoot, payload.get("reportPath"));
        if (reportPath != null && !reportPath.isBlank()) {
            task.setReportPath(reportPath);
        }
        String outputPath = normalizePayloadPath(repoRoot, payload.get("outputPath"));
        if (outputPath != null && !outputPath.isBlank()) {
            task.setOutputPath(outputPath);
        }
        applyReadableProgressState(task);
        return task;
    }

    private List<CrawlerMonitorOverviewDTO.RegisteredTaskDTO> buildWikiMonitorDomainSmokeDomainTasks(
        Path repoRoot,
        ReadResult progress
    ) {
        Map<String, Object> payload = progress.readable() ? progress.payload() : Collections.emptyMap();
        Map<String, Map<String, Object>> progressDomainsById = new LinkedHashMap<>();
        if (progress.readable()) {
            for (Map<String, Object> domain : asMapList(payload.get("domains"))) {
                String domainId = trimToNull(asString(domain.get("domain")));
                if (domainId != null) {
                    progressDomainsById.put(domainId, domain);
                }
            }
        }
        String aggregateProgressPath = toDisplayPath(repoRoot, repoRoot.resolve(WIKI_MONITOR_DOMAIN_SMOKE_PROGRESS_FILE).normalize());
        String aggregateReportPath = firstNonBlank(
            normalizePayloadPath(repoRoot, payload.get("reportPath")),
            toDisplayPath(repoRoot, repoRoot.resolve(CRAWLER_MONITOR_DIR).resolve("wiki-monitor-domain-smoke.latest.json").normalize())
        );
        String aggregateOutputPath = firstNonBlank(
            normalizePayloadPath(repoRoot, payload.get("outputPath")),
            toDisplayPath(repoRoot, repoRoot.resolve(CRAWLER_MONITOR_DIR).resolve("wiki-monitor-domain-smoke.latest").normalize())
        );
        String updatedAt = firstNonBlank(asString(payload.get("lastHeartbeatAt")), asString(payload.get("generatedAt")));
        List<CrawlerMonitorOverviewDTO.RegisteredTaskDTO> tasks = new ArrayList<>();
        for (String domainId : WIKI_MONITOR_DOMAIN_SMOKE_DOMAINS) {
            Map<String, Object> domain = progressDomainsById.getOrDefault(domainId, Collections.emptyMap());
            String actionId = firstNonBlank(asString(domain.get("actionId")), "wiki-monitor-domain-smoke:" + domainId);
            String label = firstNonBlank(asString(domain.get("label")), wikiMonitorDomainLabel(domainId));
            CrawlerMonitorOverviewDTO.RegisteredTaskDTO task = baseTask(
                actionId,
                "样本爬取：" + label,
                "test",
                "manual"
            );
            task.setProgressPath(firstNonBlank(normalizePayloadPath(repoRoot, domain.get("progressPath")), aggregateProgressPath));
            task.setReportPath(firstNonBlank(normalizePayloadPath(repoRoot, domain.get("reportPath")), aggregateReportPath));
            task.setOutputPath(firstNonBlank(
                normalizePayloadPath(repoRoot, domain.get("outputPath")),
                domainOutputPath(aggregateOutputPath, domainId)
            ));
            task.setInputPath("wiki API search/revisions");
            task.setDataStage("wiki API -> crawler-monitor smoke reports -> " + domainId + " sample");
            task.setNextStep("Open the domain sample output/report to verify the 10 downloaded records.");
            task.setStatus(firstNonBlank(asString(domain.get("status")), progress.found() ? "pending" : "missing"));
            task.setQueueState(firstNonBlank(asString(domain.get("message")), domainSmokeDomainMessage(domainId, domain)));
            task.setUpdatedAt(updatedAt);
            task.setProgressSource(aggregateProgressPath);
            task.setProgressFound(progress.found());
            task.setProgressReadable(progress.readable());
            if (!progress.readable() && progress.errorMessage() != null) {
                task.setProgressErrorMessage(progress.errorMessage());
            }
            task.setProgressUpdatedAt(readLastModifiedIso(progress.path()));
            task.setProgressHeartbeatAt(updatedAt);
            Instant heartbeatAt = parseInstant(updatedAt);
            if (heartbeatAt != null) {
                task.setProgressHeartbeatAgeMs(Math.max(0L, Duration.between(heartbeatAt, Instant.now(clock)).toMillis()));
            }
            task.setProgressPayload(new LinkedHashMap<>(domain));
            copyTaskProgressFromPayload(task, domain);
            if (task.getCurrent() == null) {
                task.setCurrent(firstNonNullLong(asNullableLong(domain.get("actualCount")), 0L));
            }
            if (task.getTotal() == null) {
                task.setTotal(firstNonNullLong(firstNonNullLong(asNullableLong(domain.get("total")), asNullableLong(domain.get("limit"))), (long) WIKI_MONITOR_DOMAIN_SMOKE_LIMIT));
            }
            task.setPercent(firstNonNull(
                task.getPercent(),
                derivePercent(task.getOverallCurrent(), task.getOverallTotal(), task.getCurrent(), task.getTotal())
            ));
            task.setPending(computePending(task.getOverallCurrent(), task.getOverallTotal(), task.getCurrent(), task.getTotal()));
            applyReadableProgressState(task);
            if ("completed".equals(task.getStatus())) {
                task.setProgressKind("report-only");
            }
            tasks.add(task);
        }
        return tasks;
    }

    private String wikiMonitorDomainLabel(String domainId) {
        return WIKI_MONITOR_RULES.stream()
            .filter(rule -> rule.domain().equals(domainId))
            .map(WikiMonitorRule::label)
            .findFirst()
            .orElse(domainId);
    }

    private String domainSmokeDomainMessage(String domainId, Map<String, Object> domain) {
        Long current = firstNonNullLong(asNullableLong(domain.get("current")), asNullableLong(domain.get("actualCount")));
        Long total = firstNonNullLong(asNullableLong(domain.get("total")), asNullableLong(domain.get("limit")));
        if (current != null && total != null) {
            return domainId + " 样本" + ("completed".equals(asString(domain.get("status"))) ? "完成" : "进度") + " " + current + "/" + total;
        }
        if (domain.isEmpty()) {
            return domainId + " 样本等待运行 0/" + WIKI_MONITOR_DOMAIN_SMOKE_LIMIT;
        }
        return domainId + " 样本进度";
    }

    private String domainOutputPath(String aggregateOutputPath, String domainId) {
        if (aggregateOutputPath == null || aggregateOutputPath.isBlank()) {
            return null;
        }
        return aggregateOutputPath.replaceAll("/+$", "") + "/" + domainId + ".json";
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
        task.setProgressPayload(new LinkedHashMap<>(progress.payload()));

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

    private Long firstNonNullLong(Long first, Long second) {
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

    private List<Map<String, Object>> asMapList(Object value) {
        if (!(value instanceof List<?> list)) {
            return new ArrayList<>();
        }
        return list.stream()
            .filter(Map.class::isInstance)
            .map(this::asMap)
            .toList();
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

    private int asInt(Object value, int fallback) {
        Long parsed = asNullableLong(value);
        if (parsed == null) {
            return fallback;
        }
        return parsed.intValue();
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

    private static WikiMonitorRule backendRule(String domain, String label, String sourceKey, String locator, String actionId) {
        return new WikiMonitorRule(
            domain,
            label,
            sourceKey,
            locator,
            actionId,
            backendProgressTemplate(actionId),
            List.of("node", "scripts/data/workflow/run-backend-data-refresh.mjs", "--mode=apply", "--steps=" + actionId, "--output=<reportPath>"),
            true,
            true
        );
    }

    private static WikiMonitorRule directRule(
        String domain,
        String label,
        String sourceKey,
        String locator,
        String actionId,
        String progressPath,
        List<String> command
    ) {
        return new WikiMonitorRule(domain, label, sourceKey, locator, actionId, progressPath, command, false, true);
    }

    private static WikiMonitorRule operationalBackendRule(String domain, String label, String sourceKey, String locator, String actionId) {
        return new WikiMonitorRule(
            domain,
            label,
            sourceKey,
            locator,
            actionId,
            backendProgressTemplate(actionId),
            List.of("node", "scripts/data/workflow/run-backend-data-refresh.mjs", "--mode=apply", "--steps=" + actionId, "--output=<reportPath>"),
            true,
            false
        );
    }

    private static String backendProgressTemplate(String actionId) {
        return "reports/backend-refresh/history/<run>.runtime/" + actionId + ".child-status.json";
    }

    private Map<String, Object> copyObjectMap(Map<?, ?> raw) {
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : raw.entrySet()) {
            result.put(String.valueOf(entry.getKey()), entry.getValue());
        }
        return result;
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

    record WikiMonitorRule(
        String domain,
        String label,
        String sourceKey,
        String locator,
        String actionId,
        String progressPath,
        List<String> command,
        boolean backendRefresh,
        boolean wikiDomain
    ) {}

    record DispatchPaths(String reportPath, String progressPath, String lockPath, String outputPath, String logPath) {}

    record ActiveDispatchProcess(String dispatchId, String domain, String actionId, Process process, DispatchPaths paths) {}

    record LaunchRequest(List<String> command, File directory, Map<String, String> environment, File logFile) {}

    record SourceUpdateCheckResult(boolean success, String message) {}

    record LegacyProcessRequest(String actionId, Path repoRoot, List<String> commandNeedles, long minStartEpochMillis) {}

    private static class DispatchPlanAccumulator {
        private final String actionId;
        private final String advisoryNote;
        private final List<String> coveredDomains = new ArrayList<>();
        private final List<String> changedDomains = new ArrayList<>();
        private final List<String> fullRefetchDomains = new ArrayList<>();

        private DispatchPlanAccumulator(String actionId, String advisoryNote) {
            this.actionId = actionId;
            this.advisoryNote = advisoryNote;
        }
    }

    interface ProcessLauncher {
        Process launch(LaunchRequest request) throws IOException;

        default Process findLegacyProcess(LegacyProcessRequest request) {
            if (request == null || request.actionId() == null || request.commandNeedles().isEmpty()) {
                return null;
            }
            Path repoRoot = request.repoRoot().toAbsolutePath().normalize();
            return ProcessHandle.allProcesses()
                .filter(ProcessHandle::isAlive)
                .filter(handle -> processStartedAtOrAfter(handle, request.minStartEpochMillis()))
                .filter(handle -> processCwdMatches(handle, repoRoot))
                .filter(handle -> commandMatches(handle, request.commandNeedles()))
                .map(handle -> handle.pid())
                .map(ProcessLauncher::processFromPid)
                .filter(Objects::nonNull)
                .findFirst()
                .orElse(null);
        }

        private static boolean processStartedAtOrAfter(ProcessHandle handle, long minStartEpochMillis) {
            if (minStartEpochMillis <= 0L) {
                return true;
            }
            Optional<Instant> start = handle.info().startInstant();
            return start.isEmpty() || !start.get().isBefore(Instant.ofEpochMilli(minStartEpochMillis));
        }

        default boolean pause(Process process) {
            return sendSignal(process, "STOP");
        }

        default boolean resume(Process process) {
            return sendSignal(process, "CONT");
        }

        default boolean destroy(Process process) {
            if (process == null || !process.isAlive()) {
                return false;
            }
            try {
                boolean sent = true;
                List<ProcessHandle> handles = Stream.concat(process.toHandle().descendants(), Stream.of(process.toHandle()))
                    .filter(ProcessHandle::isAlive)
                    .toList();
                log.warn("Destroying wiki monitor dispatch process tree: pids={}",
                    handles.stream().map(ProcessHandle::pid).toList());
                for (ProcessHandle handle : handles) {
                    sendSignal(handle, "CONT");
                }
                for (ProcessHandle handle : handles) {
                    sent = handle.destroy() && sent;
                }
                return sent;
            } catch (IOException | InterruptedException | UnsupportedOperationException exception) {
                if (exception instanceof InterruptedException) {
                    Thread.currentThread().interrupt();
                }
                return false;
            }
        }

        private static boolean sendSignal(Process process, String signal) {
            if (process == null || !process.isAlive()) {
                return false;
            }
            try {
                boolean sent = true;
                List<ProcessHandle> handles = Stream.concat(process.toHandle().descendants(), Stream.of(process.toHandle()))
                    .filter(ProcessHandle::isAlive)
                    .toList();
                log.info("Signalling wiki monitor dispatch process tree with {}: pids={}",
                    signal, handles.stream().map(ProcessHandle::pid).toList());
                for (ProcessHandle handle : handles) {
                    sent = sendSignal(handle, signal) && sent;
                }
                return sent;
            } catch (IOException | InterruptedException | UnsupportedOperationException exception) {
                if (exception instanceof InterruptedException) {
                    Thread.currentThread().interrupt();
                }
                return false;
            }
        }

        private static boolean sendSignal(ProcessHandle handle, String signal) throws IOException, InterruptedException {
            Process signalProcess = new ProcessBuilder("kill", "-" + signal, Long.toString(handle.pid())).start();
            return signalProcess.waitFor() == 0;
        }

        private static boolean processCwdMatches(ProcessHandle handle, Path repoRoot) {
            try {
                Path cwd = Path.of("/proc", Long.toString(handle.pid()), "cwd").toRealPath();
                return cwd.equals(repoRoot);
            } catch (IOException | RuntimeException exception) {
                return false;
            }
        }

        private static boolean commandMatches(ProcessHandle handle, List<String> needles) {
            try {
                String cmdline = Files.readString(Path.of("/proc", Long.toString(handle.pid()), "cmdline")).replace('\0', ' ');
                return needles.stream().allMatch(cmdline::contains);
            } catch (IOException | RuntimeException exception) {
                return false;
            }
        }

        private static Process processFromPid(long pid) {
            try {
                return ProcessHandle.of(pid).map(HandleBackedProcess::new).orElse(null);
            } catch (RuntimeException exception) {
                return null;
            }
        }
    }

    private static class HandleBackedProcess extends Process {
        private final ProcessHandle handle;

        HandleBackedProcess(ProcessHandle handle) {
            this.handle = handle;
        }

        @Override
        public OutputStream getOutputStream() {
            return OutputStream.nullOutputStream();
        }

        @Override
        public InputStream getInputStream() {
            return InputStream.nullInputStream();
        }

        @Override
        public InputStream getErrorStream() {
            return InputStream.nullInputStream();
        }

        @Override
        public int waitFor() throws InterruptedException {
            while (isAlive()) {
                Thread.sleep(100L);
            }
            return exitValue();
        }

        @Override
        public int exitValue() {
            if (handle.isAlive()) {
                throw new IllegalThreadStateException("process still running");
            }
            return 0;
        }

        @Override
        public void destroy() {
            handle.destroy();
        }

        @Override
        public boolean isAlive() {
            return handle.isAlive();
        }

        @Override
        public long pid() {
            return handle.pid();
        }

        @Override
        public ProcessHandle toHandle() {
            return handle;
        }
    }

    private static class ProcessBuilderLauncher implements ProcessLauncher {
        @Override
        public Process launch(LaunchRequest request) throws IOException {
            ProcessBuilder builder = new ProcessBuilder(request.command());
            builder.directory(request.directory());
            builder.environment().putAll(request.environment());
            File logFile = request.logFile();
            if (logFile != null) {
                Files.createDirectories(logFile.toPath().getParent());
                builder.redirectOutput(ProcessBuilder.Redirect.to(logFile));
                builder.redirectError(ProcessBuilder.Redirect.appendTo(logFile));
            }
            return builder.start();
        }
    }
}

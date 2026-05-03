package com.terraria.skills.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.terraria.skills.dto.DomainAcceptanceOverviewDTO;
import com.terraria.skills.service.DomainAcceptanceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Stream;

@Service
public class DomainAcceptanceServiceImpl implements DomainAcceptanceService {

    private static final Path REGISTRY_PATH = Path.of("scripts", "data", "workflow", "domain-acceptance-registry.json");
    private static final Set<String> KNOWN_BACKEND_REFRESH_STEP_IDS = Set.of(
        "wiki-core-refresh",
        "item-pages-refresh",
        "recipe-reference-sync",
        "item-detail-sync",
        "boss-sync",
        "biome-sync",
        "town-npc-sync",
        "independent-entity-sync",
        "shimmer-sync",
        "support-sync"
    );
    private static final Set<String> PUBLIC_EXPOSURE_VALUES = Set.of("public", "planned-public", "admin-only");
    private static final List<Pattern> UNSAFE_COMMAND_PATTERNS = List.of(
        Pattern.compile("--apply=true", Pattern.CASE_INSENSITIVE),
        Pattern.compile("--mode=apply", Pattern.CASE_INSENSITIVE),
        Pattern.compile("\\bimport\\b", Pattern.CASE_INSENSITIVE),
        Pattern.compile("\\bbackfill\\b", Pattern.CASE_INSENSITIVE),
        Pattern.compile("\\bapply\\b", Pattern.CASE_INSENSITIVE),
        Pattern.compile("\\bdelete\\b", Pattern.CASE_INSENSITIVE),
        Pattern.compile("\\bremove\\b", Pattern.CASE_INSENSITIVE),
        Pattern.compile("\\brm\\b", Pattern.CASE_INSENSITIVE),
        Pattern.compile("\\bcrawl\\b", Pattern.CASE_INSENSITIVE),
        Pattern.compile("\\bload\\b", Pattern.CASE_INSENSITIVE)
    );

    private final ObjectMapper objectMapper;
    private final Path repoRootOverride;
    private final Clock clock;

    @Autowired
    public DomainAcceptanceServiceImpl(ObjectMapper objectMapper) {
        this(objectMapper, null, Clock.systemUTC());
    }

    DomainAcceptanceServiceImpl(ObjectMapper objectMapper, Path repoRootOverride, Clock clock) {
        this.objectMapper = objectMapper;
        this.repoRootOverride = repoRootOverride == null ? null : repoRootOverride.toAbsolutePath().normalize();
        this.clock = clock == null ? Clock.systemUTC() : clock;
    }

    @Override
    public DomainAcceptanceOverviewDTO getOverview() {
        Path repoRoot = resolveRepoRoot();
        RegistryDefinition registry = loadRegistry(repoRoot);
        DomainAcceptanceOverviewDTO overview = new DomainAcceptanceOverviewDTO();
        overview.setGeneratedAt(Instant.now(clock));

        for (DomainDefinition domain : registry.domains) {
            overview.getDomains().add(buildDomain(repoRoot, registry, domain));
        }

        aggregateOverview(overview);
        return overview;
    }

    private DomainAcceptanceOverviewDTO.DomainDTO buildDomain(
        Path repoRoot,
        RegistryDefinition registry,
        DomainDefinition definition
    ) {
        DomainAcceptanceOverviewDTO.DomainDTO domain = new DomainAcceptanceOverviewDTO.DomainDTO();
        validatePublicExposure(definition);
        domain.setDomainId(definition.domainId);
        domain.setDomainType(definition.domainType);
        domain.setTier(definition.tier);
        domain.setChainStage(definition.chainStage);
        domain.setManagementRoute(definition.managementRoute);
        domain.setPublicExposure(definition.publicExposure);
        domain.setPublicRoute(definition.publicRoute);
        List<String> backendRefreshStepIds = backendRefreshStepIds(definition);
        domain.setBackendRefreshStepIds(backendRefreshStepIds);
        domain.setBackendRefreshPlanCommand(backendRefreshPlanCommand(backendRefreshStepIds));
        for (String panelId : resolvePanelSet(registry, definition)) {
            PanelDefinition panelDefinition = registry.panels.get(panelId);
            if (panelDefinition == null) {
                throw new IllegalStateException("Missing domain acceptance panel definition: " + panelId);
            }
            domain.getPanels().add(readPanel(
                repoRoot,
                definition.domainId,
                backendRefreshStepIds,
                panelDefinition,
                registry.freshness
            ));
        }
        aggregateDomain(domain);
        return domain;
    }

    private void validatePublicExposure(DomainDefinition definition) {
        if (definition.publicExposure == null || definition.publicExposure.isBlank()) {
            throw new IllegalStateException("Missing publicExposure for " + definition.domainId);
        }
        if (!PUBLIC_EXPOSURE_VALUES.contains(definition.publicExposure)) {
            throw new IllegalStateException("Unknown publicExposure for " + definition.domainId + ": " + definition.publicExposure);
        }
        boolean hasPublicRoute = hasPublicRoute(definition.publicRoute);
        if ("support".equals(definition.domainType) && !"admin-only".equals(definition.publicExposure)) {
            throw new IllegalStateException("Support domain must be admin-only: " + definition.domainId);
        }
        if ("public".equals(definition.publicExposure) && !hasPublicRoute) {
            throw new IllegalStateException("Public domain must declare publicRoute: " + definition.domainId);
        }
        if ("planned-public".equals(definition.publicExposure) && hasPublicRoute) {
            throw new IllegalStateException("Planned-public domain must not declare publicRoute before promotion: " + definition.domainId);
        }
        if ("admin-only".equals(definition.publicExposure) && hasPublicRoute) {
            throw new IllegalStateException("Admin-only domain must not declare publicRoute: " + definition.domainId);
        }
        if ("product".equals(definition.domainType) && "admin-only".equals(definition.publicExposure)) {
            throw new IllegalStateException("Product domain must be public or planned-public: " + definition.domainId);
        }
    }

    private DomainAcceptanceOverviewDTO.DomainPanelDTO readPanel(
        Path repoRoot,
        String domainId,
        List<String> backendRefreshStepIds,
        PanelDefinition definition,
        FreshnessDefinition freshness
    ) {
        DomainAcceptanceOverviewDTO.DomainPanelDTO panel = basePanel(domainId, backendRefreshStepIds, definition, freshness);
        Path reportsRoot = repoRoot.resolve("reports").resolve("domain").normalize();
        Path dir = reportsRoot.resolve(domainId).normalize();
        if (!dir.startsWith(reportsRoot)) {
            return blockedPanel(panel, "Report directory is outside the domain reports allowlist.");
        }
        if (!Files.isDirectory(dir, LinkOption.NOFOLLOW_LINKS)) {
            return missingPanel(panel);
        }

        Path reportPath;
        try {
            reportPath = findLatestReport(dir, definition.fileKey, ".json");
            if (reportPath == null) {
                return missingPanel(panel);
            }
        } catch (IOException exception) {
            return blockedPanel(panel, exception.getMessage());
        }

        panel.setFound(true);
        panel.setReadable(true);
        panel.setReportPath(toDisplayPath(repoRoot, reportPath));
        panel.setGeneratedAt(readLastModifiedInstant(reportPath));
        panel.setUpdatedAt(formatInstant(panel.getGeneratedAt()));

        try {
            JsonNode root = objectMapper.readTree(reportPath.toFile());
            Instant generatedAt = parseInstant(text(root.path("generatedAt")));
            if (generatedAt != null) {
                panel.setGeneratedAt(generatedAt);
                panel.setUpdatedAt(formatInstant(generatedAt));
            }
            fillReportFields(root, panel);
            ensureStatus(panel);
            applyReportFreshness(panel);
            return panel;
        } catch (IOException exception) {
            panel.setReadable(false);
            panel.setStatus("blocked");
            panel.setBlockingCount(1);
            panel.setWarningCount(0);
            panel.setErrorMessage(exception.getMessage());
            applyBlockedFreshness(panel);
            return panel;
        }
    }

    private void fillReportFields(JsonNode root, DomainAcceptanceOverviewDTO.DomainPanelDTO panel) {
        JsonNode summary = root.path("summary");
        int blockingCount = intValue(summary.path("blockingCount"));
        if (blockingCount == 0) {
            blockingCount = arraySize(root.path("blockingReasons"));
        }
        int warningCount = intValue(summary.path("warningCount"));
        if (warningCount == 0) {
            warningCount = arraySize(root.path("warningReasons"));
        }
        panel.setBlockingCount(blockingCount);
        panel.setWarningCount(warningCount);
        panel.setRawSummary(toMap(summary));
        panel.setChecks(toChecks(root.path("checks")));
        panel.getMetrics().put("checkCount", panel.getChecks().size());
        panel.getMetrics().put("blockingReasonCount", arraySize(root.path("blockingReasons")));
        panel.getMetrics().put("warningReasonCount", arraySize(root.path("warningReasons")));

        if (blockingCount > 0 || hasCheckStatus(panel.getChecks(), List.of("fail", "error", "blocked"))) {
            panel.setStatus("blocked");
        } else if (warningCount > 0 || hasCheckStatus(panel.getChecks(), List.of("warn", "warning"))) {
            panel.setStatus("warning");
        } else {
            panel.setStatus(statusFromRaw(text(root.path("status"))));
        }
    }

    private void aggregateDomain(DomainAcceptanceOverviewDTO.DomainDTO domain) {
        int blockingCount = 0;
        int warningCount = 0;
        int missingCount = 0;
        for (DomainAcceptanceOverviewDTO.DomainPanelDTO panel : domain.getPanels()) {
            if (Boolean.TRUE.equals(panel.getRequiresDatabase())) {
                domain.setRequiresDatabase(true);
            }
            if ("blocked".equals(panel.getStatus())) {
                blockingCount += positiveOrOne(panel.getBlockingCount());
            } else if ("warning".equals(panel.getStatus())) {
                warningCount += positiveOrOne(panel.getWarningCount());
            } else if ("missing".equals(panel.getStatus())) {
                missingCount++;
            }
        }
        domain.setPanelCount(domain.getPanels().size());
        domain.setBlockingCount(blockingCount);
        domain.setWarningCount(warningCount);
        domain.setMissingCount(missingCount);
        if (domain.getRequiresDatabase() == null) {
            domain.setRequiresDatabase(false);
        }
        if (blockingCount > 0) {
            domain.setStatus("blocked");
        } else if (warningCount > 0) {
            domain.setStatus("warning");
        } else if (missingCount > 0) {
            domain.setStatus("missing");
        } else {
            domain.setStatus("pass");
        }
        applyPublicGate(domain);
    }

    private void applyPublicGate(DomainAcceptanceOverviewDTO.DomainDTO domain) {
        String exposure = firstNonBlank(domain.getPublicExposure(), "admin-only");
        if ("admin-only".equals(exposure)) {
            domain.setPublicGateStatus("admin_only");
            domain.setPublicGateReason(null);
            return;
        }
        if ("planned-public".equals(exposure)) {
            domain.setPublicGateStatus("planned_public_no_route");
            domain.setPublicGateReason("public route is planned but not yet configured");
            return;
        }
        DomainAcceptanceOverviewDTO.DomainPanelDTO missingPublicRoutePanel = domain.getPanels().stream()
            .filter(panel -> Boolean.TRUE.equals(panel.getBlockingBeforePublic()))
            .filter(panel -> "public".equals(panel.getChainStage()))
            .findFirst()
            .orElse(null);
        if (!hasPublicRoute(domain.getPublicRoute()) && missingPublicRoutePanel != null) {
            domain.setPublicGateStatus("public_route_missing");
            domain.setPublicGateReason(panelKey(domain, missingPublicRoutePanel)
                + " is blocking before public consumption but has no public route");
            return;
        }
        if ("public".equals(exposure) && hasPublicRoute(domain.getPublicRoute())) {
            domain.setPublicGateStatus("public_route_configured");
            domain.setPublicGateReason(null);
            return;
        }
        domain.setPublicGateStatus("public_route_missing");
        domain.setPublicGateReason(domain.getDomainId() + " has public exposure but no public route");
    }

    private boolean hasPublicRoute(String publicRoute) {
        return publicRoute != null && !publicRoute.isBlank();
    }

    private void aggregateOverview(DomainAcceptanceOverviewDTO overview) {
        int blockingCount = 0;
        int warningCount = 0;
        int missingCount = 0;
        int panelCount = 0;
        int freshCount = 0;
        int staleCount = 0;
        int unknownCount = 0;

        for (DomainAcceptanceOverviewDTO.DomainDTO domain : overview.getDomains()) {
            panelCount += domain.getPanelCount();
            blockingCount += domain.getBlockingCount();
            warningCount += domain.getWarningCount();
            missingCount += domain.getMissingCount();
            for (DomainAcceptanceOverviewDTO.DomainPanelDTO panel : domain.getPanels()) {
                if ("blocked".equals(panel.getStatus())) {
                    overview.getBlockingReasons().add(reason(domain, panel, "blocked"));
                } else if ("warning".equals(panel.getStatus())) {
                    overview.getWarningReasons().add(reason(domain, panel, "warning"));
                }
                if ("fresh".equals(panel.getFreshnessStatus())) {
                    freshCount++;
                } else if ("stale".equals(panel.getFreshnessStatus())) {
                    staleCount++;
                } else if ("unknown".equals(panel.getFreshnessStatus())) {
                    unknownCount++;
                }
            }
        }

        overview.setDomainCount(overview.getDomains().size());
        overview.setPanelCount(panelCount);
        overview.setBlockingCount(blockingCount);
        overview.setWarningCount(warningCount);
        overview.setMissingCount(missingCount);
        overview.getSummary().put("domainCount", overview.getDomainCount());
        overview.getSummary().put("panelCount", overview.getPanelCount());
        overview.getSummary().put("freshCount", freshCount);
        overview.getSummary().put("staleCount", staleCount);
        overview.getSummary().put("missingCount", missingCount);
        overview.getSummary().put("unknownCount", unknownCount);
        overview.getSummary().put("unsafeCommandCount", 0);
        buildRefreshPlanProjection(overview);

        if (blockingCount > 0) {
            overview.setOverallStatus("blocked");
        } else if (warningCount > 0) {
            overview.setOverallStatus("warning");
        } else if (missingCount > 0) {
            overview.setOverallStatus("missing");
        } else {
            overview.setOverallStatus("pass");
        }
    }

    private void buildRefreshPlanProjection(DomainAcceptanceOverviewDTO overview) {
        List<DomainAcceptanceOverviewDTO.DomainRefreshActionDTO> actionQueue = new ArrayList<>();
        for (DomainAcceptanceOverviewDTO.DomainDTO domain : overview.getDomains()) {
            for (DomainAcceptanceOverviewDTO.DomainPanelDTO panel : domain.getPanels()) {
                if (needsRefreshAction(panel)) {
                    actionQueue.add(refreshAction(domain, panel));
                }
            }
        }
        overview.setActionQueue(actionQueue);
        overview.setRefreshPlanSummary(refreshPlanSummary(actionQueue));
    }

    private boolean needsRefreshAction(DomainAcceptanceOverviewDTO.DomainPanelDTO panel) {
        String freshnessStatus = panel == null ? null : panel.getFreshnessStatus();
        return "missing".equals(freshnessStatus)
            || "stale".equals(freshnessStatus)
            || "unknown".equals(freshnessStatus);
    }

    private DomainAcceptanceOverviewDTO.DomainRefreshActionDTO refreshAction(
        DomainAcceptanceOverviewDTO.DomainDTO domain,
        DomainAcceptanceOverviewDTO.DomainPanelDTO panel
    ) {
        DomainAcceptanceOverviewDTO.DomainRefreshActionDTO action = new DomainAcceptanceOverviewDTO.DomainRefreshActionDTO();
        action.setDomainId(domain.getDomainId());
        action.setPanelId(panel.getPanelId());
        action.setFreshnessStatus(panel.getFreshnessStatus());
        action.setReason(firstNonBlank(
            panel.getFreshnessReason(),
            domain.getDomainId() + "/" + panel.getPanelId() + " evidence is " + panel.getFreshnessStatus()
        ));
        action.setCommand(panel.getNextEvidenceCommand());
        action.setCommandRisk(commandRisk(panel));
        action.setRequiresDatabase(Boolean.TRUE.equals(panel.getRequiresDatabase()));
        action.setWritesDatabase(Boolean.TRUE.equals(panel.getWritesDatabase()));
        action.setMaintenanceLane(firstNonBlank(panel.getMaintenanceLane(), "domain-acceptance-evidence"));
        action.setMaintenanceLaneId(firstNonBlank(
            panel.getMaintenanceLaneId(),
            "domain-acceptance:" + domain.getDomainId() + ":" + panel.getPanelId()
        ));
        action.setBackendRefreshStepIds(new ArrayList<>(panel.getBackendRefreshStepIds()));
        action.setBackendRefreshPlanCommand(panel.getBackendRefreshPlanCommand());
        action.setExecutionPolicy("plan-only");
        String blockedReason = blockedReason(domain, panel, action);
        String confirmationReason = confirmationReason(domain, panel, action);
        action.setBlockedReason(blockedReason);
        action.setConfirmationReason(confirmationReason);
        action.setStatus(actionStatus(blockedReason, confirmationReason));
        action.setManualConfirmation("needs_confirmation".equals(action.getStatus()));
        action.setBlockingBeforePublic(blockingBeforePublic(panel, action));
        action.setBlockingBeforePublicReason(blockingBeforePublicReason(domain, panel, action));
        action.setAutoMaintenanceEligible(autoMaintenanceEligible(panel, action));
        action.setExecuteMode("manual");
        return action;
    }

    private String commandRisk(DomainAcceptanceOverviewDTO.DomainPanelDTO panel) {
        String command = panel.getNextEvidenceCommand();
        if (command == null || command.isBlank()) {
            return "unknown";
        }
        if (UNSAFE_COMMAND_PATTERNS.stream().anyMatch(pattern -> pattern.matcher(command).find())) {
            return "unsafe";
        }
        return "safe-read-only";
    }

    private String actionStatus(String blockedReason, String confirmationReason) {
        if (blockedReason != null) {
            return "blocked";
        }
        if (confirmationReason != null) {
            return "needs_confirmation";
        }
        return "ready";
    }

    private String blockedReason(
        DomainAcceptanceOverviewDTO.DomainDTO domain,
        DomainAcceptanceOverviewDTO.DomainPanelDTO panel,
        DomainAcceptanceOverviewDTO.DomainRefreshActionDTO action
    ) {
        String key = panelKey(domain, panel);
        if ("unsafe".equals(action.getCommandRisk())) {
            return key + " generator command is unsafe";
        }
        if (Boolean.TRUE.equals(action.getWritesDatabase())) {
            return key + " generator command writes database";
        }
        if (action.getCommand() == null || action.getCommand().isBlank()) {
            return key + " evidence command is missing";
        }
        return null;
    }

    private String confirmationReason(
        DomainAcceptanceOverviewDTO.DomainDTO domain,
        DomainAcceptanceOverviewDTO.DomainPanelDTO panel,
        DomainAcceptanceOverviewDTO.DomainRefreshActionDTO action
    ) {
        String key = panelKey(domain, panel);
        if ("unknown".equals(action.getCommandRisk())) {
            return key + " command risk is unknown";
        }
        if ("unknown".equals(panel.getFreshnessStatus())) {
            return key + " evidence is unknown";
        }
        if (Boolean.TRUE.equals(action.getRequiresDatabase())) {
            return key + " requires local database confirmation";
        }
        return null;
    }

    private boolean autoMaintenanceEligible(
        DomainAcceptanceOverviewDTO.DomainPanelDTO panel,
        DomainAcceptanceOverviewDTO.DomainRefreshActionDTO action
    ) {
        return Boolean.TRUE.equals(panel.getAutoMaintenanceAllowed())
            && "ready".equals(action.getStatus())
            && "safe-read-only".equals(action.getCommandRisk())
            && !Boolean.TRUE.equals(action.getRequiresDatabase())
            && !Boolean.TRUE.equals(action.getWritesDatabase())
            && action.getBackendRefreshStepIds() != null
            && !action.getBackendRefreshStepIds().isEmpty();
    }

    private boolean blockingBeforePublic(
        DomainAcceptanceOverviewDTO.DomainPanelDTO panel,
        DomainAcceptanceOverviewDTO.DomainRefreshActionDTO action
    ) {
        return action.getBlockedReason() != null
            || "unknown".equals(panel.getFreshnessStatus())
            || Boolean.TRUE.equals(panel.getBlockingBeforePublic());
    }

    private String blockingBeforePublicReason(
        DomainAcceptanceOverviewDTO.DomainDTO domain,
        DomainAcceptanceOverviewDTO.DomainPanelDTO panel,
        DomainAcceptanceOverviewDTO.DomainRefreshActionDTO action
    ) {
        if (!Boolean.TRUE.equals(action.getBlockingBeforePublic())) {
            return null;
        }
        if (action.getBlockedReason() != null) {
            return action.getBlockedReason();
        }
        if ("unknown".equals(panel.getFreshnessStatus())) {
            return panelKey(domain, panel) + " evidence freshness is unknown";
        }
        return panelKey(domain, panel) + " is marked as blocking before public consumption";
    }

    private String panelKey(DomainAcceptanceOverviewDTO.DomainDTO domain, DomainAcceptanceOverviewDTO.DomainPanelDTO panel) {
        return (domain == null ? panel.getDomainId() : domain.getDomainId()) + "/" + panel.getPanelId();
    }

    private DomainAcceptanceOverviewDTO.RefreshPlanSummaryDTO refreshPlanSummary(
        List<DomainAcceptanceOverviewDTO.DomainRefreshActionDTO> actions
    ) {
        DomainAcceptanceOverviewDTO.RefreshPlanSummaryDTO summary = new DomainAcceptanceOverviewDTO.RefreshPlanSummaryDTO();
        summary.setActionCount(actions.size());
        summary.setReadyCount(countActions(actions, "ready"));
        summary.setConfirmationCount(countActions(actions, "needs_confirmation"));
        summary.setBlockedCount(countActions(actions, "blocked"));
        summary.setSafeReadOnlyCount((int) actions.stream().filter(action -> "safe-read-only".equals(action.getCommandRisk())).count());
        summary.setUnsafeActionCount((int) actions.stream().filter(action -> "unsafe".equals(action.getCommandRisk())).count());
        summary.setDatabaseRequiredCount((int) actions.stream().filter(action -> Boolean.TRUE.equals(action.getRequiresDatabase())).count());
        summary.setManualOnlyCount((int) actions.stream().filter(action -> "manual".equals(action.getExecuteMode())).count());
        summary.setAffectedDomainCount((int) actions.stream().map(DomainAcceptanceOverviewDTO.DomainRefreshActionDTO::getDomainId).distinct().count());
        summary.setAutoMaintenanceEligibleCount((int) actions.stream().filter(action -> Boolean.TRUE.equals(action.getAutoMaintenanceEligible())).count());
        summary.setManualConfirmationCount((int) actions.stream().filter(action -> Boolean.TRUE.equals(action.getManualConfirmation())).count());
        summary.setBlockingBeforePublicCount((int) actions.stream().filter(action -> Boolean.TRUE.equals(action.getBlockingBeforePublic())).count());
        summary.setPlanOnlyCount((int) actions.stream().filter(action -> "plan-only".equals(action.getExecutionPolicy())).count());
        summary.setMaintenanceRoutedCount((int) actions.stream().filter(action -> action.getBackendRefreshStepIds() != null && !action.getBackendRefreshStepIds().isEmpty()).count());
        if (summary.getBlockedCount() > 0) {
            summary.setOverallStatus("blocked");
        } else if (summary.getConfirmationCount() > 0) {
            summary.setOverallStatus("needs_confirmation");
        } else if (summary.getReadyCount() > 0) {
            summary.setOverallStatus("ready");
        } else {
            summary.setOverallStatus("empty");
        }
        return summary;
    }

    private int countActions(List<DomainAcceptanceOverviewDTO.DomainRefreshActionDTO> actions, String status) {
        return (int) actions.stream().filter(action -> status.equals(action.getStatus())).count();
    }

    private DomainAcceptanceOverviewDTO.DomainPanelDTO basePanel(
        String domainId,
        List<String> backendRefreshStepIds,
        PanelDefinition definition,
        FreshnessDefinition freshness
    ) {
        requireExplicitSafetyFlags(domainId, definition);
        DomainAcceptanceOverviewDTO.DomainPanelDTO panel = new DomainAcceptanceOverviewDTO.DomainPanelDTO();
        panel.setId(definition.panelId);
        panel.setDomainId(domainId);
        panel.setPanelId(definition.panelId);
        panel.setChainStage(definition.chainStage);
        panel.setMaintenanceLane(definition.maintenanceLane);
        panel.setMaintenanceLaneId("domain-acceptance:" + domainId + ":" + definition.panelId);
        panel.setBackendRefreshStepIds(new ArrayList<>(backendRefreshStepIds));
        panel.setBackendRefreshPlanCommand(backendRefreshPlanCommand(backendRefreshStepIds));
        panel.setAutoMaintenanceAllowed(Boolean.TRUE.equals(definition.autoMaintenanceAllowed));
        panel.setBlockingBeforePublic(Boolean.TRUE.equals(definition.blockingBeforePublic));
        panel.setReportPattern("reports/domain/" + domainId + "/" + definition.fileKey + "*.json");
        panel.setGeneratorCommand("node scripts/data/audit/domain-readiness-audit.mjs --domain=" + domainId + " --panel=" + definition.generatorPanel);
        panel.setWritesDatabase(Boolean.TRUE.equals(definition.writesDatabase));
        panel.setRequiresDatabase(Boolean.TRUE.equals(definition.requiresDatabase));
        panel.setNotes(definition.notes);
        panel.setStaleAfterHours(freshness == null || freshness.staleAfterHours == null ? 24 : freshness.staleAfterHours);
        panel.setBlockingCount(0);
        panel.setWarningCount(0);
        return panel;
    }

    private void requireExplicitSafetyFlags(String domainId, PanelDefinition definition) {
        if (definition.requiresDatabase == null) {
            throw new IllegalStateException("Missing requiresDatabase flag for " + domainId + "/" + definition.panelId);
        }
        if (definition.writesDatabase == null) {
            throw new IllegalStateException("Missing writesDatabase flag for " + domainId + "/" + definition.panelId);
        }
    }

    private List<String> backendRefreshStepIds(DomainDefinition definition) {
        if (definition.backendRefreshStepIds == null || definition.backendRefreshStepIds.isEmpty()) {
            return List.of();
        }
        List<String> stepIds = new ArrayList<>();
        for (String stepId : definition.backendRefreshStepIds) {
            if (stepId == null || stepId.isBlank()) {
                throw new IllegalStateException("Blank backend refresh step for " + definition.domainId);
            }
            if (!KNOWN_BACKEND_REFRESH_STEP_IDS.contains(stepId)) {
                throw new IllegalStateException("Unknown backend refresh step for " + definition.domainId + ": " + stepId);
            }
            stepIds.add(stepId);
        }
        return stepIds;
    }

    private String backendRefreshPlanCommand(List<String> backendRefreshStepIds) {
        if (backendRefreshStepIds == null || backendRefreshStepIds.isEmpty()) {
            return null;
        }
        return "node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps="
            + String.join(",", backendRefreshStepIds);
    }

    private DomainAcceptanceOverviewDTO.DomainPanelDTO missingPanel(DomainAcceptanceOverviewDTO.DomainPanelDTO panel) {
        panel.setStatus("missing");
        panel.setFound(false);
        panel.setReadable(false);
        panel.setFreshnessStatus("missing");
        panel.setFreshnessReason("Missing domain acceptance report evidence.");
        panel.setNextEvidenceCommand(panel.getGeneratorCommand());
        return panel;
    }

    private DomainAcceptanceOverviewDTO.DomainPanelDTO blockedPanel(
        DomainAcceptanceOverviewDTO.DomainPanelDTO panel,
        String message
    ) {
        panel.setStatus("blocked");
        panel.setFound(false);
        panel.setReadable(false);
        panel.setBlockingCount(1);
        panel.setErrorMessage(message);
        applyBlockedFreshness(panel);
        return panel;
    }

    private void applyReportFreshness(DomainAcceptanceOverviewDTO.DomainPanelDTO panel) {
        if (panel.getGeneratedAt() == null) {
            panel.setFreshnessStatus("unknown");
            panel.setFreshnessReason("Domain acceptance report generatedAt is unavailable.");
            panel.setNextEvidenceCommand(panel.getGeneratorCommand());
            if ("pass".equals(panel.getStatus())) {
                panel.setStatus("warning");
                panel.setWarningCount(positiveOrOne(panel.getWarningCount()));
            }
            return;
        }
        int staleAfterHours = panel.getStaleAfterHours() == null ? 24 : panel.getStaleAfterHours();
        long ageHours = Math.max(0, Duration.between(panel.getGeneratedAt(), Instant.now(clock)).toHours());
        panel.setAgeHours(ageHours);
        panel.setFreshnessStatus(ageHours > staleAfterHours ? "stale" : "fresh");
        if ("stale".equals(panel.getFreshnessStatus())) {
            panel.setFreshnessReason("Evidence is older than " + staleAfterHours + " hours.");
            panel.setNextEvidenceCommand(panel.getGeneratorCommand());
            if ("pass".equals(panel.getStatus())) {
                panel.setStatus("warning");
                panel.setWarningCount(positiveOrOne(panel.getWarningCount()));
            }
        }
    }

    private void applyBlockedFreshness(DomainAcceptanceOverviewDTO.DomainPanelDTO panel) {
        if (panel.getFreshnessStatus() == null) {
            panel.setFreshnessStatus(panel.isFound() ? "unknown" : "missing");
        }
        if (panel.getFreshnessReason() == null || panel.getFreshnessReason().isBlank()) {
            panel.setFreshnessReason(firstNonBlank(panel.getErrorMessage(), "Domain acceptance evidence is blocked or unreadable."));
        }
        panel.setNextEvidenceCommand(panel.getGeneratorCommand());
    }

    private void ensureStatus(DomainAcceptanceOverviewDTO.DomainPanelDTO panel) {
        if (panel.getStatus() == null || panel.getStatus().isBlank()) {
            panel.setStatus("warning");
            panel.setWarningCount(positiveOrOne(panel.getWarningCount()));
        }
    }

    private Path findLatestReport(Path dir, String prefix, String suffix) throws IOException {
        try (Stream<Path> stream = Files.list(dir)) {
            return stream
                .filter(path -> Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS))
                .filter(path -> !Files.isSymbolicLink(path))
                .filter(path -> {
                    String fileName = path.getFileName().toString();
                    return fileName.startsWith(prefix) && fileName.endsWith(suffix);
                })
                .max(Comparator
                    .comparingLong(this::datedNameValue)
                    .thenComparingLong(this::safeLastModifiedMillis)
                    .thenComparing(path -> path.getFileName().toString()))
                .orElse(null);
        }
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

    private RegistryDefinition loadRegistry(Path repoRoot) {
        Path registryPath = repoRoot.resolve(REGISTRY_PATH).normalize();
        try {
            RegistryDefinition registry = objectMapper.readValue(registryPath.toFile(), RegistryDefinition.class);
            if (registry.domains == null || registry.domains.isEmpty()) {
                throw new IllegalStateException("Domain acceptance registry has no domains.");
            }
            if (registry.panelSets == null || registry.panels == null) {
                throw new IllegalStateException("Domain acceptance registry is missing panel definitions.");
            }
            return registry;
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to read domain acceptance registry: " + registryPath, exception);
        }
    }

    private List<String> resolvePanelSet(RegistryDefinition registry, DomainDefinition domain) {
        List<String> panelSet = registry.panelSets.get(domain.panelSet);
        if (panelSet == null || panelSet.isEmpty()) {
            throw new IllegalStateException("Missing domain acceptance panel set: " + domain.panelSet);
        }
        return panelSet;
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

    private Instant readLastModifiedInstant(Path path) {
        try {
            if (path == null || !Files.exists(path)) {
                return null;
            }
            FileTime fileTime = Files.getLastModifiedTime(path);
            return fileTime.toInstant();
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

    private long datedNameValue(Path path) {
        String fileName = path.getFileName().toString();
        java.util.regex.Matcher matcher = java.util.regex.Pattern
            .compile("(\\d{4})-(\\d{2})-(\\d{2})")
            .matcher(fileName);
        if (!matcher.find()) {
            return 0;
        }
        return Long.parseLong(matcher.group(1) + matcher.group(2) + matcher.group(3));
    }

    private List<DomainAcceptanceOverviewDTO.DomainCheckDTO> toChecks(JsonNode node) {
        if (!node.isArray()) {
            return List.of();
        }
        List<DomainAcceptanceOverviewDTO.DomainCheckDTO> checks = new ArrayList<>();
        for (JsonNode row : node) {
            DomainAcceptanceOverviewDTO.DomainCheckDTO check = new DomainAcceptanceOverviewDTO.DomainCheckDTO();
            check.setId(text(row.path("id")));
            check.setStatus(text(row.path("status")));
            check.setMessage(text(row.path("message")));
            check.setReportPath(firstNonBlank(text(row.path("reportPath")), text(row.path("evidencePath"))));
            checks.add(check);
        }
        return checks;
    }

    private boolean hasCheckStatus(List<DomainAcceptanceOverviewDTO.DomainCheckDTO> checks, List<String> statuses) {
        return checks.stream().anyMatch(check -> statuses.contains(nullToBlank(check.getStatus()).toLowerCase()));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> toMap(JsonNode node) {
        if (node == null || !node.isObject()) {
            return new LinkedHashMap<>();
        }
        return objectMapper.convertValue(node, LinkedHashMap.class);
    }

    private String statusFromRaw(String rawStatus) {
        String normalizedStatus = rawStatus == null ? "" : rawStatus.trim().toLowerCase();
        if ("blocked".equals(normalizedStatus) || "error".equals(normalizedStatus) || "fail".equals(normalizedStatus)) {
            return "blocked";
        }
        if ("warning".equals(normalizedStatus) || "warn".equals(normalizedStatus)) {
            return "warning";
        }
        if ("missing".equals(normalizedStatus)) {
            return "missing";
        }
        if ("pass".equals(normalizedStatus) || "success".equals(normalizedStatus) || "ok".equals(normalizedStatus)) {
            return "pass";
        }
        return "warning";
    }

    private String reason(
        DomainAcceptanceOverviewDTO.DomainDTO domain,
        DomainAcceptanceOverviewDTO.DomainPanelDTO panel,
        String fallback
    ) {
        String prefix = domain.getDomainId() + "." + panel.getPanelId() + ": ";
        if (panel.getErrorMessage() != null && !panel.getErrorMessage().isBlank()) {
            return prefix + panel.getErrorMessage();
        }
        if (panel.getBlockingCount() != null && panel.getBlockingCount() > 0) {
            return prefix + "blockingCount=" + panel.getBlockingCount();
        }
        if (panel.getWarningCount() != null && panel.getWarningCount() > 0) {
            return prefix + "warningCount=" + panel.getWarningCount();
        }
        return prefix + fallback;
    }

    private int positiveOrOne(Integer value) {
        return value == null || value <= 0 ? 1 : value;
    }

    private int intValue(JsonNode node) {
        return node == null || !node.isNumber() ? 0 : node.asInt();
    }

    private int arraySize(JsonNode node) {
        return node == null || !node.isArray() ? 0 : node.size();
    }

    private String text(JsonNode node) {
        return node == null || node.isMissingNode() || node.isNull() ? null : node.asText();
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

    private String formatInstant(Instant instant) {
        return instant == null ? null : instant.toString();
    }

    private String nullToBlank(String value) {
        return value == null ? "" : value;
    }

    private String firstNonBlank(String first, String second) {
        return first == null || first.isBlank() ? second : first;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private static class RegistryDefinition {
        public FreshnessDefinition freshness;
        public Map<String, List<String>> panelSets = new LinkedHashMap<>();
        public Map<String, PanelDefinition> panels = new LinkedHashMap<>();
        public List<DomainDefinition> domains = new ArrayList<>();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private static class FreshnessDefinition {
        public Integer staleAfterHours;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private static class DomainDefinition {
        public String domainId;
        public String domainType;
        public String tier;
        public String chainStage;
        public String panelSet;
        public String managementRoute;
        public String publicExposure;
        public String publicRoute;
        public List<String> backendRefreshStepIds;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private static class PanelDefinition {
        public String panelId;
        public String fileKey;
        public String generatorPanel;
        public String chainStage;
        public String maintenanceLane;
        public Boolean autoMaintenanceAllowed;
        public Boolean blockingBeforePublic;
        public Boolean requiresDatabase;
        public Boolean writesDatabase;
        public String notes;
    }
}

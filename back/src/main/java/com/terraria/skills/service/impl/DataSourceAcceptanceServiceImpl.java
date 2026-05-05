package com.terraria.skills.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import com.terraria.skills.dto.DataSourceAcceptanceOverviewDTO;
import com.terraria.skills.service.CrawlerMonitorService;
import com.terraria.skills.service.DataSourceAcceptanceService;
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
import java.util.function.BiConsumer;
import java.util.stream.Stream;

@Service
public class DataSourceAcceptanceServiceImpl implements DataSourceAcceptanceService {

    private static final int DEFAULT_STALE_AFTER_HOURS = 24;
    private static final int FAILURE_SAMPLE_LIMIT = 50;

    private static final ReportDefinition RELATION_HEALTH = new ReportDefinition(
        "relationHealth",
        Path.of("reports", "relation"),
        "relation-health",
        ".json",
        "reports/relation/relation-health*.json",
        "node scripts/data/relation/relation-health-report.mjs --write-report=true",
        false,
        true,
        "Feeds relationHealth from the latest relation health report."
    );
    private static final ReportDefinition REPLACEMENT_READINESS = new ReportDefinition(
        "replacementReadiness",
        Path.of("reports", "relation"),
        "replacement-readiness",
        ".json",
        "reports/relation/replacement-readiness*.json",
        "node scripts/data/relation/replacement-readiness-audit.mjs",
        false,
        true,
        "Feeds replacementReadiness from the latest read-only replacement readiness audit report."
    );
    private static final ReportDefinition SOURCE_DATASET_LANDING = new ReportDefinition(
        "sourceDatasetLanding",
        Path.of("reports"),
        "source-dataset-landing-audit",
        ".json",
        "reports/source-dataset-landing-audit*.json",
        "node scripts/data/landing/audit-source-dataset-landings.mjs",
        false,
        true,
        "Feeds sourceDatasetLanding from the latest landing dataset audit report."
    );
    private static final ReportDefinition SOURCE_GROUP_AUDIT = new ReportDefinition(
        "sourceGroupAudit",
        Path.of("reports", "item-groups"),
        "any-item-group-source-audit",
        ".json",
        "reports/item-groups/any-item-group-source-audit*.json",
        "node scripts/data/audit/audit-any-item-group-sources.mjs",
        false,
        false,
        "Feeds sourceGroupAudit from the latest source-backed item group audit report."
    );
    private static final ReportDefinition IMAGE_READINESS = new ReportDefinition(
        "imageReadiness",
        Path.of("reports", "audit"),
        "image-asset-readiness",
        ".json",
        "reports/audit/image-asset-readiness*.json",
        "node scripts/data/audit/image-asset-readiness-audit.mjs --source=db",
        false,
        true,
        "Feeds imageReadiness from the latest image asset readiness audit report."
    );
    private static final ReportDefinition ENTITY_SOURCE_COVERAGE = new ReportDefinition(
        "entitySourceCoverage",
        Path.of("reports", "relation"),
        "entity-coverage-baseline",
        ".json",
        "reports/relation/entity-coverage-baseline*.json",
        "node scripts/data/relation/entity-coverage-baseline.mjs",
        false,
        true,
        "Feeds entitySourceCoverage from the latest entity source coverage baseline report."
    );

    private final ObjectMapper objectMapper;
    private final CrawlerMonitorService crawlerMonitorService;
    private final Path repoRootOverride;
    private final Clock clock;

    @Autowired
    public DataSourceAcceptanceServiceImpl(ObjectMapper objectMapper, CrawlerMonitorService crawlerMonitorService) {
        this(objectMapper, crawlerMonitorService, null, Clock.systemUTC());
    }

    DataSourceAcceptanceServiceImpl(
        ObjectMapper objectMapper,
        CrawlerMonitorService crawlerMonitorService,
        Path repoRootOverride
    ) {
        this(objectMapper, crawlerMonitorService, repoRootOverride, Clock.systemUTC());
    }

    DataSourceAcceptanceServiceImpl(
        ObjectMapper objectMapper,
        CrawlerMonitorService crawlerMonitorService,
        Path repoRootOverride,
        Clock clock
    ) {
        this.objectMapper = objectMapper;
        this.crawlerMonitorService = crawlerMonitorService;
        this.repoRootOverride = repoRootOverride == null ? null : repoRootOverride.toAbsolutePath().normalize();
        this.clock = clock == null ? Clock.systemUTC() : clock;
    }

    @Override
    public DataSourceAcceptanceOverviewDTO getOverview() {
        Path repoRoot = resolveRepoRoot();
        DataSourceAcceptanceOverviewDTO overview = new DataSourceAcceptanceOverviewDTO();
        overview.setGeneratedAt(Instant.now(clock));
        overview.setRelationHealth(readReportPanel(repoRoot, RELATION_HEALTH, this::fillRelationHealth));
        overview.setReplacementReadiness(readReportPanel(repoRoot, REPLACEMENT_READINESS, this::fillReplacementReadiness));
        overview.setSourceDatasetLanding(readReportPanel(repoRoot, SOURCE_DATASET_LANDING, this::fillSourceDatasetLanding));
        overview.setSourceGroupAudit(readReportPanel(repoRoot, SOURCE_GROUP_AUDIT, this::fillSourceGroupAudit));
        overview.setImageReadiness(readReportPanel(repoRoot, IMAGE_READINESS, this::fillImageReadiness));
        overview.setCrawlerMonitor(buildCrawlerMonitorPanel());
        overview.setEntitySourceCoverage(readReportPanel(repoRoot, ENTITY_SOURCE_COVERAGE, this::fillEntitySourceCoverage));
        aggregateStatus(overview);
        return overview;
    }

    private DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO readReportPanel(
        Path repoRoot,
        ReportDefinition definition,
        BiConsumer<JsonNode, DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO> parser
    ) {
        Path reportsRoot = repoRoot.resolve("reports").normalize();
        Path dir = repoRoot.resolve(definition.relativeDir()).normalize();
        if (!dir.startsWith(reportsRoot)) {
            return blockedPanel(definition, "Report directory is outside the reports allowlist.");
        }
        if (!Files.isDirectory(dir, LinkOption.NOFOLLOW_LINKS)) {
            return missingPanel(definition);
        }
        Path reportPath;
        try {
            reportPath = findLatestReport(dir, definition.prefix(), definition.suffix());
            if (reportPath == null) {
                return missingPanel(definition);
            }
        } catch (IOException exception) {
            return blockedPanel(definition, exception.getMessage());
        }

        DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO panel = basePanel(definition);
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
            }
            panel.setUpdatedAt(formatInstant(panel.getGeneratedAt()));
            try {
                parser.accept(root, panel);
                ensureStatus(panel);
                applyReportFreshness(panel, definition);
                fillFailureSamples(root, panel);
            } catch (RuntimeException exception) {
                panel.setStatus("blocked");
                panel.setBlockingCount(1);
                panel.setWarningCount(0);
                panel.setErrorMessage(exception.getMessage());
                applyBlockedFreshness(panel, definition);
            }
            return panel;
        } catch (IOException exception) {
            panel.setReadable(false);
            panel.setStatus("blocked");
            panel.setBlockingCount(1);
            panel.setWarningCount(0);
            panel.setErrorMessage(exception.getMessage());
            applyBlockedFreshness(panel, definition);
            return panel;
        }
    }

    private void fillFailureSamples(JsonNode root, DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO panel) {
        for (DataSourceAcceptanceOverviewDTO.AcceptanceCheckDTO check : panel.getChecks()) {
            if (panel.getFailureSamples().size() >= FAILURE_SAMPLE_LIMIT) {
                return;
            }
            if (!isFailureStatus(check.getStatus())) {
                continue;
            }
            panel.getFailureSamples().add(sampleFromCheck(panel, check));
        }

        if (panel.getChecks().isEmpty() && root.path("checks").isArray()) {
            for (DataSourceAcceptanceOverviewDTO.AcceptanceCheckDTO check : toChecks(root.path("checks"))) {
                if (panel.getFailureSamples().size() >= FAILURE_SAMPLE_LIMIT) {
                    return;
                }
                if (!isFailureStatus(check.getStatus())) {
                    continue;
                }
                panel.getFailureSamples().add(sampleFromCheck(panel, check));
            }
        }

        addReasonSamples(panel, strings(root.path("blockingReasons")), "blocked");
        addReasonSamples(panel, strings(root.path("warningReasons")), "warning");
    }

    private DataSourceAcceptanceOverviewDTO.AcceptanceFailureSampleDTO sampleFromCheck(
        DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO panel,
        DataSourceAcceptanceOverviewDTO.AcceptanceCheckDTO check
    ) {
        DataSourceAcceptanceOverviewDTO.AcceptanceFailureSampleDTO sample = baseFailureSample(panel);
        sample.setEntityId(check.getId());
        sample.setStatus(firstNonBlank(normalizeSampleStatus(check.getStatus()), panel.getStatus()));
        sample.setReason(check.getMessage());
        sample.setEvidencePath(check.getReportPath());
        sample.setSampleSource("report-check");
        return sample;
    }

    private void addReasonSamples(
        DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO panel,
        List<String> reasons,
        String status
    ) {
        for (String reason : reasons) {
            if (panel.getFailureSamples().size() >= FAILURE_SAMPLE_LIMIT) {
                return;
            }
            if (reason == null || reason.isBlank()) {
                continue;
            }
            DataSourceAcceptanceOverviewDTO.AcceptanceFailureSampleDTO sample = baseFailureSample(panel);
            sample.setStatus(status);
            sample.setReason(reason);
            sample.setSampleSource("report-reason");
            panel.getFailureSamples().add(sample);
        }
    }

    private DataSourceAcceptanceOverviewDTO.AcceptanceFailureSampleDTO baseFailureSample(
        DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO panel
    ) {
        DataSourceAcceptanceOverviewDTO.AcceptanceFailureSampleDTO sample = new DataSourceAcceptanceOverviewDTO.AcceptanceFailureSampleDTO();
        sample.setEntityType(panel.getId());
        sample.setRecommendedAction(firstNonBlank(panel.getNextEvidenceCommand(), panel.getGeneratorCommand()));
        sample.setFreshnessStatus(panel.getFreshnessStatus());
        sample.setReportPath(panel.getReportPath());
        sample.setNotGateEvidence(false);
        return sample;
    }

    private boolean isFailureStatus(String status) {
        String normalized = normalizeSampleStatus(status);
        return "blocked".equals(normalized) || "warning".equals(normalized);
    }

    private String normalizeSampleStatus(String status) {
        String normalized = status == null ? "" : status.trim().toLowerCase();
        if ("blocked".equals(normalized) || "error".equals(normalized) || "fail".equals(normalized)) {
            return "blocked";
        }
        if ("warning".equals(normalized) || "warn".equals(normalized)) {
            return "warning";
        }
        if ("missing".equals(normalized)) {
            return "missing";
        }
        if ("pass".equals(normalized) || "success".equals(normalized) || "ok".equals(normalized)) {
            return "pass";
        }
        return normalized.isBlank() ? null : normalized;
    }

    private DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO buildCrawlerMonitorPanel() {
        DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO panel = new DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO();
        panel.setId("crawlerMonitor");
        panel.setStatus("pass");
        panel.setFound(true);
        panel.setReadable(true);
        panel.setReportPattern("GET /admin/crawler-monitor/overview");
        panel.setGeneratorCommand("read-only monitor overview: GET /admin/crawler-monitor/overview");
        panel.setWritesDatabase(false);
        panel.setRequiresDatabase(false);
        panel.setNotes("Feeds crawlerMonitor through the existing read-only crawler monitor overview, without running crawler, data load, or mutation flows.");
        panel.setBlockingCount(0);
        panel.setWarningCount(0);
        panel.setStaleAfterHours(DEFAULT_STALE_AFTER_HOURS);
        try {
            CrawlerMonitorOverviewDTO overview = crawlerMonitorService.getOverview();
            if (overview == null) {
                panel.setStatus("blocked");
                panel.setFound(false);
                panel.setReadable(false);
                panel.setBlockingCount(1);
                panel.setErrorMessage("Crawler monitor overview is unavailable.");
                applyBlockedFreshness(panel, panel.getGeneratorCommand());
                return panel;
            }
            panel.setGeneratedAt(overview.getGeneratedAt());
            applyCrawlerFreshness(panel, overview);
            panel.getMetrics().put("refreshStale", overview.isRefreshStale());
            panel.getMetrics().put("refreshLastActivityAt", overview.getRefreshLastActivityAt());
            panel.getMetrics().put("refreshStaleReason", overview.getRefreshStaleReason());
            panel.getMetrics().put("recentReportCount", sizeOf(overview.getRecentReports()));
            panel.getMetrics().put("registeredTaskCount", sizeOf(overview.getRegisteredTasks()));
            CrawlerMonitorOverviewDTO.MonitorRunDTO latestRun = overview.getLatestRun();
            if (latestRun != null) {
                panel.setReportPath(firstNonBlank(latestRun.getPath(), latestRun.getSummaryPath()));
                panel.getMetrics().put("latestRunFound", latestRun.isFound());
                panel.getMetrics().put("latestRunReadable", latestRun.isReadable());
                panel.getMetrics().put("latestRunTotalActions", latestRun.getTotalActions());
                panel.getMetrics().put("latestRunCompletedActions", latestRun.getCompletedActions());
                panel.getMetrics().put("latestRunFailedActions", latestRun.getFailedActions());
                panel.getMetrics().put("latestRunTimedOutActions", latestRun.getTimedOutActions());
                if (!latestRun.isFound() || !latestRun.isReadable()) {
                    panel.setStatus("blocked");
                    panel.setBlockingCount(1);
                    panel.setErrorMessage(firstNonBlank(latestRun.getErrorMessage(), "Latest crawler monitor run is missing or unreadable."));
                    applyBlockedFreshness(panel, panel.getGeneratorCommand());
                } else if (latestRun.getFailedActions() > 0 || latestRun.getTimedOutActions() > 0) {
                    panel.setStatus("blocked");
                    panel.setBlockingCount((int) (latestRun.getFailedActions() + latestRun.getTimedOutActions()));
                    applyBlockedFreshness(panel, panel.getGeneratorCommand());
                }
            }
            if (!"blocked".equals(panel.getStatus()) && overview.isRefreshStale()) {
                panel.setStatus("warning");
                panel.setWarningCount(1);
                panel.setNextEvidenceCommand(panel.getGeneratorCommand());
            }
            return panel;
        } catch (Exception exception) {
            panel.setStatus("blocked");
            panel.setReadable(false);
            panel.setBlockingCount(1);
            panel.setErrorMessage(exception.getMessage());
            applyBlockedFreshness(panel, panel.getGeneratorCommand());
            return panel;
        }
    }

    private void fillRelationHealth(JsonNode root, DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO panel) {
        JsonNode summary = root.path("summary");
        int blockingCount = intValue(summary.path("blockingCount"));
        int warningCount = intValue(summary.path("warningCount"));
        panel.setBlockingCount(blockingCount);
        panel.setWarningCount(warningCount);
        panel.setRawSummary(toMap(summary));
        panel.setChecks(toChecks(root.path("checks")));
        if (blockingCount > 0 || hasCheckStatus(panel.getChecks(), List.of("fail", "error", "blocked"))) {
            panel.setStatus("blocked");
        } else if (warningCount > 0 || hasCheckStatus(panel.getChecks(), List.of("warn", "warning"))) {
            panel.setStatus("warning");
        } else {
            panel.setStatus(statusFromRaw(text(summary.path("status"))));
        }
    }

    private void fillReplacementReadiness(JsonNode root, DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO panel) {
        JsonNode summary = root.path("summary");
        int blockedDomains = arraySize(summary.path("blockedDomains"));
        int switchableDomains = arraySize(summary.path("switchableDomains"));
        int blockingFields = countBlockingFields(root.path("domainResults"));
        panel.setRawSummary(toMap(summary));
        panel.getMetrics().put("switchableDomainCount", switchableDomains);
        panel.getMetrics().put("blockedDomainCount", blockedDomains);
        panel.getMetrics().put("blockingFieldCount", blockingFields);
        panel.setBlockingCount(blockedDomains + blockingFields);
        panel.setWarningCount(0);
        panel.setStatus(blockedDomains > 0 || blockingFields > 0 || hasDomainStatus(root.path("domainResults"), "blocked") ? "blocked" : "pass");
    }

    private void fillSourceDatasetLanding(JsonNode root, DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO panel) {
        int totalRows = intValue(root.path("landing").path("totalRows"));
        int nonZeroDeltaCount = 0;
        for (JsonNode businessRow : iterable(root.path("business"))) {
            if (businessRow.path("deltaLocalMinusCompare").isNumber() && businessRow.path("deltaLocalMinusCompare").asInt() != 0) {
                nonZeroDeltaCount++;
            }
        }
        panel.getMetrics().put("totalRows", totalRows);
        panel.getMetrics().put("businessDeltaCount", nonZeroDeltaCount);
        panel.setBlockingCount(totalRows <= 0 ? 1 : 0);
        panel.setWarningCount(nonZeroDeltaCount);
        panel.setStatus(totalRows <= 0 ? "blocked" : nonZeroDeltaCount > 0 ? "warning" : "pass");
    }

    private void fillSourceGroupAudit(JsonNode root, DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO panel) {
        JsonNode summary = root.path("summary");
        int blocked = intValue(summary.path("blockedGroupReferences"));
        if (blocked == 0 && root.path("blockedGroupReferences").isArray()) {
            blocked = root.path("blockedGroupReferences").size();
        }
        int duplicate = intValue(summary.path("duplicateGroupKeys"));
        int consumerOnly = intValue(summary.path("consumerOnlyReferences"));
        int unresolved = intValue(summary.path("unresolvedMemberReferences"));
        panel.setRawSummary(toMap(summary));
        panel.getMetrics().put("blockedGroupReferences", blocked);
        panel.getMetrics().put("duplicateGroupKeys", duplicate);
        panel.getMetrics().put("consumerOnlyReferences", consumerOnly);
        panel.getMetrics().put("unresolvedMemberReferences", unresolved);
        panel.setBlockingCount(blocked);
        panel.setWarningCount(duplicate + consumerOnly + unresolved);
        panel.setStatus(blocked > 0 ? "blocked" : duplicate + consumerOnly + unresolved > 0 ? "warning" : "pass");
    }

    private void fillImageReadiness(JsonNode root, DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO panel) {
        List<String> blockingReasons = strings(root.path("blockingReasons"));
        List<String> warningReasons = strings(root.path("warningReasons"));
        panel.setBlockingCount(blockingReasons.size());
        panel.setWarningCount(warningReasons.size());
        panel.getMetrics().put("blockingReasonCount", blockingReasons.size());
        panel.getMetrics().put("warningReasonCount", warningReasons.size());
        panel.getMetrics().putAll(sumImageEntityMetrics(root.path("entities")));
        String rawStatus = text(root.path("status"));
        if (!blockingReasons.isEmpty() || "blocked".equals(rawStatus)) {
            panel.setStatus("blocked");
        } else if (!warningReasons.isEmpty() || "warning".equals(rawStatus)) {
            panel.setStatus("warning");
        } else {
            panel.setStatus(statusFromRaw(rawStatus));
        }
    }

    private void fillEntitySourceCoverage(JsonNode root, DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO panel) {
        JsonNode summary = root.path("fieldAudit").path("summary");
        int domainCount = intValue(summary.path("domainCount"));
        int totalGaps = intValue(summary.path("totalGaps"));
        panel.setRawSummary(toMap(summary));
        panel.getMetrics().put("domainCount", domainCount);
        panel.getMetrics().put("totalGaps", totalGaps);
        panel.setBlockingCount(0);
        panel.setWarningCount(totalGaps);
        panel.setStatus(totalGaps > 0 ? "warning" : "pass");
    }

    private void aggregateStatus(DataSourceAcceptanceOverviewDTO overview) {
        List<DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO> panels = List.of(
            overview.getRelationHealth(),
            overview.getReplacementReadiness(),
            overview.getSourceDatasetLanding(),
            overview.getSourceGroupAudit(),
            overview.getImageReadiness(),
            overview.getCrawlerMonitor(),
            overview.getEntitySourceCoverage()
        );
        int blockingCount = 0;
        int warningCount = 0;
        int missingCount = 0;
        for (DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO panel : panels) {
            if (panel == null) {
                continue;
            }
            if ("blocked".equals(panel.getStatus())) {
                blockingCount += positiveOrOne(panel.getBlockingCount());
                overview.getBlockingReasons().add(reason(panel, "blocked"));
            } else if ("warning".equals(panel.getStatus())) {
                warningCount += positiveOrOne(panel.getWarningCount());
                overview.getWarningReasons().add(reason(panel, "warning"));
            } else if ("missing".equals(panel.getStatus())) {
                missingCount++;
            }
        }
        overview.setBlockingCount(blockingCount);
        overview.setWarningCount(warningCount);
        overview.setMissingCount(missingCount);
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

    private DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO basePanel(ReportDefinition definition) {
        DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO panel = new DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO();
        panel.setId(definition.id());
        panel.setReportPattern(definition.reportPattern());
        panel.setGeneratorCommand(definition.generatorCommand());
        panel.setWritesDatabase(definition.writesDatabase());
        panel.setRequiresDatabase(definition.requiresDatabase());
        panel.setNotes(definition.notes());
        panel.setExecuteMode("manual");
        panel.setExecutionPolicy("plan-only");
        panel.setStaleAfterHours(DEFAULT_STALE_AFTER_HOURS);
        panel.setBlockingCount(0);
        panel.setWarningCount(0);
        return panel;
    }

    private DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO missingPanel(ReportDefinition definition) {
        DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO panel = basePanel(definition);
        panel.setStatus("missing");
        panel.setFound(false);
        panel.setReadable(false);
        panel.setFreshnessStatus("missing");
        panel.setFreshnessReason("Missing acceptance report evidence.");
        panel.setNextEvidenceCommand(definition.generatorCommand());
        return panel;
    }

    private DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO blockedPanel(ReportDefinition definition, String message) {
        DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO panel = basePanel(definition);
        panel.setStatus("blocked");
        panel.setFound(false);
        panel.setReadable(false);
        panel.setBlockingCount(1);
        panel.setErrorMessage(message);
        applyBlockedFreshness(panel, definition);
        return panel;
    }

    private void applyReportFreshness(DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO panel, ReportDefinition definition) {
        if (panel.getGeneratedAt() == null) {
            panel.setFreshnessStatus("unknown");
            panel.setFreshnessReason("Acceptance report generatedAt is unavailable.");
            panel.setNextEvidenceCommand(definition.generatorCommand());
            if ("pass".equals(panel.getStatus())) {
                panel.setStatus("warning");
                panel.setWarningCount(positiveOrOne(panel.getWarningCount()));
            }
            return;
        }
        long ageHours = Math.max(0, Duration.between(panel.getGeneratedAt(), Instant.now(clock)).toHours());
        panel.setAgeHours(ageHours);
        panel.setFreshnessStatus(ageHours > DEFAULT_STALE_AFTER_HOURS ? "stale" : "fresh");
        if ("stale".equals(panel.getFreshnessStatus())) {
            panel.setFreshnessReason("Evidence is older than " + DEFAULT_STALE_AFTER_HOURS + " hours.");
            panel.setNextEvidenceCommand(definition.generatorCommand());
            if ("pass".equals(panel.getStatus())) {
                panel.setStatus("warning");
                panel.setWarningCount(positiveOrOne(panel.getWarningCount()));
            }
        }
    }

    private void applyCrawlerFreshness(DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO panel, CrawlerMonitorOverviewDTO overview) {
        panel.setStaleAfterHours(staleAfterHours(overview.getRefreshStaleThresholdMs()));
        if (overview.isRefreshStale()) {
            panel.setFreshnessStatus("stale");
            panel.setFreshnessReason(firstNonBlank(overview.getRefreshStaleReason(), "Crawler monitor refresh evidence is stale."));
            panel.setNextEvidenceCommand(panel.getGeneratorCommand());
        } else {
            panel.setFreshnessStatus("fresh");
        }
        if (panel.getGeneratedAt() != null) {
            panel.setAgeHours(Math.max(0, Duration.between(panel.getGeneratedAt(), Instant.now(clock)).toHours()));
        }
    }

    private void applyBlockedFreshness(DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO panel, ReportDefinition definition) {
        applyBlockedFreshness(panel, definition.generatorCommand());
    }

    private void applyBlockedFreshness(DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO panel, String nextEvidenceCommand) {
        if (panel.getFreshnessStatus() == null) {
            panel.setFreshnessStatus(panel.isFound() ? "unknown" : "missing");
        }
        if (panel.getFreshnessReason() == null || panel.getFreshnessReason().isBlank()) {
            panel.setFreshnessReason(firstNonBlank(panel.getErrorMessage(), "Acceptance evidence is blocked or unreadable."));
        }
        panel.setNextEvidenceCommand(nextEvidenceCommand);
    }

    private int staleAfterHours(Long staleThresholdMs) {
        if (staleThresholdMs == null || staleThresholdMs <= 0) {
            return DEFAULT_STALE_AFTER_HOURS;
        }
        return (int) Math.max(1, Math.ceil(staleThresholdMs / 3_600_000.0));
    }

    private void ensureStatus(DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO panel) {
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
                    .comparingLong(this::safeLastModifiedMillis)
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

    private List<DataSourceAcceptanceOverviewDTO.AcceptanceCheckDTO> toChecks(JsonNode node) {
        if (!node.isArray()) {
            return List.of();
        }
        List<DataSourceAcceptanceOverviewDTO.AcceptanceCheckDTO> checks = new ArrayList<>();
        for (JsonNode row : node) {
            DataSourceAcceptanceOverviewDTO.AcceptanceCheckDTO check = new DataSourceAcceptanceOverviewDTO.AcceptanceCheckDTO();
            check.setId(text(row.path("id")));
            check.setStatus(text(row.path("status")));
            check.setMessage(text(row.path("message")));
            check.setReportPath(text(row.path("reportPath")));
            checks.add(check);
        }
        return checks;
    }

    private boolean hasCheckStatus(List<DataSourceAcceptanceOverviewDTO.AcceptanceCheckDTO> checks, List<String> statuses) {
        return checks.stream().anyMatch(check -> statuses.contains(nullToBlank(check.getStatus()).toLowerCase()));
    }

    private boolean hasDomainStatus(JsonNode domainResults, String expectedStatus) {
        for (JsonNode domain : iterable(domainResults)) {
            if (expectedStatus.equals(text(domain.path("status")))) {
                return true;
            }
        }
        return false;
    }

    private int countBlockingFields(JsonNode domainResults) {
        int count = 0;
        for (JsonNode domain : iterable(domainResults)) {
            count += arraySize(domain.path("blockingFields"));
        }
        return count;
    }

    private Map<String, Object> sumImageEntityMetrics(JsonNode entities) {
        Map<String, Object> metrics = new LinkedHashMap<>();
        int totalWithImage = 0;
        int cachedHitCount = 0;
        int wikiFallbackOnlyCount = 0;
        int missingImageCount = 0;
        for (JsonNode entity : iterable(entities)) {
            totalWithImage += intValue(entity.path("totalWithImage"));
            cachedHitCount += intValue(entity.path("cachedHitCount"));
            wikiFallbackOnlyCount += intValue(entity.path("wikiFallbackOnlyCount"));
            missingImageCount += intValue(entity.path("missingImageCount"));
        }
        metrics.put("totalWithImage", totalWithImage);
        metrics.put("cachedHitCount", cachedHitCount);
        metrics.put("wikiFallbackOnlyCount", wikiFallbackOnlyCount);
        metrics.put("missingImageCount", missingImageCount);
        return metrics;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> toMap(JsonNode node) {
        if (node == null || !node.isObject()) {
            return new LinkedHashMap<>();
        }
        return objectMapper.convertValue(node, LinkedHashMap.class);
    }

    private Iterable<JsonNode> iterable(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return List.of();
        }
        if (node.isObject()) {
            return () -> node.elements();
        }
        if (node.isArray()) {
            return node;
        }
        return List.of();
    }

    private List<String> strings(JsonNode node) {
        if (!node.isArray()) {
            return List.of();
        }
        List<String> values = new ArrayList<>();
        for (JsonNode value : node) {
            values.add(value.asText());
        }
        return values;
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

    private String reason(DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO panel, String fallback) {
        if (panel.getErrorMessage() != null && !panel.getErrorMessage().isBlank()) {
            return panel.getId() + ": " + panel.getErrorMessage();
        }
        if (panel.getBlockingCount() != null && panel.getBlockingCount() > 0) {
            return panel.getId() + ": blockingCount=" + panel.getBlockingCount();
        }
        if (panel.getWarningCount() != null && panel.getWarningCount() > 0) {
            return panel.getId() + ": warningCount=" + panel.getWarningCount();
        }
        return panel.getId() + ": " + fallback;
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

    private int sizeOf(List<?> values) {
        return values == null ? 0 : values.size();
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

    private record ReportDefinition(
        String id,
        Path relativeDir,
        String prefix,
        String suffix,
        String reportPattern,
        String generatorCommand,
        boolean writesDatabase,
        boolean requiresDatabase,
        String notes
    ) {
    }
}

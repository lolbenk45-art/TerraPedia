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
import java.util.stream.Stream;

@Service
public class DomainAcceptanceServiceImpl implements DomainAcceptanceService {

    private static final Path REGISTRY_PATH = Path.of("scripts", "data", "workflow", "domain-acceptance-registry.json");

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
        domain.setDomainId(definition.domainId);
        domain.setDomainType(definition.domainType);
        domain.setTier(definition.tier);
        domain.setChainStage(definition.chainStage);
        domain.setManagementRoute(definition.managementRoute);
        domain.setPublicRoute(definition.publicRoute);
        for (String panelId : resolvePanelSet(registry, definition)) {
            PanelDefinition panelDefinition = registry.panels.get(panelId);
            if (panelDefinition == null) {
                throw new IllegalStateException("Missing domain acceptance panel definition: " + panelId);
            }
            domain.getPanels().add(readPanel(repoRoot, definition.domainId, panelDefinition, registry.freshness));
        }
        aggregateDomain(domain);
        return domain;
    }

    private DomainAcceptanceOverviewDTO.DomainPanelDTO readPanel(
        Path repoRoot,
        String domainId,
        PanelDefinition definition,
        FreshnessDefinition freshness
    ) {
        DomainAcceptanceOverviewDTO.DomainPanelDTO panel = basePanel(domainId, definition, freshness);
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

    private DomainAcceptanceOverviewDTO.DomainPanelDTO basePanel(String domainId, PanelDefinition definition, FreshnessDefinition freshness) {
        DomainAcceptanceOverviewDTO.DomainPanelDTO panel = new DomainAcceptanceOverviewDTO.DomainPanelDTO();
        panel.setId(definition.panelId);
        panel.setDomainId(domainId);
        panel.setPanelId(definition.panelId);
        panel.setChainStage(definition.chainStage);
        panel.setMaintenanceLane(definition.maintenanceLane);
        panel.setMaintenanceLaneId("domain-acceptance:" + domainId + ":" + definition.panelId);
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
        public String publicRoute;
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

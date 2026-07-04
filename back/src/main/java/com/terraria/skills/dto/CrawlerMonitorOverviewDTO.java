package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CrawlerMonitorOverviewDTO {

    private Instant generatedAt;
    private String repoRoot;
    private MonitorFileDTO daemon;
    private MonitorFileDTO scheduler;
    private MonitorFileDTO lock;
    private MonitorRunDTO latestRun;
    private boolean refreshStale;
    private String refreshLastActivityAt;
    private Long refreshStaleThresholdMs;
    private String refreshStaleReason;
    private Long heartbeatStaleAfterMs;
    private ImageNormalizationSummaryDTO imageNormalization;
    private WikiMonitorDTO wikiMonitor;
    private List<String> staleHeartbeats = new ArrayList<>();
    private List<MonitorRunDTO> history = new ArrayList<>();
    private List<MonitorReportDTO> recentReports = new ArrayList<>();
    private List<ArchitectureLayerDTO> architectureLayers = new ArrayList<>();
    private List<RegisteredTaskDTO> registeredTasks = new ArrayList<>();

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ImageNormalizationSummaryDTO {
        private String latestImageLineageReport;
        private String lastCanonicalSyncAt;
        private Long npcWrongPrefixCount;
        private Long projectileWrongPrefixCount;
        private Long npcWikiOnlyCount;
        private Long projectileWikiOnlyCount;
        private Long legacyExemptionCount;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class WikiMonitorDTO {
        private String generatedAt;
        private String dispatchMode;
        private boolean autoDispatchEnabled;
        private CrawlerMonitorAutoDispatchDTO autoDispatchSettings;
        private WikiMonitorLastSweepDTO lastSweep;
        private WikiMonitorSummaryDTO summary = new WikiMonitorSummaryDTO();
        private List<WikiMonitorDomainDTO> domains = new ArrayList<>();
        private List<WikiMonitorDispatchPlanDTO> dispatchPlan = new ArrayList<>();
        private List<WikiMonitorQueueItemDTO> dispatchQueue = new ArrayList<>();
        private List<WikiMonitorDispatchDTO> pendingDispatches = new ArrayList<>();
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class WikiMonitorSummaryDTO {
        private long domainCount;
        private long changedCount;
        private long pendingApprovalCount;
        private long runningCount;
        private long failedCount;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class WikiMonitorDomainDTO {
        private String domain;
        private String label;
        private String status;
        private String sourceKey;
        private String locator;
        private String lastCheckedAt;
        private String currentValue;
        private String previousValue;
        private boolean changed;
        private String recommendedActionId;
        private String progressPath;
        private boolean requiresApproval;
        private boolean autoEligible;
        private String autoDispatchReason;
        private String dispatchMode;
        private Long cooldownMinutes;
        private Long maxConcurrent;
        private String failureCircuitBreaker;
        private String lastAutoRunAt;
        private String pauseReason;
        private String message;
        private WikiMonitorDomainStateDTO state;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class WikiMonitorDomainStateDTO {
        private String status;
        private String nextAction;
        private String blocker;
        private String blockerLabel;
        private String evidence;
        private String updatedAt;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class WikiMonitorLastSweepDTO {
        private String checkedAt;
        private String status;
        private List<Map<String, Object>> detected = new ArrayList<>();
        private List<Map<String, Object>> dispatched = new ArrayList<>();
        private List<Map<String, Object>> skipped = new ArrayList<>();
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class WikiMonitorDispatchDTO {
        private String dispatchId;
        private String domain;
        private String actionId;
        private String status;
        private String commandPreview;
        private String progressPath;
        private String lockPath;
        private String reportPath;
        private String requestedAt;
        private String startedAt;
        private String completedAt;
        private String message;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class WikiMonitorQueueItemDTO {
        private String queueId;
        private String dispatchId;
        private String lane;
        private String domain;
        private List<String> coveredDomains = new ArrayList<>();
        private String actionId;
        private String status;
        private String requestedAt;
        private String startedAt;
        private String completedAt;
        private Long pid;
        private String processStartedAt;
        private String requestedBy;
        private String blockedByDispatchId;
        private String blockedByDomain;
        private String blockedByActionId;
        private String blockedSince;
        private String cooldownUntil;
        private String progressPath;
        private String reportPath;
        private String lockPath;
        private String outputPath;
        private String logPath;
        private String message;
        private Integer position;
        private Integer lanePosition;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class WikiMonitorDispatchPlanDTO {
        private String actionId;
        private List<String> coveredDomains = new ArrayList<>();
        private String priority;
        private String reason;
        private String advisoryNote;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class MonitorFileDTO {
        private boolean found;
        private boolean readable;
        private String path;
        private String updatedAt;
        private String errorMessage;
        private Map<String, Object> payload = new LinkedHashMap<>();
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class MonitorRunDTO {
        private boolean found;
        private boolean readable;
        private String path;
        private String summaryPath;
        private String generatedAt;
        private String outputPath;
        private String lastActionId;
        private long totalActions;
        private long completedActions;
        private long failedActions;
        private long runningActions;
        private long pendingActions;
        private long timedOutActions;
        private long totalDurationMs;
        private String errorMessage;
        private List<MonitorActionDTO> actions = new ArrayList<>();
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class MonitorActionDTO {
        private String id;
        private String runner;
        private List<String> args = new ArrayList<>();
        private String status;
        private Long timeoutMs;
        private Long durationMs;
        private boolean timedOut;
        private String heartbeatPath;
        private String snapshotPath;
        private String childStatusPath;
        private Long current;
        private Long total;
        private String startedAt;
        private Long batchOffset;
        private Long batchLimit;
        private Long overallCurrent;
        private Long overallTotal;
        private Double percent;
        private String phase;
        private String message;
        private String queue;
        private String dataStage;
        private String nextStep;
        private String lastHeartbeatAt;
        private String updatedAt;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class MonitorReportDTO {
        private String name;
        private String path;
        private String category;
        private String updatedAt;
        private Long sizeBytes;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ArchitectureLayerDTO {
        private String id;
        private String label;
        private String status;
        private Long fileCount;
        private Long readableCount;
        private Long missingCount;
        private Long errorCount;
        private String updatedAt;
        private String summary;
        private List<ArchitectureFileDTO> files = new ArrayList<>();
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ArchitectureFileDTO {
        private String label;
        private String path;
        private String latestPath;
        private boolean found;
        private boolean readable;
        private Long count;
        private Long sizeBytes;
        private String updatedAt;
        private String errorMessage;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class RegisteredTaskDTO {
        private String id;
        private String label;
        private String status;
        private String priority;
        private String lane;
        private String queueState;
        private String nextStep;
        private String dataStage;
        private Long current;
        private Long total;
        private Long overallCurrent;
        private Long overallTotal;
        private Long pending;
        private Long failed;
        private Double percent;
        private String inputPath;
        private String outputPath;
        private String reportPath;
        private String progressPath;
        private String progressSource;
        private boolean progressFound;
        private boolean progressReadable;
        private String progressUpdatedAt;
        private String progressErrorMessage;
        private Map<String, Object> progressPayload = new LinkedHashMap<>();
        private String progressHeartbeatAt;
        private Long progressHeartbeatAgeMs;
        private boolean progressStale;
        private String progressStaleReason;
        private String progressKind;
        private String updatedAt;
    }
}

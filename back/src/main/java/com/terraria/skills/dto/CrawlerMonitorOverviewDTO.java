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
    private List<MonitorRunDTO> history = new ArrayList<>();
    private List<MonitorReportDTO> recentReports = new ArrayList<>();
    private List<ArchitectureLayerDTO> architectureLayers = new ArrayList<>();
    private List<RegisteredTaskDTO> registeredTasks = new ArrayList<>();

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
        private String updatedAt;
    }
}

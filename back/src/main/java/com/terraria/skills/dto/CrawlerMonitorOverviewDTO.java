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
    private List<MonitorRunDTO> history = new ArrayList<>();

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
        private String updatedAt;
    }
}

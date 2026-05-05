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
public class DataSourceAcceptanceOverviewDTO {

    private Instant generatedAt;
    private String overallStatus;
    private int blockingCount;
    private int warningCount;
    private int missingCount;
    private List<String> blockingReasons = new ArrayList<>();
    private List<String> warningReasons = new ArrayList<>();

    private AcceptancePanelDTO relationHealth;
    private AcceptancePanelDTO replacementReadiness;
    private AcceptancePanelDTO sourceDatasetLanding;
    private AcceptancePanelDTO sourceGroupAudit;
    private AcceptancePanelDTO imageReadiness;
    private AcceptancePanelDTO crawlerMonitor;
    private AcceptancePanelDTO entitySourceCoverage;

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class AcceptancePanelDTO {
        private String id;
        private String status;
        private boolean found;
        private boolean readable;
        private String reportPath;
        private String reportPattern;
        private String generatorCommand;
        private Boolean writesDatabase;
        private Boolean requiresDatabase;
        private String notes;
        private String freshnessStatus;
        private String freshnessReason;
        private Integer staleAfterHours;
        private Long ageHours;
        private String nextEvidenceCommand;
        private String executeMode;
        private String executionPolicy;
        private Instant generatedAt;
        private String updatedAt;
        private String errorMessage;
        private Integer blockingCount;
        private Integer warningCount;
        private Map<String, Object> metrics = new LinkedHashMap<>();
        private List<AcceptanceCheckDTO> checks = new ArrayList<>();
        private List<AcceptanceFailureSampleDTO> failureSamples = new ArrayList<>();
        private List<String> sampleReportPaths = new ArrayList<>();
        private Map<String, Object> rawSummary = new LinkedHashMap<>();
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class AcceptanceCheckDTO {
        private String id;
        private String status;
        private String message;
        private String reportPath;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class AcceptanceFailureSampleDTO {
        private String entityType;
        private String entityId;
        private String sourceId;
        private String status;
        private String reason;
        private String evidencePath;
        private String recommendedAction;
        private String freshnessStatus;
        private String reportPath;
        private String sampleSource;
        private Boolean notGateEvidence;
    }
}

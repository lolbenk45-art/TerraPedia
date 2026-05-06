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
public class DomainAcceptanceOverviewDTO {

    private Instant generatedAt;
    private String overallStatus;
    private int domainCount;
    private int panelCount;
    private int blockingCount;
    private int warningCount;
    private int missingCount;
    private List<String> blockingReasons = new ArrayList<>();
    private List<String> warningReasons = new ArrayList<>();
    private Map<String, Object> summary = new LinkedHashMap<>();
    private RefreshPlanSummaryDTO refreshPlanSummary = new RefreshPlanSummaryDTO();
    private List<DomainRefreshActionDTO> actionQueue = new ArrayList<>();
    private List<DomainDTO> domains = new ArrayList<>();

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class DomainDTO {
        private String domainId;
        private String domainType;
        private String tier;
        private String chainStage;
        private String managementRoute;
        private String publicExposure;
        private String publicRoute;
        private String publicGateStatus;
        private String publicGateReason;
        private List<String> backendRefreshStepIds = new ArrayList<>();
        private String backendRefreshPlanCommand;
        private Boolean requiresDatabase;
        private String status;
        private int panelCount;
        private int blockingCount;
        private int warningCount;
        private int missingCount;
        private List<AcceptedWarningDTO> acceptedWarnings = new ArrayList<>();
        private Boolean hasActiveAcceptedWarnings;
        private int activeAcceptedWarningCount;
        private List<DomainPanelDTO> panels = new ArrayList<>();
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class DomainPanelDTO {
        private String id;
        private String domainId;
        private String panelId;
        private String chainStage;
        private String maintenanceLane;
        private String maintenanceLaneId;
        private List<String> backendRefreshStepIds = new ArrayList<>();
        private String backendRefreshPlanCommand;
        private Boolean autoMaintenanceAllowed;
        private Boolean blockingBeforePublic;
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
        private Instant generatedAt;
        private String updatedAt;
        private String errorMessage;
        private Integer blockingCount;
        private Integer warningCount;
        private AcceptedWarningDTO acceptedWarning;
        private Boolean acceptedWarningActive;
        private Boolean acceptedWarningApplies;
        private Map<String, Object> metrics = new LinkedHashMap<>();
        private List<DomainCheckDTO> checks = new ArrayList<>();
        private List<String> sampleReportPaths = new ArrayList<>();
        private Map<String, Object> rawSummary = new LinkedHashMap<>();
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class AcceptedWarningDTO {
        private String panelId;
        private String reason;
        private String approvedBy;
        private Instant approvedAt;
        private Instant expiresAt;
        private Boolean readinessOnly;
        private Boolean active;
        private Boolean applies;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class RefreshPlanSummaryDTO {
        private String overallStatus;
        private int actionCount;
        private int readyCount;
        private int confirmationCount;
        private int blockedCount;
        private int safeReadOnlyCount;
        private int unsafeActionCount;
        private int databaseRequiredCount;
        private int manualOnlyCount;
        private int affectedDomainCount;
        private int autoMaintenanceEligibleCount;
        private int manualConfirmationCount;
        private int blockingBeforePublicCount;
        private int planOnlyCount;
        private int maintenanceRoutedCount;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class DomainRefreshActionDTO {
        private String domainId;
        private String panelId;
        private String freshnessStatus;
        private String reason;
        private String command;
        private String commandRisk;
        private Boolean requiresDatabase;
        private Boolean writesDatabase;
        private String maintenanceLane;
        private String maintenanceLaneId;
        private List<String> backendRefreshStepIds = new ArrayList<>();
        private String backendRefreshPlanCommand;
        private String executionPolicy;
        private Boolean autoMaintenanceEligible;
        private Boolean manualConfirmation;
        private Boolean blockingBeforePublic;
        private String blockingBeforePublicReason;
        private String status;
        private String confirmationReason;
        private String blockedReason;
        private String executeMode;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class DomainCheckDTO {
        private String id;
        private String status;
        private String message;
        private String reportPath;
    }
}

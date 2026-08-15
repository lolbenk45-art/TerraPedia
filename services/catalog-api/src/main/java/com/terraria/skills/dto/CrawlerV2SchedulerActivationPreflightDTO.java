package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CrawlerV2SchedulerActivationPreflightDTO {
    private int schemaVersion = 1;
    private String operationId;
    private Instant observedAt;
    private EndpointDTO endpoint;
    private CrawlerV2AutomationDTO control;
    private V2StateDTO v2;
    private CountsDTO counts;
    private ReconcilerDTO reconciler;
    private List<DomainReadinessDTO> domains = new ArrayList<>();
    private boolean databaseWrites;
    private boolean networkAccess;
    private boolean isolatedResourceWrites;

    @Data
    public static class EndpointDTO {
        private String method;
        private String path;
        private String server;
    }

    @Data
    public static class V2StateDTO {
        private String stateStoreEpoch;
        private String namespace;
        private Integer queueContractVersion;
    }

    @Data
    public static class CountsDTO {
        private int liveAttempts;
        private int sweepClaims;
    }

    @Data
    public static class ReconcilerDTO {
        private String status;
        private int overdueAttemptCount;
        private int failureCount;
    }

    @Data
    public static class DomainReadinessDTO {
        private String domain;
        private String actionId;
        private String readinessStatus;
        private String sourceHash;
        private Instant observedAt;
        private String evidencePath;
        private String stateStoreEpoch;
    }
}

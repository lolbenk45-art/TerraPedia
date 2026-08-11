package com.terraria.skills.service.impl;

import com.terraria.skills.config.CrawlerQueueV2Properties;
import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import com.terraria.skills.dto.CrawlerQueueV2OverviewDTO;
import com.terraria.skills.dto.CrawlerV2AutomationDTO;
import com.terraria.skills.dto.CrawlerV2SchedulerActivationPreflightDTO;
import com.terraria.skills.dto.DomainAcceptanceOverviewDTO;
import com.terraria.skills.service.CrawlerMonitorService;
import com.terraria.skills.service.CrawlerV2SchedulerActivationPreflightService;
import com.terraria.skills.service.DomainAcceptanceService;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class CrawlerV2SchedulerActivationPreflightServiceImpl
    implements CrawlerV2SchedulerActivationPreflightService {

    private static final String OPERATION_ID = "canonical-crawler-v2-scheduler-activation";
    private static final String ENDPOINT_PATH = "/admin/crawler-monitor/v2/automation/preflight";

    private final CrawlerMonitorService monitorService;
    private final DomainAcceptanceService domainAcceptanceService;
    private final CrawlerQueueV2Properties queueProperties;

    public CrawlerV2SchedulerActivationPreflightServiceImpl(
        CrawlerMonitorService monitorService,
        DomainAcceptanceService domainAcceptanceService,
        CrawlerQueueV2Properties queueProperties
    ) {
        this.monitorService = Objects.requireNonNull(monitorService, "monitorService");
        this.domainAcceptanceService = Objects.requireNonNull(domainAcceptanceService, "domainAcceptanceService");
        this.queueProperties = Objects.requireNonNull(queueProperties, "queueProperties");
    }

    @Override
    public CrawlerV2SchedulerActivationPreflightDTO getPreflight() {
        CrawlerMonitorOverviewDTO overview = Objects.requireNonNull(monitorService.getOverview(), "monitor overview");
        CrawlerV2AutomationDTO control = Objects.requireNonNull(monitorService.getV2AutomationSettings(), "automation control");
        DomainAcceptanceOverviewDTO domainAcceptance = Objects.requireNonNull(
            domainAcceptanceService.getOverview(), "domain acceptance overview"
        );
        Instant observedAt = Instant.now();

        CrawlerV2SchedulerActivationPreflightDTO result = new CrawlerV2SchedulerActivationPreflightDTO();
        result.setOperationId(OPERATION_ID);
        result.setObservedAt(observedAt);
        result.setEndpoint(endpoint());
        result.setControl(control);
        result.setV2(v2State(overview));
        result.setCounts(counts(overview));
        result.setReconciler(reconciler(overview));
        result.setDomains(domainReadiness(overview, domainAcceptance, observedAt));
        result.setDatabaseWrites(false);
        result.setNetworkAccess(false);
        result.setIsolatedResourceWrites(false);
        return result;
    }

    private CrawlerV2SchedulerActivationPreflightDTO.EndpointDTO endpoint() {
        CrawlerV2SchedulerActivationPreflightDTO.EndpointDTO endpoint =
            new CrawlerV2SchedulerActivationPreflightDTO.EndpointDTO();
        endpoint.setMethod("GET");
        endpoint.setPath(ENDPOINT_PATH);
        endpoint.setServer("spring-backend");
        return endpoint;
    }

    private CrawlerV2SchedulerActivationPreflightDTO.V2StateDTO v2State(CrawlerMonitorOverviewDTO overview) {
        CrawlerV2SchedulerActivationPreflightDTO.V2StateDTO state =
            new CrawlerV2SchedulerActivationPreflightDTO.V2StateDTO();
        state.setStateStoreEpoch(overview.getStateStoreEpoch());
        state.setNamespace(queueProperties.resolveRedisNamespace());
        state.setQueueContractVersion(overview.getQueueContractVersion());
        return state;
    }

    private CrawlerV2SchedulerActivationPreflightDTO.CountsDTO counts(CrawlerMonitorOverviewDTO overview) {
        CrawlerV2SchedulerActivationPreflightDTO.CountsDTO counts =
            new CrawlerV2SchedulerActivationPreflightDTO.CountsDTO();
        String epoch = overview.getStateStoreEpoch();
        counts.setLiveAttempts((int) safeList(overview.getLiveQueue()).stream()
            .filter(attempt -> Objects.equals(epoch, attempt.stateStoreEpoch()))
            .filter(attempt -> !terminal(attempt.status()))
            .count());
        counts.setSweepClaims(monitorService.getV2AutomationSweepClaimCount());
        return counts;
    }

    private CrawlerV2SchedulerActivationPreflightDTO.ReconcilerDTO reconciler(CrawlerMonitorOverviewDTO overview) {
        CrawlerV2SchedulerActivationPreflightDTO.ReconcilerDTO reconciler =
            new CrawlerV2SchedulerActivationPreflightDTO.ReconcilerDTO();
        CrawlerQueueV2OverviewDTO.HealthDTO health = overview.getReconcilerHealth();
        reconciler.setStatus(health == null ? null : health.status());
        reconciler.setOverdueAttemptCount(health == null ? 0 : Math.toIntExact(health.overdueAttemptCount()));
        reconciler.setFailureCount(health != null && health.reasonCode() != null ? 1 : 0);
        return reconciler;
    }

    private List<CrawlerV2SchedulerActivationPreflightDTO.DomainReadinessDTO> domainReadiness(
        CrawlerMonitorOverviewDTO overview,
        DomainAcceptanceOverviewDTO acceptance,
        Instant observedAt
    ) {
        Map<String, DomainAcceptanceOverviewDTO.DomainDTO> acceptanceByDomain = safeList(acceptance.getDomains()).stream()
            .collect(Collectors.toMap(DomainAcceptanceOverviewDTO.DomainDTO::getDomainId, Function.identity(), (left, right) -> left));
        List<CrawlerV2SchedulerActivationPreflightDTO.DomainReadinessDTO> result = new ArrayList<>();
        for (CrawlerQueueV2OverviewDTO.DomainStateDTO state : safeList(overview.getDomainStates())) {
            // The enablement gate covers only the domains the scheduler will
            // actually auto-dispatch (the auto-ingestion set). Domains outside
            // it are never triggered by automation, so requiring their
            // acceptance panels here would block enablement on evidence the
            // scheduler never consumes. See CrawlerMonitorActionRegistry.AUTO_DISPATCH_DOMAINS.
            if (!CrawlerMonitorActionRegistry.AUTO_DISPATCH_DOMAINS.contains(state.domain())) {
                continue;
            }
            for (CrawlerQueueV2OverviewDTO.OperationDTO operation : safeList(state.operations())) {
                DomainAcceptanceOverviewDTO.DomainDTO accepted = acceptanceByDomain.get(state.domain());
                DomainAcceptanceOverviewDTO.DomainPanelDTO panel = firstPanel(accepted);
                CrawlerV2SchedulerActivationPreflightDTO.DomainReadinessDTO readiness =
                    new CrawlerV2SchedulerActivationPreflightDTO.DomainReadinessDTO();
                String sourceHash = hashReport(panel, overview.getRepoRoot());
                readiness.setDomain(state.domain());
                readiness.setActionId(operation.actionId());
                readiness.setReadinessStatus(isEligible(accepted, panel, sourceHash) ? "eligible" : "blocked");
                readiness.setEvidencePath(panel == null ? null : panel.getReportPath());
                readiness.setSourceHash(sourceHash);
                readiness.setObservedAt(panel != null && panel.getGeneratedAt() != null
                    ? panel.getGeneratedAt() : observedAt);
                readiness.setStateStoreEpoch(overview.getStateStoreEpoch());
                result.add(readiness);
            }
        }
        return result;
    }

    private boolean isEligible(
        DomainAcceptanceOverviewDTO.DomainDTO domain,
        DomainAcceptanceOverviewDTO.DomainPanelDTO panel,
        String sourceHash
    ) {
        return domain != null
            && "pass".equalsIgnoreCase(domain.getStatus())
            && panel != null
            && panel.isFound()
            && panel.isReadable()
            && "fresh".equalsIgnoreCase(panel.getFreshnessStatus())
            && !Boolean.TRUE.equals(panel.getWritesDatabase())
            && sourceHash != null;
    }

    private DomainAcceptanceOverviewDTO.DomainPanelDTO firstPanel(DomainAcceptanceOverviewDTO.DomainDTO domain) {
        return domain == null || domain.getPanels() == null || domain.getPanels().isEmpty()
            ? null : domain.getPanels().get(0);
    }

    private String hashReport(DomainAcceptanceOverviewDTO.DomainPanelDTO panel, String repoRoot) {
        if (panel == null || panel.getReportPath() == null || panel.getReportPath().isBlank()) return null;
        Path root = (repoRoot == null || repoRoot.isBlank() ? Path.of(".") : Path.of(repoRoot))
            .toAbsolutePath().normalize();
        Path report = root.resolve(panel.getReportPath()).normalize();
        if (!report.startsWith(root)) return null;
        try {
            if (!Files.isRegularFile(report, LinkOption.NOFOLLOW_LINKS)) return null;
            byte[] bytes = Files.readAllBytes(report);
            return "sha256:" + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception exception) {
            return null;
        }
    }

    private boolean terminal(String status) {
        if (status == null) return false;
        return switch (status.toUpperCase()) {
            case "COMPLETED", "FAILED", "CANCELLED", "RECLAIMED", "FORCE_RECLAIMED" -> true;
            default -> false;
        };
    }

    private <T> List<T> safeList(List<T> values) {
        return values == null ? List.of() : values;
    }
}

package com.terraria.skills.service.impl;

import com.terraria.skills.dto.CrawlerAutomationApprovalRequestDTO;
import com.terraria.skills.dto.CrawlerAutomationOverviewDTO;
import com.terraria.skills.dto.CrawlerAutomationRunDTO;
import com.terraria.skills.entity.CrawlerAutomationApproval;
import com.terraria.skills.mapper.CrawlerAutomationApprovalMapper;
import com.terraria.skills.mapper.CrawlerAutomationPolicyMapper;
import com.terraria.skills.mapper.CrawlerAutomationRunMapper;
import com.terraria.skills.service.CrawlerAutomationPolicyService;
import com.terraria.skills.service.CrawlerAutomationService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

@Service
public class CrawlerAutomationServiceImpl implements CrawlerAutomationService {

    private final CrawlerAutomationRunMapper runMapper;
    private final CrawlerAutomationPolicyMapper policyMapper;
    private final CrawlerAutomationApprovalMapper approvalMapper;
    private final CrawlerAutomationPolicyService policyService;
    private final CrawlerMonitorActionRegistry actionRegistry;
    private final boolean readOnlyProfile;

    public CrawlerAutomationServiceImpl(
        CrawlerAutomationRunMapper runMapper,
        CrawlerAutomationPolicyMapper policyMapper,
        CrawlerAutomationApprovalMapper approvalMapper,
        CrawlerAutomationPolicyService policyService,
        CrawlerMonitorActionRegistry actionRegistry,
        @Value("${terraria.crawler.automation.read-only:true}") boolean readOnlyProfile
    ) {
        this.runMapper = Objects.requireNonNull(runMapper);
        this.policyMapper = Objects.requireNonNull(policyMapper);
        this.approvalMapper = Objects.requireNonNull(approvalMapper);
        this.policyService = Objects.requireNonNull(policyService);
        this.actionRegistry = Objects.requireNonNull(actionRegistry);
        this.readOnlyProfile = readOnlyProfile;
    }

    @Override
    public CrawlerAutomationOverviewDTO getOverview() {
        // Read-only: collect domain summaries and active alert counts from DB
        List<CrawlerAutomationOverviewDTO.DomainSummary> rawDomains =
            runMapper.findActiveDomainSummaries();
        if (rawDomains == null) rawDomains = Collections.emptyList();
        List<CrawlerAutomationOverviewDTO.DomainSummary> domains = new ArrayList<>();
        Set<String> bootstrappedDomains = new HashSet<>();
        for (CrawlerAutomationOverviewDTO.DomainSummary domain : rawDomains) {
            domains.add(withDisabledReasons(domain, false));
            bootstrappedDomains.add(domain.domainId());
        }
        actionRegistry.all().stream()
            .map(CrawlerMonitorActionDefinition::domain)
            .distinct()
            .filter(domainId -> !bootstrappedDomains.contains(domainId))
            .map(domainId -> new CrawlerAutomationOverviewDTO.DomainSummary(
                domainId, "L0", "DISABLED", null, null, null, List.of()
            ))
            .map(domain -> withDisabledReasons(domain, true))
            .forEach(domains::add);

        long openCircuits = domains.stream()
            .filter(d -> "CIRCUIT_OPEN".equals(d.operationalState()))
            .count();
        long pendingApprovals = domains.stream()
            .filter(d -> "AWAITING_APPROVAL".equals(d.lastRunStatus()))
            .count();
        long abnormal = domains.stream()
            .filter(d -> !List.of("DISABLED", "SHADOW").contains(d.operationalState())
                && d.lastRunStatus() != null
                && !List.of("COMMITTED", "BLOCKED_L0").contains(d.lastRunStatus()))
            .count();

        return new CrawlerAutomationOverviewDTO(
            java.time.LocalDateTime.now().toString(),
            (int) openCircuits,
            (int) pendingApprovals,
            (int) abnormal,
            domains
        );
    }

    @Override
    public CrawlerAutomationRunDTO getRun(String runId) {
        Objects.requireNonNull(runId, "runId is required");
        var context = runMapper.findDecisionContext(runId, null);
        if (context == null) return null;
        return toDTO(context);
    }

    @Override
    public List<CrawlerAutomationRunDTO> listRecentRuns(int limit) {
        if (limit < 1 || limit > 100) throw new IllegalArgumentException("limit must be 1-100");
        List<CrawlerAutomationPolicyService.DecisionContext> recent =
            runMapper.findRecentDecisionContexts(limit);
        if (recent == null) return Collections.emptyList();
        return recent.stream().map(this::toDTO).toList();
    }

    @Override
    public String submitApproval(CrawlerAutomationApprovalRequestDTO request) {
        if (readOnlyProfile) {
            throw new IllegalStateException("mutation controls are disabled in read-only profile");
        }
        Objects.requireNonNull(request, "approval request is required");

        CrawlerAutomationApproval approval = policyService.consumeApproval(
            new CrawlerAutomationPolicyService.ApprovalRequest(
                request.requestKey(),
                request.runId(),
                request.decisionHash(),
                request.actor(),
                request.reauthId(),
                request.action(),
                request.reason(),
                request.expectedRunVersion()
            )
        );
        return approval.getRequestKey();
    }

    @Override
    public boolean isReadOnlyProfile() {
        return readOnlyProfile;
    }

    private CrawlerAutomationOverviewDTO.DomainSummary withDisabledReasons(
        CrawlerAutomationOverviewDTO.DomainSummary domain,
        boolean policyNotBootstrapped
    ) {
        List<CrawlerAutomationOverviewDTO.DisabledReason> reasons = new ArrayList<>();
        if (policyNotBootstrapped) {
            reasons.add(reason("POLICY_NOT_BOOTSTRAPPED", "当前域尚未完成策略 bootstrap。"));
        }
        if (readOnlyProfile) {
            reasons.add(reason("T2_READ_ONLY_PROFILE", "T2 只读环境禁止自动入库变更。"));
        }
        switch (String.valueOf(domain.operationalState())) {
            case "DISABLED" -> reasons.add(reason("POLICY_DISABLED", "自动化策略当前为禁用状态。"));
            case "SHADOW" -> reasons.add(reason("SHADOW_READ_ONLY", "当前域仅运行只读 shadow，不允许入库。"));
            case "CIRCUIT_OPEN" -> reasons.add(reason("CIRCUIT_OPEN", "断路器已打开，需先处理异常并重新审批。"));
            case "null", "" -> reasons.add(reason("POLICY_STATE_UNAVAILABLE", "后端未返回有效策略状态，已按禁用处理。"));
            default -> { }
        }
        if ("L0".equals(domain.automationLevel())) {
            reasons.add(reason("AUTOMATION_LEVEL_L0", "当前自动化等级为 L0，不允许自动入库。"));
        } else if (domain.automationLevel() == null || domain.automationLevel().isBlank()) {
            reasons.add(reason("POLICY_LEVEL_UNAVAILABLE", "后端未返回有效自动化等级，已按 L0 处理。"));
        }
        if ("AWAITING_APPROVAL".equals(domain.lastRunStatus())) {
            reasons.add(reason("OWNER_APPROVAL_REQUIRED", "最近运行正在等待 Owner 审批。"));
        }
        if ("L2".equals(domain.automationLevel()) && "ACTIVE".equals(domain.operationalState())) {
            CrawlerAutomationPolicyService.AutomationEligibility eligibility =
                policyService.schedulerEligibility(domain.domainId());
            if (eligibility == null || !eligibility.eligible()) {
                List<String> schedulerReasons = eligibility == null
                    ? List.of("SCHEDULER_ELIGIBILITY_UNAVAILABLE")
                    : eligibility.reasonCodes();
                schedulerReasons.forEach(code -> reasons.add(reason(code, schedulerReasonMessage(code))));
            }
        }
        return new CrawlerAutomationOverviewDTO.DomainSummary(
            domain.domainId(),
            domain.automationLevel(),
            domain.operationalState(),
            domain.lastRunId(),
            domain.lastRunStatus(),
            domain.lastRunCompletedAt(),
            domain.activeAlerts(),
            reasons
        );
    }

    private static CrawlerAutomationOverviewDTO.DisabledReason reason(String code, String messageZh) {
        return new CrawlerAutomationOverviewDTO.DisabledReason(code, messageZh);
    }

    private static String schedulerReasonMessage(String code) {
        return switch (code) {
            case "SCHEDULER_ACTIVATION_DECISION_REQUIRED" -> "缺少与当前策略绑定的调度激活授权。";
            case "SCHEDULER_ACTIVATION_DECISION_STALE" -> "调度激活授权已过期或尚未生效。";
            case "L2_REPEATED_L1_EVIDENCE_REQUIRED" -> "尚未达到重复成功 L1 入库证据要求。";
            case "POLICY_CIRCUIT_OPEN" -> "断路器已打开，调度保持禁用。";
            default -> "调度激活条件未满足，已按禁用处理。";
        };
    }

    private CrawlerAutomationRunDTO toDTO(CrawlerAutomationPolicyService.DecisionContext ctx) {
        var decision = new CrawlerAutomationRunDTO.DecisionSummary(
            ctx.decision(),
            ctx.decisionHash(),
            parseReasonCodes(ctx.reasonCodesJson()),
            ctx.snapshotRequired(),
            isApprovable(ctx.decision()),
            "AUTO_APPLY_L2".equals(ctx.decision())
        );
        return new CrawlerAutomationRunDTO(
            ctx.runId(),
            ctx.runId(),        // primaryDomainId not available in DecisionContext - use runId
            Collections.emptyList(),
            ctx.policySetHash(),
            null,
            ctx.runStatus(),
            ctx.baselineFingerprint(),
            ctx.runVersion(),
            null,
            null,
            decision
        );
    }

    private static boolean isApprovable(String decision) {
        return "REQUIRES_OWNER_L1".equals(decision);
    }

    private static List<String> parseReasonCodes(String json) {
        if (json == null || json.isBlank()) return Collections.emptyList();
        try {
            // Simple JSON array parse without full ObjectMapper dependency
            String trimmed = json.trim();
            if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return Collections.emptyList();
            String inner = trimmed.substring(1, trimmed.length() - 1).trim();
            if (inner.isEmpty()) return Collections.emptyList();
            return java.util.Arrays.stream(inner.split(","))
                .map(s -> s.trim().replaceAll("^\"|\"$", ""))
                .filter(s -> !s.isEmpty())
                .toList();
        } catch (Exception ignored) {
            return Collections.emptyList();
        }
    }
}

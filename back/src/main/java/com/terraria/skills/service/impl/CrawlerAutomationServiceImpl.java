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
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;
import java.util.Objects;

@Service
public class CrawlerAutomationServiceImpl implements CrawlerAutomationService {

    private final CrawlerAutomationRunMapper runMapper;
    private final CrawlerAutomationPolicyMapper policyMapper;
    private final CrawlerAutomationApprovalMapper approvalMapper;
    private final CrawlerAutomationPolicyService policyService;
    private final boolean readOnlyProfile;

    public CrawlerAutomationServiceImpl(
        CrawlerAutomationRunMapper runMapper,
        CrawlerAutomationPolicyMapper policyMapper,
        CrawlerAutomationApprovalMapper approvalMapper,
        CrawlerAutomationPolicyService policyService
    ) {
        this(runMapper, policyMapper, approvalMapper, policyService, false);
    }

    public CrawlerAutomationServiceImpl(
        CrawlerAutomationRunMapper runMapper,
        CrawlerAutomationPolicyMapper policyMapper,
        CrawlerAutomationApprovalMapper approvalMapper,
        CrawlerAutomationPolicyService policyService,
        boolean readOnlyProfile
    ) {
        this.runMapper = Objects.requireNonNull(runMapper);
        this.policyMapper = Objects.requireNonNull(policyMapper);
        this.approvalMapper = Objects.requireNonNull(approvalMapper);
        this.policyService = Objects.requireNonNull(policyService);
        this.readOnlyProfile = readOnlyProfile;
    }

    @Override
    public CrawlerAutomationOverviewDTO getOverview() {
        // Read-only: collect domain summaries and active alert counts from DB
        List<CrawlerAutomationOverviewDTO.DomainSummary> domains =
            runMapper.findActiveDomainSummaries();
        if (domains == null) domains = Collections.emptyList();

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

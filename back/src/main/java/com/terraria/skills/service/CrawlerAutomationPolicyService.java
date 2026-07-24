package com.terraria.skills.service;

import com.terraria.skills.entity.CrawlerAutomationApproval;

import java.util.List;

public interface CrawlerAutomationPolicyService {

    Decision evaluate(EvaluationRequest request);

    CrawlerAutomationApproval consumeApproval(ApprovalRequest request);

    ApplyAuthorization authorizeApply(ApplyAuthorizationRequest request);

    void executeApprovedL1(ApplyAuthorization authorization);

    void executeAutoApplyL2(ApplyAuthorization authorization);

    /**
     * Task 5 implementations must use only transaction-participating DAOs and
     * must not open REQUIRES_NEW transactions or independent write connections.
     */
    @FunctionalInterface
    interface ApplyProtocolExecutor {
        void execute(ApplyAuthorization authorization);
    }

    enum DecisionType { BLOCKED_L0, REQUIRES_OWNER_L1, AUTO_APPLY_L2, CIRCUIT_BREAK }

    record ScopeChangeCounts(
        String scopeId,
        long entityBaselineCount,
        long relationshipBaselineCount,
        long inserts,
        long updates,
        long relationshipDeletes,
        long softDisables,
        long hardDeletes
    ) { }

    record ChangeCounts(
        long entityBaselineCount,
        long relationshipBaselineCount,
        long inserts,
        long updates,
        long relationshipDeletes,
        long softDisables,
        long hardDeletes
    ) { }

    record PolicyLimits(
        double insertRatio, long insertAbsolute,
        double updateRatio, long updateAbsolute,
        double relationshipDeleteRatio, long relationshipDeleteAbsolute,
        double softDisableRatio, long softDisableAbsolute
    ) { }

    record PolicyRow(String domainId, long policyVersion, String policyHash) { }

    record EvaluationRequest(
        String runId,
        String domainId,
        String level,
        String policySetHash,
        String evidenceHash,
        String bundleHash,
        String logicalDiffHash,
        String logicalDiffIdentityJson,
        String baselineFingerprint,
        String plannedApplyActionId,
        List<PolicyRow> policyRows,
        List<ScopeChangeCounts> scopes,
        ChangeCounts counts,
        PolicyLimits limits,
        boolean anomaly,
        boolean wholeDomainRebuild,
        boolean requiredGatesPassed
    ) { }

    record Decision(
        DecisionType type,
        List<String> reasonCodes,
        String decisionHash,
        String policySetHash,
        String evidenceHash,
        String bundleHash,
        String logicalDiffHash,
        String logicalDiffIdentityJson,
        String baselineFingerprint,
        String plannedApplyActionId,
        List<PolicyRow> policyRows,
        String countsRatiosJson,
        boolean snapshotRequired,
        boolean approvable,
        boolean writeIntent
    ) { }

    record ApprovalRequest(
        String requestKey,
        String runId,
        String decisionHash,
        String actor,
        String reauthId,
        String action,
        String reason,
        long expectedRunVersion
    ) { }

    enum ApplyMode { AUTO_APPLY_L2, APPROVED_OWNER_L1 }

    record ApplyAuthorizationRequest(
        String runId,
        String decisionHash,
        ApplyMode mode
    ) { }

    record ApplyAuthorization(Long approvalId, Long approvalVersion, ApplyMode mode, String runId,
                              String decisionHash, String contextFingerprint) { }

    record DecisionContext(
        String runId,
        String runStatus,
        long runVersion,
        String decision,
        String decisionHash,
        String reasonCodesJson,
        String policySetHash,
        String evidenceHash,
        String bundleHash,
        String logicalDiffHash,
        String logicalDiffIdentityJson,
        String baselineFingerprint,
        String plannedApplyActionId,
        boolean snapshotRequired
    ) { }

    record OwnerRecord(String username, String status, long version) { }

    record PolicyState(String domainId, long policyVersion, String policyHash,
                       String currentLevel, String operationalState) { }

    record RunPolicyRow(String domainId, long policyVersion, String policyHash,
                        String policySetHash) { }

    interface ApplyContextProvider {
        TrustedApplyContext load(String runId, String decisionHash, ApplyMode mode);
    }

    record TrustedApplyContext(
        String bundleHash,
        String policySetHash,
        String evidenceHash,
        String logicalDiffHash,
        String logicalDiffIdentityJson,
        String baselineFingerprint,
        long currentRunVersion,
        String runStatus,
        boolean schemaValid,
        boolean capabilityValid,
        boolean gatesValid,
        boolean mutationGenerationValid,
        boolean withinCurrentCeilings
    ) { }
}

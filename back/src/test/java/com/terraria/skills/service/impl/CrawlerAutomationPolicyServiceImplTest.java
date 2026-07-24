package com.terraria.skills.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.entity.CrawlerAutomationApproval;
import com.terraria.skills.mapper.CrawlerAutomationApprovalMapper;
import com.terraria.skills.mapper.CrawlerAutomationDecisionMapper;
import com.terraria.skills.mapper.CrawlerAutomationPolicyMapper;
import com.terraria.skills.mapper.CrawlerAutomationRunMapper;
import com.terraria.skills.service.CrawlerAutomationPolicyService;
import com.terraria.skills.service.CrawlerAutomationPolicyService.ApplyAuthorization;
import com.terraria.skills.service.CrawlerAutomationPolicyService.ApplyAuthorizationRequest;
import com.terraria.skills.service.CrawlerAutomationPolicyService.ApplyMode;
import com.terraria.skills.service.CrawlerAutomationPolicyService.ApplyContextProvider;
import com.terraria.skills.service.CrawlerAutomationPolicyService.ApplyProtocolExecutor;
import com.terraria.skills.service.CrawlerAutomationPolicyService.TrustedApplyContext;
import com.terraria.skills.service.CrawlerAutomationPolicyService.ApprovalRequest;
import com.terraria.skills.service.CrawlerAutomationPolicyService.ChangeCounts;
import com.terraria.skills.service.CrawlerAutomationPolicyService.Decision;
import com.terraria.skills.service.CrawlerAutomationPolicyService.DecisionContext;
import com.terraria.skills.service.CrawlerAutomationPolicyService.DecisionType;
import com.terraria.skills.service.CrawlerAutomationPolicyService.EvaluationRequest;
import com.terraria.skills.service.CrawlerAutomationPolicyService.OwnerRecord;
import com.terraria.skills.service.CrawlerAutomationPolicyService.PolicyLimits;
import com.terraria.skills.service.CrawlerAutomationPolicyService.PolicyRow;
import com.terraria.skills.service.CrawlerAutomationPolicyService.PolicyState;
import com.terraria.skills.service.CrawlerAutomationPolicyService.ScopeChangeCounts;
import com.terraria.skills.service.CrawlerAutomationPolicyService.RunPolicyRow;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class CrawlerAutomationPolicyServiceImplTest {

    private static final String POLICY_HASH = sha('a');
    private static final String POLICY_SET_HASH = sha("[{\"domainId\":\"recipes\",\"policyVersion\":1,\"policyHash\":\"" + POLICY_HASH + "\"}]");
    private static final String EVIDENCE_HASH = sha('b');
    private static final String BUNDLE_HASH = sha('c');
    private static final String BASELINE = sha('e');
    private static final String DIFF_IDENTITY = identity(new ScopeChangeCounts("recipes:wiki_gg", 100, 100, 0, 0, 0, 0, 0));
    private static final String DIFF_HASH = sha(DIFF_IDENTITY);

    private CrawlerAutomationApprovalMapper approvalMapper;
    private CrawlerAutomationRunMapper runMapper;
    private CrawlerAutomationPolicyMapper policyMapper;
    private CrawlerAutomationDecisionMapper decisionMapper;
    private ApplyContextProvider applyContextProvider;
    private ApplyProtocolExecutor applyProtocolExecutor;
    private CrawlerAutomationPolicyServiceImpl service;

    @BeforeEach
    void setUp() {
        approvalMapper = mock(CrawlerAutomationApprovalMapper.class);
        runMapper = mock(CrawlerAutomationRunMapper.class);
        policyMapper = mock(CrawlerAutomationPolicyMapper.class);
        decisionMapper = mock(CrawlerAutomationDecisionMapper.class);
        applyContextProvider = mock(ApplyContextProvider.class);
        applyProtocolExecutor = mock(ApplyProtocolExecutor.class);
        when(decisionMapper.insert(any())).thenReturn(1);
        when(runMapper.countStaleRunPolicies("run-1")).thenReturn(0);
        when(runMapper.findRunPolicies("run-1")).thenReturn(List.of(new RunPolicyRow("recipes", 1, POLICY_HASH, POLICY_SET_HASH)));
        when(policyMapper.findPolicyState("recipes")).thenReturn(new PolicyState("recipes", 1, POLICY_HASH, "L2", "ACTIVE"));
        TransactionSynchronizationManager.setActualTransactionActive(true);
        service = new CrawlerAutomationPolicyServiceImpl(approvalMapper, runMapper, policyMapper, decisionMapper,
            new ObjectMapper(), applyContextProvider, applyProtocolExecutor);
    }

    @AfterEach
    void tearDown() {
        TransactionSynchronizationManager.clear();
    }

    @Test
    void l0NeverCreatesWriteIntent() {
        when(policyMapper.findPolicyState("recipes")).thenReturn(new PolicyState("recipes", 1, POLICY_HASH, "L0", "ACTIVE"));
        Decision decision = service.evaluate(request("L0", counts(100, 0, 0, 0, 0), false, false, true));
        assertEquals(DecisionType.BLOCKED_L0, decision.type());
        assertFalse(decision.writeIntent());
    }

    @Test
    void disabledPersistedPolicyCannotCreateL2Decision() {
        when(policyMapper.findPolicyState("recipes")).thenReturn(new PolicyState("recipes", 1, POLICY_HASH, "L2", "DISABLED"));

        Decision decision = service.evaluate(request("L2", counts(100, 1, 0, 0, 0), false, false, true));

        assertEquals(DecisionType.BLOCKED_L0, decision.type());
        assertFalse(decision.writeIntent());
    }

    @Test
    void callerCannotPromotePersistedL1PolicyToL2() {
        when(policyMapper.findPolicyState("recipes")).thenReturn(new PolicyState("recipes", 1, POLICY_HASH, "L1", "ACTIVE"));

        Decision decision = service.evaluate(request("L2", counts(100, 1, 0, 0, 0), false, false, true));

        assertEquals(DecisionType.CIRCUIT_BREAK, decision.type());
        assertFalse(decision.writeIntent());
    }

    @Test
    void decisionIsPersistedAsAnImmutableFact() {
        service.evaluate(request("L2", counts(100, 1, 0, 0, 0), false, false, true));

        verify(decisionMapper).insert(any());
    }

    @Test
    void thresholdEqualityIsAllowedForL2() {
        Decision decision = service.evaluate(request("L2", counts(100, 10, 10, 5, 0), false, false, true));
        assertEquals(DecisionType.AUTO_APPLY_L2, decision.type());
        assertTrue(decision.writeIntent());
    }

    @Test
    void thresholdOverflowRequiresOwnerL1WithoutWriteIntent() {
        Decision decision = service.evaluate(request("L2", counts(100, 11, 0, 0, 0), false, false, true));
        assertEquals(DecisionType.REQUIRES_OWNER_L1, decision.type());
        assertFalse(decision.writeIntent());
        assertTrue(decision.reasonCodes().contains("INSERT_THRESHOLD_EXCEEDED"));
    }

    @Test
    void concentratedParentScopeCannotHideRelationshipDeleteOverflow() {
        EvaluationRequest request = requestForScope("L2", new ChangeCounts(10_000, 5, 0, 0, 5, 0, 0), false, false, true, new ScopeChangeCounts("parent:1", 10_000, 5, 0, 0, 5, 0, 0));
        assertEquals(DecisionType.REQUIRES_OWNER_L1, service.evaluate(request).type());
    }

    @Test
    void zeroBaselineNonInsertMutationTripsCircuitBreaker() {
        assertEquals(DecisionType.CIRCUIT_BREAK, service.evaluate(request("L2", counts(0, 0, 1, 0, 0), false, false, true,
            new ScopeChangeCounts("empty", 0, 0, 0, 1, 0, 0, 0))).type());
    }

    @Test
    void anomalyCannotBeApprovedAndTripsCircuitBreaker() {
        Decision decision = service.evaluate(request("L2", counts(100, 1, 0, 0, 0), true, false, true));
        assertEquals(DecisionType.CIRCUIT_BREAK, decision.type());
        assertFalse(decision.approvable());
    }

    @Test
    void forgedApprovalWithoutPersistedL1DecisionIsRejected() {
        when(runMapper.findDecisionContext("run-1", DIFF_HASH)).thenReturn(null);
        assertThrows(IllegalStateException.class, () -> service.consumeApproval(approvalRequest()));
    }

    @Test
    void ownerApprovalBindsPersistedIdentityAndIsIdempotentByRequestKey() {
        when(runMapper.findDecisionContext("run-1", DIFF_HASH)).thenReturn(context());
        when(policyMapper.findOwner()).thenReturn(new OwnerRecord("owner", "ACTIVE", 1));
        when(policyMapper.consumeReauth("reauth-1", "owner")).thenReturn(1);
        CrawlerAutomationApproval stored = approvalEntity();
        when(approvalMapper.findByRequestKey("approve-1")).thenReturn(null, stored);
        when(approvalMapper.insert(any())).thenReturn(1);

        assertEquals(stored, service.consumeApproval(approvalRequest()));
        assertEquals(stored, service.consumeApproval(approvalRequest()));
    }

    @Test
    void approvedL1ReturnsReservationWithoutConsumingBeforeApply() {
        when(runMapper.findDecisionContext("run-1", DIFF_HASH)).thenReturn(context());
        when(approvalMapper.findLatestForDecision("run-1", DIFF_HASH)).thenReturn(approvalEntity());
        when(applyContextProvider.load("run-1", DIFF_HASH, ApplyMode.APPROVED_OWNER_L1)).thenReturn(trustedContext());

        ApplyAuthorization authorization = service.authorizeApply(new ApplyAuthorizationRequest(
            "run-1", DIFF_HASH, ApplyMode.APPROVED_OWNER_L1
        ));

        assertEquals(1L, authorization.approvalId());
    }

    @Test
    void l2AuthorizationDoesNotNeedOwnerApprovalButRequiresPersistedAutoDecision() {
        DecisionContext l2 = new DecisionContext("run-1", "READY", 4L, "AUTO_APPLY_L2", DIFF_HASH,
            "[\"WITHIN_POLICY_CEILINGS\"]", POLICY_SET_HASH, EVIDENCE_HASH, BUNDLE_HASH, DIFF_HASH,
            DIFF_IDENTITY, BASELINE, "recipe-reference-apply", true);
        when(runMapper.findDecisionContext("run-1", DIFF_HASH)).thenReturn(l2);
        when(applyContextProvider.load("run-1", DIFF_HASH, ApplyMode.AUTO_APPLY_L2)).thenReturn(trustedContext());

        assertEquals(ApplyMode.AUTO_APPLY_L2, service.authorizeApply(new ApplyAuthorizationRequest(
            "run-1", DIFF_HASH, ApplyMode.AUTO_APPLY_L2
        )).mode());
    }

    @Test
    void changedBundlePolicyOrDiffIdentityRejectsApply() {
        when(runMapper.findDecisionContext("run-1", DIFF_HASH)).thenReturn(context());
        when(approvalMapper.findLatestForDecision("run-1", DIFF_HASH)).thenReturn(approvalEntity());
        when(applyContextProvider.load("run-1", DIFF_HASH, ApplyMode.APPROVED_OWNER_L1)).thenReturn(new TrustedApplyContext(
            sha('f'), POLICY_SET_HASH, EVIDENCE_HASH, DIFF_HASH, DIFF_IDENTITY, BASELINE, 4L,
            "SNAPSHOT_READY", true, true, true, true, true));

        assertThrows(IllegalStateException.class, () -> service.authorizeApply(new ApplyAuthorizationRequest(
            "run-1", DIFF_HASH, ApplyMode.APPROVED_OWNER_L1
        )));
    }

    @Test
    void staleOptimisticVersionRejectsApply() {
        when(runMapper.findDecisionContext("run-1", DIFF_HASH)).thenReturn(context());
        when(applyContextProvider.load("run-1", DIFF_HASH, ApplyMode.AUTO_APPLY_L2)).thenReturn(trustedContext());
        assertThrows(IllegalStateException.class, () -> service.authorizeApply(new ApplyAuthorizationRequest(
            "run-1", DIFF_HASH, ApplyMode.AUTO_APPLY_L2
        )));
    }

    @Test
    void failedCompareAndSetDoesNotPermitSecondApprovalConsumption() {
        when(runMapper.findDecisionContext("run-1", DIFF_HASH)).thenReturn(context());
        when(approvalMapper.findLatestForDecision("run-1", DIFF_HASH)).thenReturn(approvalEntity());
        when(approvalMapper.consumeOnce(1L, 0L)).thenReturn(0);
        when(applyContextProvider.load("run-1", DIFF_HASH, ApplyMode.APPROVED_OWNER_L1)).thenReturn(trustedContext());

        ApplyAuthorization authorization = service.authorizeApply(new ApplyAuthorizationRequest(
            "run-1", DIFF_HASH, ApplyMode.APPROVED_OWNER_L1
        ));
        assertThrows(IllegalStateException.class, () -> service.executeApprovedL1(authorization));
    }

    @Test
    void forgedAuthorizationTokenIsRejectedBeforeApprovalConsumption() {
        when(runMapper.findDecisionContext("run-1", DIFF_HASH)).thenReturn(context());
        when(approvalMapper.findLatestForDecision("run-1", DIFF_HASH)).thenReturn(approvalEntity());
        when(applyContextProvider.load("run-1", DIFF_HASH, ApplyMode.APPROVED_OWNER_L1)).thenReturn(trustedContext());

        ApplyAuthorization forged = new ApplyAuthorization(1L, 0L, ApplyMode.APPROVED_OWNER_L1,
            "run-1", DIFF_HASH, "forged-context-fingerprint");

        assertThrows(IllegalStateException.class, () -> service.executeApprovedL1(forged));
        verify(approvalMapper, org.mockito.Mockito.never()).consumeOnce(1L, 0L);
    }

    @Test
    void l1ExecutionReloadsContextAndDoesNotConsumeChangedApproval() {
        when(runMapper.findDecisionContext("run-1", DIFF_HASH)).thenReturn(context());
        when(approvalMapper.findLatestForDecision("run-1", DIFF_HASH)).thenReturn(approvalEntity());
        when(applyContextProvider.load("run-1", DIFF_HASH, ApplyMode.APPROVED_OWNER_L1))
            .thenReturn(trustedContext())
            .thenReturn(new TrustedApplyContext(sha('f'), POLICY_SET_HASH, EVIDENCE_HASH, DIFF_HASH,
                DIFF_IDENTITY, BASELINE, 4L, "SNAPSHOT_READY", true, true, true, true, true));
        ApplyAuthorization authorization = service.authorizeApply(new ApplyAuthorizationRequest(
            "run-1", DIFF_HASH, ApplyMode.APPROVED_OWNER_L1));

        assertThrows(IllegalStateException.class, () -> service.executeApprovedL1(authorization));
        verify(approvalMapper, org.mockito.Mockito.never()).consumeOnce(1L, 0L);
    }

    @Test
    void failedL1ApplyPropagatesFailureAfterCompareAndSet() {
        when(runMapper.findDecisionContext("run-1", DIFF_HASH)).thenReturn(context());
        when(approvalMapper.findLatestForDecision("run-1", DIFF_HASH)).thenReturn(approvalEntity());
        when(applyContextProvider.load("run-1", DIFF_HASH, ApplyMode.APPROVED_OWNER_L1)).thenReturn(trustedContext());
        when(approvalMapper.consumeOnce(1L, 0L)).thenReturn(1);
        ApplyAuthorization authorization = service.authorizeApply(new ApplyAuthorizationRequest(
            "run-1", DIFF_HASH, ApplyMode.APPROVED_OWNER_L1));
        doThrow(new IllegalStateException("apply failed")).when(applyProtocolExecutor).execute(authorization);

        assertThrows(IllegalStateException.class, () -> service.executeApprovedL1(authorization));
        verify(approvalMapper).consumeOnce(1L, 0L);
    }

    @Test
    void failedL1ApplyRollsBackTheSpringTransaction() {
        when(runMapper.findDecisionContext("run-1", DIFF_HASH)).thenReturn(context());
        when(approvalMapper.findLatestForDecision("run-1", DIFF_HASH)).thenReturn(approvalEntity());
        when(applyContextProvider.load("run-1", DIFF_HASH, ApplyMode.APPROVED_OWNER_L1)).thenReturn(trustedContext());
        when(approvalMapper.consumeOnce(1L, 0L)).thenReturn(1);
        ApplyAuthorization authorization = service.authorizeApply(new ApplyAuthorizationRequest(
            "run-1", DIFF_HASH, ApplyMode.APPROVED_OWNER_L1));
        doThrow(new IllegalStateException("apply failed")).when(applyProtocolExecutor).execute(authorization);
        RecordingTransactionManager transactionManager = new RecordingTransactionManager();
        TransactionSynchronizationManager.clear();

        assertThrows(IllegalStateException.class, () -> new TransactionTemplate(transactionManager)
            .executeWithoutResult(status -> service.executeApprovedL1(authorization)));

        assertEquals(1, transactionManager.rollbackCount);
        assertEquals(0, transactionManager.commitCount);
    }

    @Test
    void l2ExecutionReloadsContextBeforeRunningApplyWork() {
        DecisionContext l2 = new DecisionContext("run-1", "SNAPSHOT_READY", 4L, "AUTO_APPLY_L2", DIFF_HASH,
            "[\"WITHIN_POLICY_CEILINGS\"]", POLICY_SET_HASH, EVIDENCE_HASH, BUNDLE_HASH, DIFF_HASH,
            DIFF_IDENTITY, BASELINE, "recipe-reference-apply", true);
        when(runMapper.findDecisionContext("run-1", DIFF_HASH)).thenReturn(l2);
        when(applyContextProvider.load("run-1", DIFF_HASH, ApplyMode.AUTO_APPLY_L2))
            .thenReturn(trustedContext())
            .thenReturn(new TrustedApplyContext(BUNDLE_HASH, POLICY_SET_HASH, EVIDENCE_HASH, DIFF_HASH,
                DIFF_IDENTITY, BASELINE, 5L, "SNAPSHOT_READY", true, true, true, true, true));
        ApplyAuthorization authorization = service.authorizeApply(new ApplyAuthorizationRequest(
            "run-1", DIFF_HASH, ApplyMode.AUTO_APPLY_L2));

        assertThrows(IllegalStateException.class, () -> service.executeAutoApplyL2(authorization));
    }

    @Test
    void disabledPolicyRejectsApplyAuthorization() {
        when(runMapper.findDecisionContext("run-1", DIFF_HASH)).thenReturn(context());
        when(runMapper.countStaleRunPolicies("run-1")).thenReturn(1);

        assertThrows(IllegalStateException.class, () -> service.authorizeApply(new ApplyAuthorizationRequest(
            "run-1", DIFF_HASH, ApplyMode.APPROVED_OWNER_L1)));
        verifyNoInteractions(applyContextProvider);
    }

    @Test
    void runPolicyRowWithDifferentPolicySetHashRejectsAuthorization() {
        when(runMapper.findDecisionContext("run-1", DIFF_HASH)).thenReturn(context());
        when(runMapper.findRunPolicies("run-1")).thenReturn(List.of(
            new RunPolicyRow("recipes", 1, POLICY_HASH, sha('f'))));
        when(applyContextProvider.load("run-1", DIFF_HASH, ApplyMode.APPROVED_OWNER_L1)).thenReturn(trustedContext());

        assertThrows(IllegalStateException.class, () -> service.authorizeApply(new ApplyAuthorizationRequest(
            "run-1", DIFF_HASH, ApplyMode.APPROVED_OWNER_L1)));
    }

    @Test
    void applyExecutionRejectsMissingSpringTransaction() {
        TransactionSynchronizationManager.setActualTransactionActive(false);

        assertThrows(IllegalStateException.class, () -> service.executeAutoApplyL2(
            new ApplyAuthorization(null, null, ApplyMode.AUTO_APPLY_L2, "run-1", DIFF_HASH, "token")));
        verifyNoInteractions(applyContextProvider);
    }

    @Test
    void defaultApplyContextProviderFailsClosed() {
        FailClosedCrawlerAutomationApplyContextProvider provider = new FailClosedCrawlerAutomationApplyContextProvider();

        assertEquals(null, provider.load("run-1", DIFF_HASH, ApplyMode.AUTO_APPLY_L2));
        assertThrows(IllegalStateException.class, () -> provider.execute(
            new ApplyAuthorization(null, null, ApplyMode.AUTO_APPLY_L2, "run-1", DIFF_HASH, "token")));
    }

    @Test
    void reorderedLogicalScopeArrayIsRejected() {
        ScopeChangeCounts first = new ScopeChangeCounts("recipes:a", 10, 10, 0, 0, 0, 0, 0);
        ScopeChangeCounts second = new ScopeChangeCounts("recipes:b", 10, 10, 0, 0, 0, 0, 0);
        String reordered = "{\"baselineFingerprint\":\"" + BASELINE + "\",\"scopes\":["
            + identityScope(second) + "," + identityScope(first) + "]}";
        EvaluationRequest request = new EvaluationRequest("run-1", "recipes", "L2", POLICY_SET_HASH,
            EVIDENCE_HASH, BUNDLE_HASH, sha(reordered), reordered, BASELINE, "recipe-reference-apply",
            List.of(new PolicyRow("recipes", 1, POLICY_HASH)), List.of(first, second),
            new ChangeCounts(20, 20, 0, 0, 0, 0, 0), new PolicyLimits(.10, 500, .10, 500, .05, 200, .005, 20),
            false, false, true);

        assertThrows(IllegalArgumentException.class, () -> service.evaluate(request));
    }

    private static EvaluationRequest request(String level, ChangeCounts counts, boolean anomaly, boolean rebuild, boolean gates) {
        return request(level, counts, anomaly, rebuild, gates, new ScopeChangeCounts("recipes:wiki_gg", counts.entityBaselineCount(), counts.relationshipBaselineCount(), counts.inserts(), counts.updates(), counts.relationshipDeletes(), counts.softDisables(), counts.hardDeletes()));
    }

    private static EvaluationRequest request(String level, ChangeCounts counts, boolean anomaly, boolean rebuild, boolean gates, ScopeChangeCounts scope) {
        String identity = identity(scope);
        return new EvaluationRequest("run-1", "recipes", level, POLICY_SET_HASH, EVIDENCE_HASH, BUNDLE_HASH, sha(identity), identity, BASELINE, "recipe-reference-apply", List.of(new PolicyRow("recipes", 1, POLICY_HASH)), List.of(scope), counts, new PolicyLimits(.10, 500, .10, 500, .05, 200, .005, 20), anomaly, rebuild, gates);
    }

    private static EvaluationRequest requestForScope(String level, ChangeCounts counts, boolean anomaly, boolean rebuild, boolean gates, ScopeChangeCounts scope) {
        return request(level, counts, anomaly, rebuild, gates, scope);
    }

    private static ChangeCounts counts(long baseline, long inserts, long updates, long deletes, long hardDeletes) {
        return new ChangeCounts(baseline, baseline, inserts, updates, deletes, 0, hardDeletes);
    }

    private static DecisionContext context() {
        return new DecisionContext("run-1", "AWAITING_APPROVAL", 4L, "REQUIRES_OWNER_L1", DIFF_HASH,
            "[\"INSERT_THRESHOLD_EXCEEDED\"]", POLICY_SET_HASH, EVIDENCE_HASH, BUNDLE_HASH, DIFF_HASH,
            DIFF_IDENTITY, BASELINE, "recipe-reference-apply", true);
    }

    private static TrustedApplyContext trustedContext() {
        return new TrustedApplyContext(BUNDLE_HASH, POLICY_SET_HASH, EVIDENCE_HASH, DIFF_HASH, DIFF_IDENTITY,
            BASELINE, 4L, "SNAPSHOT_READY", true, true, true, true, true);
    }

    private static ApprovalRequest approvalRequest() {
        return new ApprovalRequest("approve-1", "run-1", DIFF_HASH, "owner", "reauth-1", "APPROVE", "reviewed", 4L);
    }

    private static CrawlerAutomationApproval approvalEntity() {
        CrawlerAutomationApproval approval = new CrawlerAutomationApproval();
        approval.setId(1L); approval.setRequestKey("approve-1"); approval.setRunId("run-1"); approval.setDecisionHash(DIFF_HASH);
        approval.setActor("owner"); approval.setReauthId("reauth-1"); approval.setPolicySetHash(POLICY_SET_HASH);
        approval.setEvidenceHash(EVIDENCE_HASH); approval.setBundleHash(BUNDLE_HASH); approval.setLogicalDiffHash(DIFF_HASH);
        approval.setLogicalDiffIdentityJson(DIFF_IDENTITY); approval.setBaselineFingerprint(BASELINE); approval.setPlannedApplyActionId("recipe-reference-apply");
        approval.setReason("reviewed"); approval.setAction("APPROVE"); approval.setRunVersion(4L); approval.setVersion(0L);
        return approval;
    }

    private static String sha(char value) { return sha(String.valueOf(value).repeat(64)); }
    private static String sha(String value) { try { byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)); StringBuilder result = new StringBuilder("sha256:"); for (byte item : bytes) result.append(String.format("%02x", item)); return result.toString(); } catch (Exception exception) { throw new IllegalStateException(exception); } }
    private static String identity(ScopeChangeCounts scope) {
        return "{\"baselineFingerprint\":\"" + BASELINE + "\",\"scopes\":[{\"deletedRelationshipKeys\":" + keys("delete", scope.relationshipDeletes())
            + ",\"entityBaselineCount\":" + scope.entityBaselineCount() + ",\"hardDeletedKeys\":" + keys("hard", scope.hardDeletes())
            + ",\"insertedKeys\":" + keys("insert", scope.inserts()) + ",\"relationshipBaselineCount\":" + scope.relationshipBaselineCount()
            + ",\"scopeId\":\"" + scope.scopeId() + "\",\"softDisabledKeys\":" + keys("soft", scope.softDisables())
            + ",\"updatedKeys\":" + keys("update", scope.updates()) + "}]}";
    }
    private static String identityScope(ScopeChangeCounts scope) {
        return "{\"deletedRelationshipKeys\":" + keys("delete", scope.relationshipDeletes())
            + ",\"entityBaselineCount\":" + scope.entityBaselineCount() + ",\"hardDeletedKeys\":" + keys("hard", scope.hardDeletes())
            + ",\"insertedKeys\":" + keys("insert", scope.inserts()) + ",\"relationshipBaselineCount\":" + scope.relationshipBaselineCount()
            + ",\"scopeId\":\"" + scope.scopeId() + "\",\"softDisabledKeys\":" + keys("soft", scope.softDisables())
            + ",\"updatedKeys\":" + keys("update", scope.updates()) + "}";
    }
    private static String keys(String prefix, long count) { java.util.ArrayList<String> keys = new java.util.ArrayList<>(); for (int i = 0; i < count; i++) keys.add(prefix + ":" + i); keys.sort(String::compareTo); return keys.stream().map(key -> "\"" + key + "\"").collect(java.util.stream.Collectors.joining(",", "[", "]")); }

    private static final class RecordingTransactionManager extends AbstractPlatformTransactionManager {
        private int commitCount;
        private int rollbackCount;

        @Override
        protected Object doGetTransaction() {
            return new Object();
        }

        @Override
        protected void doBegin(Object transaction, org.springframework.transaction.TransactionDefinition definition) {
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
            commitCount++;
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
            rollbackCount++;
        }
    }
}

package com.terraria.skills.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.terraria.skills.entity.CrawlerAutomationApproval;
import com.terraria.skills.entity.CrawlerAutomationDecision;
import com.terraria.skills.mapper.CrawlerAutomationApprovalMapper;
import com.terraria.skills.mapper.CrawlerAutomationPolicyMapper;
import com.terraria.skills.mapper.CrawlerAutomationRunMapper;
import com.terraria.skills.mapper.CrawlerAutomationDecisionMapper;
import com.terraria.skills.service.CrawlerAutomationPolicyService;
import com.terraria.skills.service.CrawlerAutomationPolicyService.ApplyContextProvider;
import com.terraria.skills.service.CrawlerAutomationPolicyService.TrustedApplyContext;
import com.terraria.skills.service.CrawlerAutomationPolicyService.ApplyProtocolExecutor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

@Service
public class CrawlerAutomationPolicyServiceImpl implements CrawlerAutomationPolicyService {

    private static final Pattern SHA256 = Pattern.compile("sha256:[0-9a-f]{64}");
    private static final Set<String> ALLOWED_L1_REASONS = Set.of(
        "INSERT_THRESHOLD_EXCEEDED", "UPDATE_THRESHOLD_EXCEEDED",
        "RELATIONSHIP_DELETE_THRESHOLD_EXCEEDED", "SOFT_DISABLE_THRESHOLD_EXCEEDED",
        "ZERO_BASELINE_FIRST_IMPORT", "HARD_DELETE_REQUIRES_OWNER",
        "WHOLE_DOMAIN_REBUILD_REQUIRES_OWNER", "LEVEL_L1_REQUIRES_OWNER"
    );

    private final CrawlerAutomationApprovalMapper approvalMapper;
    private final CrawlerAutomationRunMapper runMapper;
    private final CrawlerAutomationPolicyMapper policyMapper;
    private final CrawlerAutomationDecisionMapper decisionMapper;
    private final ObjectMapper objectMapper;
    private final ApplyContextProvider applyContextProvider;
    private final ApplyProtocolExecutor applyProtocolExecutor;

    public CrawlerAutomationPolicyServiceImpl(
        CrawlerAutomationApprovalMapper approvalMapper,
        CrawlerAutomationRunMapper runMapper,
        CrawlerAutomationPolicyMapper policyMapper,
        CrawlerAutomationDecisionMapper decisionMapper,
        ObjectMapper objectMapper,
        ApplyContextProvider applyContextProvider,
        ApplyProtocolExecutor applyProtocolExecutor
    ) {
        this.approvalMapper = approvalMapper;
        this.runMapper = runMapper;
        this.policyMapper = policyMapper;
        this.decisionMapper = decisionMapper;
        this.objectMapper = objectMapper == null ? new ObjectMapper() : objectMapper;
        this.applyContextProvider = applyContextProvider;
        this.applyProtocolExecutor = applyProtocolExecutor;
    }

    @Override
    public Decision evaluate(EvaluationRequest request) {
        validateEvaluationRequest(request);
        List<String> reasons = new ArrayList<>();
        var policyState = policyMapper.findPolicyState(request.domainId());
        if (policyState == null || !matchesPersistedPolicy(request, policyState)) {
            reasons.add("PERSISTED_POLICY_IDENTITY_MISMATCH");
            return persistDecision(request, decision(request, DecisionType.CIRCUIT_BREAK, reasons, false, false));
        }
        if (!Objects.equals(request.level(), policyState.currentLevel())) {
            reasons.add("CALLER_POLICY_LEVEL_MISMATCH");
            return persistDecision(request, decision(request, DecisionType.CIRCUIT_BREAK, reasons, false, false));
        }
        if ("CIRCUIT_OPEN".equals(policyState.operationalState())) {
            reasons.add("POLICY_CIRCUIT_OPEN");
            return persistDecision(request, decision(request, DecisionType.CIRCUIT_BREAK, reasons, false, false));
        }
        if (!"ACTIVE".equals(policyState.operationalState()) || "L0".equals(policyState.currentLevel())) {
            reasons.add("POLICY_WRITE_DISABLED");
            return persistDecision(request, decision(request, DecisionType.BLOCKED_L0, reasons, false, false));
        }
        String effectiveLevel = policyState.currentLevel();
        if (request.anomaly() || hasNegativeCounts(request.counts()) || !validScopes(request)) {
            reasons.add("ANOMALY_DETECTED");
            return persistDecision(request, decision(request, DecisionType.CIRCUIT_BREAK, reasons, false, false));
        }
        if (!request.requiredGatesPassed()) {
            reasons.add("REQUIRED_GATE_FAILED");
            return persistDecision(request, decision(request, DecisionType.CIRCUIT_BREAK, reasons, false, false));
        }
        ChangeCounts counts = request.counts();
        PolicyLimits limits = request.limits();
        for (ScopeChangeCounts scope : request.scopes()) {
            if (scope.entityBaselineCount() == 0
                && (scope.updates() > 0 || scope.softDisables() > 0 || scope.hardDeletes() > 0)) {
                reasons.add("EMPTY_BASELINE_NON_INSERT_ANOMALY");
            }
            if (scope.entityBaselineCount() == 0 && scope.inserts() > 0) reasons.add("ZERO_BASELINE_FIRST_IMPORT");
            if (scope.relationshipBaselineCount() == 0 && scope.relationshipDeletes() > 0) {
                reasons.add("ZERO_RELATIONSHIP_BASELINE");
            }
            addThresholdReason(reasons, "INSERT_THRESHOLD_EXCEEDED", scope.inserts(),
                allowed(scope.entityBaselineCount(), limits.insertRatio(), limits.insertAbsolute()));
            addThresholdReason(reasons, "UPDATE_THRESHOLD_EXCEEDED", scope.updates(),
                allowed(scope.entityBaselineCount(), limits.updateRatio(), limits.updateAbsolute()));
            addThresholdReason(reasons, "RELATIONSHIP_DELETE_THRESHOLD_EXCEEDED", scope.relationshipDeletes(),
                allowed(scope.relationshipBaselineCount(), limits.relationshipDeleteRatio(), limits.relationshipDeleteAbsolute()));
            addThresholdReason(reasons, "SOFT_DISABLE_THRESHOLD_EXCEEDED", scope.softDisables(),
                allowed(scope.entityBaselineCount(), limits.softDisableRatio(), limits.softDisableAbsolute()));
        }
        if (reasons.contains("EMPTY_BASELINE_NON_INSERT_ANOMALY") || reasons.contains("ZERO_RELATIONSHIP_BASELINE")) {
            return persistDecision(request, decision(request, DecisionType.CIRCUIT_BREAK, reasons, false, false));
        }
        if (counts.inserts() > limits.insertAbsolute()) reasons.add("INSERT_AGGREGATE_ABSOLUTE_EXCEEDED");
        if (counts.updates() > limits.updateAbsolute()) reasons.add("UPDATE_AGGREGATE_ABSOLUTE_EXCEEDED");
        if (counts.relationshipDeletes() > limits.relationshipDeleteAbsolute()) reasons.add("RELATIONSHIP_DELETE_AGGREGATE_ABSOLUTE_EXCEEDED");
        if (counts.softDisables() > limits.softDisableAbsolute()) reasons.add("SOFT_DISABLE_AGGREGATE_ABSOLUTE_EXCEEDED");
        if (counts.hardDeletes() > 0) reasons.add("HARD_DELETE_REQUIRES_OWNER");
        if (request.wholeDomainRebuild()) reasons.add("WHOLE_DOMAIN_REBUILD_REQUIRES_OWNER");

        if ("L1".equals(effectiveLevel) || !reasons.isEmpty()) {
            if (reasons.isEmpty()) reasons.add("LEVEL_L1_REQUIRES_OWNER");
            return persistDecision(request, decision(request, DecisionType.REQUIRES_OWNER_L1, reasons, true, false));
        }
        return persistDecision(request, decision(request, DecisionType.AUTO_APPLY_L2, List.of("WITHIN_POLICY_CEILINGS"), false, true));
    }

    @Override
    @Transactional
    public CrawlerAutomationApproval consumeApproval(ApprovalRequest request) {
        validateApprovalRequest(request);
        DecisionContext context = requireDecisionContext(request.runId(), request.decisionHash());
        assertEqual("decision", "REQUIRES_OWNER_L1", context.decision());
        assertEqual("run status", "AWAITING_APPROVAL", context.runStatus());
        assertEqual("run version", context.runVersion(), request.expectedRunVersion());
        if (!allowedReasons(context.reasonCodesJson())) throw new IllegalStateException("decision is not approvable");
        OwnerRecord owner = policyMapper.findOwner();
        if (owner == null || !Objects.equals(owner.status(), "ACTIVE") || !Objects.equals(owner.username(), request.actor())) {
            throw new IllegalStateException("requester is not the configured Owner");
        }
        assertContextIdentity(context, request.runId(), request.decisionHash());
        CrawlerAutomationApproval existing = approvalMapper.findByRequestKey(request.requestKey());
        if (existing != null) {
            assertSameApprovalIdentity(existing, context, request);
            return existing;
        }
        if (!Objects.equals(request.action(), "APPROVE") || policyMapper.consumeReauth(request.reauthId(), owner.username()) != 1) {
            throw new IllegalStateException("Owner reauthentication is invalid or already consumed");
        }
        CrawlerAutomationApproval approval = toEntity(request, context);
        if (approvalMapper.insert(approval) != 1) {
            CrawlerAutomationApproval raced = approvalMapper.findByRequestKey(request.requestKey());
            if (raced == null) throw new IllegalStateException("approval was not persisted");
            assertSameApprovalIdentity(raced, context, request);
            return raced;
        }
        return approvalMapper.findByRequestKey(request.requestKey());
    }

    @Override
    public ApplyAuthorization authorizeApply(ApplyAuthorizationRequest request) {
        Objects.requireNonNull(request, "apply authorization request is required");
        DecisionContext context = requireDecisionContext(request.runId(), request.decisionHash());
        if (runMapper.countStaleRunPolicies(request.runId()) != 0) throw new IllegalStateException("stale policy set");
        if (applyContextProvider == null) throw new IllegalStateException("trusted apply context provider is not configured");
        TrustedApplyContext actual = applyContextProvider.load(request.runId(), request.decisionHash(), request.mode());
        if (actual == null || !actual.schemaValid() || !actual.capabilityValid() || !actual.gatesValid()
            || !actual.mutationGenerationValid() || (request.mode() == ApplyMode.AUTO_APPLY_L2 && !actual.withinCurrentCeilings())) {
            throw new IllegalStateException("transaction-time apply context is invalid");
        }
        List<com.terraria.skills.service.CrawlerAutomationPolicyService.RunPolicyRow> persistedPolicies = runMapper.findRunPolicies(request.runId());
        if (persistedPolicies == null || persistedPolicies.isEmpty()
            || persistedPolicies.stream().anyMatch(row -> !Objects.equals(context.policySetHash(), row.policySetHash()))
            || !Objects.equals(context.policySetHash(), canonicalPolicySetHash(persistedPolicies.stream()
                .map(row -> new PolicyRow(row.domainId(), row.policyVersion(), row.policyHash())).toList()))) {
            throw new IllegalStateException("persisted policy set is missing or changed");
        }
        assertEqual("run version", context.runVersion(), actual.currentRunVersion());
        assertEqual("policySetHash", context.policySetHash(), actual.policySetHash());
        assertEqual("evidenceHash", context.evidenceHash(), actual.evidenceHash());
        assertEqual("bundleHash", context.bundleHash(), actual.bundleHash());
        assertEqual("logicalDiffHash", context.logicalDiffHash(), actual.logicalDiffHash());
        assertEqual("logicalDiffIdentity", canonicalJson(context.logicalDiffIdentityJson()), canonicalJson(actual.logicalDiffIdentityJson()));
        assertEqual("baselineFingerprint", context.baselineFingerprint(), actual.baselineFingerprint());
        assertEqual("run status", "SNAPSHOT_READY", actual.runStatus());
        if (request.mode() == ApplyMode.AUTO_APPLY_L2) {
            if (runMapper.countNonL2RunPolicies(request.runId()) != 0) throw new IllegalStateException("covered policies are not all active L2");
            assertEqual("decision", "AUTO_APPLY_L2", context.decision());
            return new ApplyAuthorization(null, null, request.mode(), request.runId(), request.decisionHash(),
                contextFingerprint(context, actual));
        }
        assertEqual("decision", "REQUIRES_OWNER_L1", context.decision());
        CrawlerAutomationApproval approval = approvalMapper.findLatestForDecision(request.runId(), request.decisionHash());
        if (approval == null || approval.getConsumedAt() != null) throw new IllegalStateException("approval is missing or consumed");
        assertEqual("approval bundleHash", context.bundleHash(), approval.getBundleHash());
        assertEqual("approval logicalDiffIdentity", canonicalJson(context.logicalDiffIdentityJson()), canonicalJson(approval.getLogicalDiffIdentityJson()));
        return new ApplyAuthorization(approval.getId(), approval.getVersion(), request.mode(), request.runId(), request.decisionHash(),
            contextFingerprint(context, actual));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void executeApprovedL1(ApplyAuthorization authorization) {
        requireActiveTransaction();
        if (authorization == null || authorization.mode() != ApplyMode.APPROVED_OWNER_L1 || authorization.approvalId() == null) {
            throw new IllegalStateException("approval reservation is stale or already consumed");
        }
        ApplyAuthorization current = authorizeApply(new ApplyAuthorizationRequest(
            authorization.runId(), authorization.decisionHash(), ApplyMode.APPROVED_OWNER_L1));
        if (!Objects.equals(current.approvalId(), authorization.approvalId())
            || !Objects.equals(current.approvalVersion(), authorization.approvalVersion())
            || !Objects.equals(current.contextFingerprint(), authorization.contextFingerprint())
            || approvalMapper.consumeOnce(current.approvalId(), current.approvalVersion()) != 1) {
            throw new IllegalStateException("approval reservation is stale or already consumed");
        }
        try {
            applyProtocolExecutor.execute(current);
        } catch (RuntimeException exception) {
            throw exception;
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void executeAutoApplyL2(ApplyAuthorization authorization) {
        requireActiveTransaction();
        if (authorization == null || authorization.mode() != ApplyMode.AUTO_APPLY_L2) {
            throw new IllegalStateException("invalid L2 authorization");
        }
        ApplyAuthorization current = authorizeApply(new ApplyAuthorizationRequest(
            authorization.runId(), authorization.decisionHash(), ApplyMode.AUTO_APPLY_L2));
        if (!Objects.equals(current.contextFingerprint(), authorization.contextFingerprint())) {
            throw new IllegalStateException("L2 context changed before apply");
        }
        applyProtocolExecutor.execute(current);
    }

    private static String contextFingerprint(DecisionContext context, TrustedApplyContext actual) {
        return String.join("|", context.runId(), context.decisionHash(), context.policySetHash(), context.bundleHash(),
            context.evidenceHash(), context.logicalDiffHash(), context.baselineFingerprint(),
            actual.logicalDiffIdentityJson(), Long.toString(actual.currentRunVersion()));
    }

    private static void requireActiveTransaction() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("apply execution requires an active Spring transaction");
        }
    }

    private static boolean matchesPersistedPolicy(
        EvaluationRequest request,
        com.terraria.skills.service.CrawlerAutomationPolicyService.PolicyState state
    ) {
        PolicyRow covered = request.policyRows().stream()
            .filter(row -> Objects.equals(row.domainId(), request.domainId()))
            .findFirst()
            .orElse(null);
        return covered != null
            && Objects.equals(state.domainId(), request.domainId())
            && state.policyVersion() == covered.policyVersion()
            && Objects.equals(state.policyHash(), covered.policyHash())
            && List.of("L0", "L1", "L2").contains(state.currentLevel())
            && List.of("DISABLED", "SHADOW", "ACTIVE", "CIRCUIT_OPEN").contains(state.operationalState());
    }

    private Decision decision(EvaluationRequest request, DecisionType type, List<String> reasons, boolean approvable, boolean writeIntent) {
        List<String> orderedReasons = List.copyOf(new LinkedHashSet<>(reasons));
        String countsJson = writeJson(java.util.Map.of(
            "aggregate", request.counts(),
            "scopes", request.scopes(),
            "limits", request.limits()
        ));
        String decisionHash = hash(writeJson(List.of(type.name(), orderedReasons, request.policySetHash(), request.bundleHash(),
            request.evidenceHash(), request.logicalDiffHash(), request.logicalDiffIdentityJson(), request.baselineFingerprint(), countsJson)));
        return new Decision(type, orderedReasons, decisionHash, request.policySetHash(), request.evidenceHash(),
            request.bundleHash(), request.logicalDiffHash(), canonicalJson(request.logicalDiffIdentityJson()), request.baselineFingerprint(),
            request.plannedApplyActionId(), List.copyOf(request.policyRows()), countsJson, true, approvable, writeIntent);
    }

    private Decision persistDecision(EvaluationRequest request, Decision decision) {
        CrawlerAutomationDecision row = new CrawlerAutomationDecision();
        row.setRunId(request.runId()); row.setDecision(decision.type().name()); row.setDecisionHash(decision.decisionHash());
        row.setReasonCodesJson(writeJson(decision.reasonCodes())); row.setCountsRatiosJson(decision.countsRatiosJson());
        row.setGateResultsJson(writeJson(List.of(request.requiredGatesPassed()))); row.setPolicySetHash(decision.policySetHash());
        row.setEvidenceHash(decision.evidenceHash()); row.setBundleHash(decision.bundleHash()); row.setLogicalDiffHash(decision.logicalDiffHash());
        row.setLogicalDiffIdentityJson(decision.logicalDiffIdentityJson()); row.setBaselineFingerprint(decision.baselineFingerprint());
        row.setSnapshotRequired(decision.snapshotRequired()); row.setPlannedApplyActionId(decision.plannedApplyActionId());
        if (decisionMapper.insert(row) != 1) throw new IllegalStateException("decision fact was not persisted");
        return decision;
    }

    private DecisionContext requireDecisionContext(String runId, String decisionHash) {
        DecisionContext context = runMapper.findDecisionContext(runId, decisionHash);
        if (context == null) throw new IllegalStateException("persisted decision context is missing");
        return context;
    }

    private boolean allowedReasons(String json) {
        try {
            JsonNode node = objectMapper.readTree(json);
            if (!node.isArray()) return false;
            for (JsonNode reason : node) {
                String value = reason.asText();
                if (!ALLOWED_L1_REASONS.contains(value)) return false;
            }
            return !node.isEmpty();
        } catch (Exception exception) {
            return false;
        }
    }

    private void assertContextIdentity(DecisionContext context, String runId, String decisionHash) {
        if (!Objects.equals(context.runId(), runId) || !Objects.equals(context.decisionHash(), decisionHash)
            || !SHA256.matcher(context.policySetHash()).matches() || !SHA256.matcher(context.bundleHash()).matches()
            || !SHA256.matcher(context.evidenceHash()).matches() || !SHA256.matcher(context.logicalDiffHash()).matches()
            || !SHA256.matcher(context.baselineFingerprint()).matches()) {
            throw new IllegalStateException("persisted decision identity is invalid");
        }
    }

    private static CrawlerAutomationApproval toEntity(ApprovalRequest request, DecisionContext context) {
        CrawlerAutomationApproval approval = new CrawlerAutomationApproval();
        approval.setRequestKey(request.requestKey());
        approval.setRunId(request.runId());
        approval.setDecisionHash(request.decisionHash());
        approval.setPolicySetHash(context.policySetHash());
        approval.setEvidenceHash(context.evidenceHash());
        approval.setBundleHash(context.bundleHash());
        approval.setLogicalDiffHash(context.logicalDiffHash());
        approval.setLogicalDiffIdentityJson(context.logicalDiffIdentityJson());
        approval.setBaselineFingerprint(context.baselineFingerprint());
        approval.setPlannedApplyActionId(context.plannedApplyActionId());
        approval.setActor(request.actor());
        approval.setAction(request.action());
        approval.setReason(request.reason());
        approval.setReauthId(request.reauthId());
        approval.setRunVersion(request.expectedRunVersion());
        approval.setVersion(0L);
        return approval;
    }

    private void validateEvaluationRequest(EvaluationRequest request) {
        Objects.requireNonNull(request, "evaluation request is required");
        if (request.runId() == null || request.runId().isBlank() || request.domainId() == null || request.domainId().isBlank()) {
            throw new IllegalArgumentException("runId and domainId are required");
        }
        if (!List.of("L0", "L1", "L2").contains(request.level())) throw new IllegalArgumentException("invalid level");
        validateHash(request.policySetHash(), "policySetHash"); validateHash(request.evidenceHash(), "evidenceHash");
        validateHash(request.bundleHash(), "bundleHash"); validateHash(request.logicalDiffHash(), "logicalDiffHash");
        validateHash(request.baselineFingerprint(), "baselineFingerprint");
        Objects.requireNonNull(request.counts(), "counts are required"); Objects.requireNonNull(request.limits(), "limits are required");
        if (request.policyRows() == null || request.policyRows().isEmpty()) throw new IllegalArgumentException("policy rows are required");
        if (request.scopes() == null || request.scopes().isEmpty()) throw new IllegalArgumentException("scope counts are required");
        validateLimits(request.limits());
        if (canonicalPolicySetHash(request.policyRows()) == null || !Objects.equals(request.policySetHash(), canonicalPolicySetHash(request.policyRows()))) {
            throw new IllegalArgumentException("policySetHash does not match covered policy rows");
        }
        validateLogicalDiffIdentity(request);
    }

    private boolean validScopes(EvaluationRequest request) {
        try {
            Set<String> ids = new HashSet<>();
            long inserts = 0, updates = 0, deletes = 0, soft = 0, hard = 0;
            long entityBaseline = 0, relationshipBaseline = 0;
            for (ScopeChangeCounts scope : request.scopes()) {
                if (scope.scopeId() == null || !ids.add(scope.scopeId()) || hasNegative(scope)) return false;
                inserts = Math.addExact(inserts, scope.inserts()); updates = Math.addExact(updates, scope.updates());
                deletes = Math.addExact(deletes, scope.relationshipDeletes()); soft = Math.addExact(soft, scope.softDisables());
                hard = Math.addExact(hard, scope.hardDeletes());
                entityBaseline = Math.addExact(entityBaseline, scope.entityBaselineCount());
                relationshipBaseline = Math.addExact(relationshipBaseline, scope.relationshipBaselineCount());
            }
            ChangeCounts counts = request.counts();
            return inserts == counts.inserts() && updates == counts.updates() && deletes == counts.relationshipDeletes()
                && entityBaseline == counts.entityBaselineCount() && relationshipBaseline == counts.relationshipBaselineCount()
                && soft == counts.softDisables() && hard == counts.hardDeletes();
        } catch (ArithmeticException exception) {
            return false;
        }
    }

    private static boolean hasNegativeCounts(ChangeCounts counts) { return counts.entityBaselineCount() < 0 || counts.relationshipBaselineCount() < 0
        || counts.inserts() < 0 || counts.updates() < 0 || counts.relationshipDeletes() < 0 || counts.softDisables() < 0 || counts.hardDeletes() < 0; }
    private static boolean hasNegative(ScopeChangeCounts counts) { return counts.entityBaselineCount() < 0 || counts.relationshipBaselineCount() < 0
        || counts.inserts() < 0 || counts.updates() < 0 || counts.relationshipDeletes() < 0 || counts.softDisables() < 0 || counts.hardDeletes() < 0; }

    private static long allowed(long baseline, double ratio, long absolute) { return Math.min(BigDecimal.valueOf(baseline).multiply(BigDecimal.valueOf(ratio)).setScale(0, RoundingMode.FLOOR).longValueExact(), absolute); }
    private static void addThresholdReason(List<String> reasons, String reason, long actual, long allowed) { if (actual > allowed) reasons.add(reason); }
    private static void validateLimits(PolicyLimits limits) { validateLimit(limits.insertRatio(), limits.insertAbsolute()); validateLimit(limits.updateRatio(), limits.updateAbsolute()); validateLimit(limits.relationshipDeleteRatio(), limits.relationshipDeleteAbsolute()); validateLimit(limits.softDisableRatio(), limits.softDisableAbsolute()); }
    private static void validateLimit(double ratio, long absolute) { if (!Double.isFinite(ratio) || ratio < 0 || ratio > 1 || absolute < 0) throw new IllegalArgumentException("invalid policy limit"); }
    private static void validateApprovalRequest(ApprovalRequest request) { Objects.requireNonNull(request, "approval request is required"); if (request.requestKey() == null || request.requestKey().isBlank() || request.runId() == null || request.runId().isBlank() || request.actor() == null || request.reauthId() == null || request.reason() == null) throw new IllegalArgumentException("approval identity is incomplete"); validateHash(request.decisionHash(), "decisionHash"); if (request.expectedRunVersion() < 0) throw new IllegalArgumentException("expectedRunVersion is invalid"); }
    private static void validateHash(String value, String label) { if (value == null || !SHA256.matcher(value).matches()) throw new IllegalArgumentException(label + " is invalid"); }
    private void assertSameApprovalIdentity(CrawlerAutomationApproval approval, DecisionContext context, ApprovalRequest request) { assertEqual("runId", context.runId(), approval.getRunId()); assertEqual("decisionHash", context.decisionHash(), approval.getDecisionHash()); assertEqual("policySetHash", context.policySetHash(), approval.getPolicySetHash()); assertEqual("evidenceHash", context.evidenceHash(), approval.getEvidenceHash()); assertEqual("bundleHash", context.bundleHash(), approval.getBundleHash()); assertEqual("logicalDiffHash", context.logicalDiffHash(), approval.getLogicalDiffHash()); assertEqual("actor", request.actor(), approval.getActor()); assertEqual("reauthId", request.reauthId(), approval.getReauthId()); assertEqual("action", request.action(), approval.getAction()); assertEqual("reason", request.reason(), approval.getReason()); assertEqual("runVersion", request.expectedRunVersion(), approval.getRunVersion()); assertEqual("logicalDiffIdentity", canonicalJson(context.logicalDiffIdentityJson()), canonicalJson(approval.getLogicalDiffIdentityJson())); }
    private static void assertEqual(String label, Object expected, Object actual) { if (!Objects.equals(expected, actual)) throw new IllegalStateException(label + " identity changed"); }
    private String canonicalJson(String value) { try { return objectMapper.writeValueAsString(sortJson(objectMapper.readTree(value))); } catch (Exception exception) { throw new IllegalArgumentException("invalid canonical JSON", exception); } }
    private void validateLogicalDiffIdentity(EvaluationRequest request) {
        try {
            String canonical = canonicalJson(request.logicalDiffIdentityJson());
            if (!Objects.equals(request.logicalDiffHash(), hash(canonical))) throw new IllegalArgumentException("logical diff hash mismatch");
            JsonNode root = objectMapper.readTree(canonical);
            if (!Objects.equals(root.path("baselineFingerprint").asText(), request.baselineFingerprint()) || !root.path("scopes").isArray()) {
                throw new IllegalArgumentException("logical diff baseline or scopes are invalid");
            }
            java.util.Map<String, ScopeChangeCounts> expected = new java.util.HashMap<>();
            request.scopes().forEach(scope -> expected.put(scope.scopeId(), scope));
            Set<String> seen = new HashSet<>();
            String previousScopeId = null;
            for (JsonNode scopeNode : root.path("scopes")) {
                String scopeId = scopeNode.path("scopeId").asText();
                ScopeChangeCounts scope = expected.get(scopeId);
                if (scope == null || !seen.add(scopeId) || (previousScopeId != null && compareUtf8(previousScopeId, scopeId) >= 0)
                    || scopeNode.path("entityBaselineCount").asLong(-1) != scope.entityBaselineCount()
                    || scopeNode.path("relationshipBaselineCount").asLong(-1) != scope.relationshipBaselineCount()
                    || uniqueKeyCount(scopeNode.path("insertedKeys")) != scope.inserts()
                    || uniqueKeyCount(scopeNode.path("updatedKeys")) != scope.updates()
                    || uniqueKeyCount(scopeNode.path("deletedRelationshipKeys")) != scope.relationshipDeletes()
                    || uniqueKeyCount(scopeNode.path("softDisabledKeys")) != scope.softDisables()
                    || uniqueKeyCount(scopeNode.path("hardDeletedKeys")) != scope.hardDeletes()) {
                    throw new IllegalArgumentException("logical diff scope identity mismatch");
                }
                previousScopeId = scopeId;
            }
            if (seen.size() != expected.size()) throw new IllegalArgumentException("logical diff scope set mismatch");
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException("invalid logical diff identity", exception);
        }
    }
    private static long uniqueKeyCount(JsonNode keys) { if (!keys.isArray()) return -1; Set<String> values = new HashSet<>(); String previous = null; for (JsonNode key : keys) { String value = key.asText(); if (!key.isTextual() || value.isBlank() || !values.add(value) || (previous != null && compareUtf8(previous, value) >= 0)) return -1; previous = value; } return values.size(); }
    private JsonNode sortJson(JsonNode node) { if (node.isObject()) { ObjectNode sorted = objectMapper.createObjectNode(); List<String> fields = new ArrayList<>(); node.fieldNames().forEachRemaining(fields::add); fields.sort(Comparator.comparing(s -> s.getBytes(StandardCharsets.UTF_8), (a, b) -> java.nio.ByteBuffer.wrap(a).compareTo(java.nio.ByteBuffer.wrap(b)))); fields.forEach(field -> sorted.set(field, sortJson(node.get(field)))); return sorted; } if (node.isArray()) { ArrayNode array = objectMapper.createArrayNode(); node.forEach(child -> array.add(sortJson(child))); return array; } return node; }
    private String writeJson(Object value) { try { return objectMapper.writeValueAsString(value); } catch (Exception exception) { throw new IllegalStateException("cannot serialize policy decision", exception); } }
    private static String hash(String value) { try { byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)); StringBuilder builder = new StringBuilder("sha256:"); for (byte item : digest) builder.append(String.format("%02x", item)); return builder.toString(); } catch (Exception exception) { throw new IllegalStateException(exception); } }
    private static String canonicalPolicySetHash(List<PolicyRow> rows) { List<PolicyRow> sorted = new ArrayList<>(rows); sorted.sort((left, right) -> compareUtf8(left.domainId(), right.domainId())); Set<String> domains = new HashSet<>(); StringBuilder value = new StringBuilder("["); for (int i = 0; i < sorted.size(); i++) { PolicyRow row = sorted.get(i); if (row.domainId() == null || !row.domainId().matches("[a-z][a-z0-9_]{0,63}") || !domains.add(row.domainId()) || row.policyVersion() < 1 || row.policyHash() == null || !SHA256.matcher(row.policyHash()).matches()) throw new IllegalArgumentException("invalid policy row"); if (i > 0) value.append(','); value.append("{\"domainId\":\"").append(row.domainId()).append("\",\"policyVersion\":").append(row.policyVersion()).append(",\"policyHash\":\"").append(row.policyHash()).append("\"}"); } return hash(value.append(']').toString()); }
    private static int compareUtf8(String left, String right) { return java.nio.ByteBuffer.wrap(left.getBytes(StandardCharsets.UTF_8)).compareTo(java.nio.ByteBuffer.wrap(right.getBytes(StandardCharsets.UTF_8))); }
}

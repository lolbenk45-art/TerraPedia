package com.terraria.skills.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.terraria.skills.entity.CrawlerAutomationRun;
import com.terraria.skills.service.CrawlerAutomationPolicyService.DecisionContext;
import com.terraria.skills.service.CrawlerAutomationPolicyService.RunPolicyRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import com.terraria.skills.dto.CrawlerAutomationOverviewDTO;
import java.util.List;

@Mapper
public interface CrawlerAutomationRunMapper extends BaseMapper<CrawlerAutomationRun> {

    @Select("""
        SELECT p.domain_id AS domainId,
               p.current_level AS automationLevel,
               p.operational_state AS operationalState,
               r.run_id AS lastRunId,
               r.status AS lastRunStatus,
               r.completed_at AS lastRunCompletedAt,
               '[]' AS activeAlerts
        FROM crawler_automation_policy p
        LEFT JOIN crawler_automation_run r
          ON r.run_id = (
            SELECT run_id FROM crawler_automation_run
            WHERE run_id LIKE CONCAT(p.domain_id, '%')
            ORDER BY created_at DESC LIMIT 1
          )
        ORDER BY p.domain_id
        """)
    List<CrawlerAutomationOverviewDTO.DomainSummary> findActiveDomainSummaries();

    @Select("""
        SELECT r.run_id AS runId, r.status AS runStatus, r.version AS runVersion,
               d.decision AS decision, d.decision_hash AS decisionHash,
               d.reason_codes_json AS reasonCodesJson, d.policy_set_hash AS policySetHash,
               d.evidence_hash AS evidenceHash, d.bundle_hash AS bundleHash,
               d.logical_diff_hash AS logicalDiffHash,
               d.logical_diff_identity_json AS logicalDiffIdentityJson,
               d.baseline_fingerprint AS baselineFingerprint,
               d.planned_apply_action_id AS plannedApplyActionId,
               d.snapshot_required AS snapshotRequired
        FROM crawler_automation_run r
        JOIN crawler_automation_decision d ON d.run_id = r.run_id
        ORDER BY r.created_at DESC
        LIMIT #{limit}
        """)
    List<DecisionContext> findRecentDecisionContexts(@Param("limit") int limit);


    @Select("""
        SELECT r.run_id AS runId, r.status AS runStatus, r.version AS runVersion,
               d.decision AS decision, d.decision_hash AS decisionHash,
               d.reason_codes_json AS reasonCodesJson, d.policy_set_hash AS policySetHash,
               d.evidence_hash AS evidenceHash, d.bundle_hash AS bundleHash,
               d.logical_diff_hash AS logicalDiffHash,
               d.logical_diff_identity_json AS logicalDiffIdentityJson,
               d.baseline_fingerprint AS baselineFingerprint,
               d.planned_apply_action_id AS plannedApplyActionId,
               d.snapshot_required AS snapshotRequired
        FROM crawler_automation_run r
        JOIN crawler_automation_decision d ON d.run_id = r.run_id
        JOIN crawler_automation_apply_bundle b
          ON b.run_id = r.run_id AND b.bundle_hash = d.bundle_hash
         AND b.policy_set_hash = d.policy_set_hash
         AND b.evidence_hash = d.evidence_hash
         AND b.logical_diff_hash = d.logical_diff_hash
         AND b.baseline_fingerprint = d.baseline_fingerprint
        JOIN crawler_automation_evidence_set e
          ON e.run_id = r.run_id AND e.evidence_hash = d.evidence_hash
         AND e.policy_set_hash = d.policy_set_hash
         AND e.baseline_fingerprint = d.baseline_fingerprint
        WHERE r.run_id = #{runId} AND d.decision_hash = #{decisionHash}
        """)
    DecisionContext findDecisionContext(
        @Param("runId") String runId,
        @Param("decisionHash") String decisionHash
    );

    @Select("""
        SELECT domain_id AS domainId, policy_version AS policyVersion,
               policy_hash AS policyHash, policy_set_hash AS policySetHash
        FROM crawler_automation_run_policy
        WHERE run_id = #{runId}
        ORDER BY domain_id
        """)
    List<RunPolicyRow> findRunPolicies(@Param("runId") String runId);

    @Select("""
        SELECT COUNT(*)
        FROM crawler_automation_run_policy rp
        LEFT JOIN crawler_automation_policy p ON p.domain_id = rp.domain_id
        LEFT JOIN crawler_automation_policy_version pv
          ON pv.domain_id = rp.domain_id AND pv.policy_version = rp.policy_version
        WHERE rp.run_id = #{runId}
          AND (p.domain_id IS NULL OR pv.id IS NULL OR p.current_version <> rp.policy_version
            OR pv.policy_hash <> rp.policy_hash OR p.operational_state <> 'ACTIVE' OR p.current_level = 'L0')
        """)
    int countStaleRunPolicies(@Param("runId") String runId);

    @Select("""
        SELECT COUNT(*)
        FROM crawler_automation_run_policy rp
        JOIN crawler_automation_policy p ON p.domain_id = rp.domain_id
        WHERE rp.run_id = #{runId} AND p.current_level <> 'L2'
        """)
    int countNonL2RunPolicies(@Param("runId") String runId);
}

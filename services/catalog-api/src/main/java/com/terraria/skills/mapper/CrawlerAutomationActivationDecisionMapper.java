package com.terraria.skills.mapper;

import com.terraria.skills.service.CrawlerAutomationPolicyService.ActivationDecisionRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface CrawlerAutomationActivationDecisionMapper {

    @Select("""
        SELECT decision_kind AS decisionKind, domain_id AS domainId,
               policy_version AS policyVersion, policy_hash AS policyHash,
               policy_set_hash AS policySetHash,
               minimum_successful_l1_runs AS minimumSuccessfulL1Runs,
               actor, reason, authorization_reference AS authorizationReference,
               decision_identity AS decisionIdentity, packet_hash AS packetHash,
               authorized_at AS authorizedAt, expires_at AS expiresAt,
               (authorized_at <= CURRENT_TIMESTAMP
                 AND expires_at > CURRENT_TIMESTAMP) AS fresh
        FROM crawler_automation_activation_decision
        WHERE decision_kind = #{decisionKind} AND domain_id = #{domainId}
        ORDER BY authorized_at DESC, id DESC
        LIMIT 1
        """)
    ActivationDecisionRecord findLatestActivationDecision(
        @Param("decisionKind") String decisionKind,
        @Param("domainId") String domainId
    );

    @Select("""
        SELECT COUNT(DISTINCT a.id)
        FROM crawler_automation_apply a
        JOIN crawler_automation_run_policy rp
          ON rp.run_id = a.run_id AND rp.policy_set_hash = a.policy_set_hash
        WHERE rp.domain_id = #{domainId}
          AND rp.policy_version = #{policyVersion}
          AND rp.policy_hash = #{policyHash}
          AND rp.policy_set_hash = #{policySetHash}
          AND a.mode = 'APPROVED_OWNER_L1'
          AND a.status = 'COMMITTED'
        """)
    int countSuccessfulL1Applies(
        @Param("domainId") String domainId,
        @Param("policyVersion") long policyVersion,
        @Param("policyHash") String policyHash,
        @Param("policySetHash") String policySetHash
    );
}

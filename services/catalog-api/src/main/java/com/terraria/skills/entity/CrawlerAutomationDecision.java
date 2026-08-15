package com.terraria.skills.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

@Data
@TableName("crawler_automation_decision")
public class CrawlerAutomationDecision implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;
    @TableField("run_id") private String runId;
    @TableField("decision") private String decision;
    @TableField("decision_hash") private String decisionHash;
    @TableField("reason_codes_json") private String reasonCodesJson;
    @TableField("counts_ratios_json") private String countsRatiosJson;
    @TableField("gate_results_json") private String gateResultsJson;
    @TableField("policy_set_hash") private String policySetHash;
    @TableField("evidence_hash") private String evidenceHash;
    @TableField("bundle_hash") private String bundleHash;
    @TableField("logical_diff_hash") private String logicalDiffHash;
    @TableField("logical_diff_identity_json") private String logicalDiffIdentityJson;
    @TableField("baseline_fingerprint") private String baselineFingerprint;
    @TableField("snapshot_required") private Boolean snapshotRequired;
    @TableField("planned_apply_action_id") private String plannedApplyActionId;
}

package com.terraria.skills.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("crawler_automation_approval")
public class CrawlerAutomationApproval implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("request_key")
    private String requestKey;

    @TableField("run_id")
    private String runId;

    @TableField("decision_hash")
    private String decisionHash;

    @TableField("policy_set_hash")
    private String policySetHash;

    @TableField("evidence_hash")
    private String evidenceHash;

    @TableField("bundle_hash")
    private String bundleHash;

    @TableField("logical_diff_hash")
    private String logicalDiffHash;

    @TableField("logical_diff_identity_json")
    private String logicalDiffIdentityJson;

    @TableField("baseline_fingerprint")
    private String baselineFingerprint;

    @TableField("planned_apply_action_id")
    private String plannedApplyActionId;

    @TableField("actor")
    private String actor;

    @TableField("action")
    private String action;

    @TableField("reason")
    private String reason;

    @TableField("reauth_id")
    private String reauthId;

    @TableField("run_version")
    private Long runVersion;

    @TableField("version")
    private Long version;

    @TableField("consumed_at")
    private LocalDateTime consumedAt;

    @TableField("created_at")
    private LocalDateTime createdAt;
}

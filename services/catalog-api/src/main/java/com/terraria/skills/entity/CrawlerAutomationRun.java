package com.terraria.skills.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("crawler_automation_run")
public class CrawlerAutomationRun implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("run_id")
    private String runId;

    @TableField("primary_domain_id")
    private String primaryDomainId;

    @TableField("covered_domains_json")
    private String coveredDomainsJson;

    @TableField("policy_set_hash")
    private String policySetHash;

    @TableField("trigger_kind")
    private String triggerKind;

    @TableField("status")
    private String status;

    @TableField("baseline_fingerprint")
    private String baselineFingerprint;

    @TableField("version")
    private Long version;

    @TableField("created_at")
    private LocalDateTime createdAt;

    @TableField("completed_at")
    private LocalDateTime completedAt;
}

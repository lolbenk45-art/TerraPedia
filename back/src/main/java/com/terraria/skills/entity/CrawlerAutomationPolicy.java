package com.terraria.skills.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("crawler_automation_policy")
public class CrawlerAutomationPolicy implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("domain_id")
    private String domainId;

    @TableField("current_version")
    private Long currentVersion;

    @TableField("current_level")
    private String currentLevel;

    @TableField("operational_state")
    private String operationalState;

    @TableField("circuit_reason")
    private String circuitReason;

    @TableField("circuit_opened_at")
    private LocalDateTime circuitOpenedAt;

    @TableField("version")
    private Long version;

    @TableField("updated_at")
    private LocalDateTime updatedAt;
}

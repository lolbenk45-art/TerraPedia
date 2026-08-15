package com.terraria.skills.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("security_audit_log")
public class SecurityAuditLog implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("event_type")
    private String eventType;

    @TableField("actor_type")
    private String actorType;

    @TableField("actor_id")
    private Long actorId;

    @TableField("email_masked")
    private String emailMasked;

    @TableField("ip_address")
    private String ipAddress;

    @TableField("details")
    private String details;

    @TableField("created_at")
    private LocalDateTime createdAt;
}

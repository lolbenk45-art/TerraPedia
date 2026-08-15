package com.terraria.skills.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("npc_buff_relations")
public class NpcBuffRelation implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("npc_id")
    private Long npcId;

    @TableField("buff_id")
    private Long buffId;

    @TableField("buff_source_id")
    private Integer buffSourceId;

    @TableField("relation_type")
    private String relationType;

    @TableField("duration_ticks")
    private Integer durationTicks;

    @TableField("chance_value")
    private BigDecimal chanceValue;

    @TableField("chance_text")
    private String chanceText;

    @TableField("conditions")
    private String conditions;

    @TableField("notes")
    private String notes;

    @TableField("sort_order")
    private Integer sortOrder;

    @TableField("status")
    private Integer status;

    @TableLogic
    @TableField("deleted")
    private Integer deleted;

    @TableField("created_at")
    private LocalDateTime createdAt;

    @TableField("updated_at")
    private LocalDateTime updatedAt;
}

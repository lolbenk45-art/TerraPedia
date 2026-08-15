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
@TableName("npc_loot_entries")
public class NpcLootEntry implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("npc_id")
    private Long npcId;

    @TableField("item_id")
    private Long itemId;

    @TableField("source_item_id")
    private Integer sourceItemId;

    @TableField("drop_source_kind")
    private String dropSourceKind;

    @TableField("quantity_min")
    private Integer quantityMin;

    @TableField("quantity_max")
    private Integer quantityMax;

    @TableField("quantity_text")
    private String quantityText;

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

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
@TableName("item_acquisition_sources")
public class ItemAcquisitionSource implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("item_id")
    private Long itemId;

    @TableField("source_type")
    private String sourceType;

    @TableField("source_ref_type")
    private String sourceRefType;

    @TableField("source_ref_id")
    private Long sourceRefId;

    @TableField("source_ref_name")
    private String sourceRefName;

    @TableField("biome_id")
    private Long biomeId;

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

    @TableField("source_provider")
    private String sourceProvider;

    @TableField("source_page")
    private String sourcePage;

    @TableField("source_revision_timestamp")
    private LocalDateTime sourceRevisionTimestamp;

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

package com.terraria.skills.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("buffs")
public class Buff implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("source_id")
    private Integer sourceId;

    @TableField("internal_name")
    private String internalName;

    @TableField("english_name")
    private String englishName;

    @TableField("name_zh")
    private String nameZh;

    @TableField("tooltip_en")
    private String tooltipEn;

    @TableField("tooltip_zh")
    private String tooltipZh;

    @TableField("image")
    private String image;

    @TableField("buff_type")
    private String buffType;

    @TableField("source_item_count")
    private Integer sourceItemCount;

    @TableField("immune_npc_count")
    private Integer immuneNpcCount;

    @TableField("source_items_json")
    private String sourceItemsJson;

    @TableField("immune_npc_sample_json")
    private String immuneNpcSampleJson;

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

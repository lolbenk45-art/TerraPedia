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
@TableName("items")
public class Item implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("name")
    private String name;

    @TableField("name_zh")
    private String nameZh;

    @TableField("internal_name")
    private String internalName;

    @TableField("image")
    private String image;

    @TableField("category_id")
    private Long categoryId;

    @TableField("description")
    private String description;

    @TableField("description_zh")
    private String descriptionZh;

    @TableField("damage")
    private Integer damage;

    @TableField("defense")
    private Integer defense;

    @TableField("knockback")
    private Integer knockback;

    @TableField("use_time")
    private Integer useTime;

    @TableField("width")
    private Integer width;

    @TableField("height")
    private Integer height;

    @TableField("buy")
    private Integer buy;

    @TableField("sell")
    private Integer sell;

    @TableField("tooltip")
    private String tooltip;

    @TableField("tooltip_zh")
    private String tooltipZh;

    @TableField("rarity_id")
    private Long rarityId;

    @TableField("game_period_id")
    private Long gamePeriodId;

    @TableField("game_model_id")
    private Long gameModelId;

    @TableField("is_stackable")
    private Boolean isStackable;

    @TableField("stack_size")
    private Integer stackSize;

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

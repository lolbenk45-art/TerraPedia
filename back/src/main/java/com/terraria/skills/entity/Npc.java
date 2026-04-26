package com.terraria.skills.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("npcs")
public class Npc implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("game_id")
    private Long gameId;

    @TableField("internal_name")
    private String internalName;

    @TableField("name")
    private String name;

    @TableField("name_zh")
    private String nameZh;

    @TableField("sub_name")
    private String subName;

    @TableField("sub_name_zh")
    private String subNameZh;

    @TableField("image_url")
    private String imageUrl;

    @TableField("category_id")
    private Long categoryId;

    @TableField("game_period_id")
    private Long gamePeriodId;

    @TableField("game_model_id")
    private Long gameModelId;

    @TableField("is_boss")
    private Boolean isBoss;

    @TableField("boss_group_id")
    private Long bossGroupId;

    @TableField("boss_role")
    private String bossRole;

    @TableField("is_friendly")
    private Boolean isFriendly;

    @TableField("is_town_npc")
    private Boolean isTownNpc;

    @TableField("behavior_notes")
    private String behaviorNotes;

    @TableField("banner_source_item_id")
    private Integer bannerSourceItemId;

    @TableField("banner_item_id")
    private Long bannerItemId;

    @TableField("catch_source_item_id")
    private Integer catchSourceItemId;

    @TableField("catch_item_id")
    private Long catchItemId;

    @TableField("status")
    private Integer status;

    @TableField("created_at")
    private LocalDateTime createdAt;

    @TableField("updated_at")
    private LocalDateTime updatedAt;
}

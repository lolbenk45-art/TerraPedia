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
@TableName("boss_groups")
public class BossGroup implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("code")
    private String code;

    @TableField("name_en")
    private String nameEn;

    @TableField("name_zh")
    private String nameZh;

    @TableField("boss_type")
    private String bossType;

    @TableField("image_url")
    private String imageUrl;

    @TableField("progression_order")
    private Integer progressionOrder;

    @TableField("notes")
    private String notes;

    @TableField("summon_method")
    private String summonMethod;

    @TableField("source_page")
    private String sourcePage;

    @TableField("source_revision_timestamp")
    private LocalDateTime sourceRevisionTimestamp;

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

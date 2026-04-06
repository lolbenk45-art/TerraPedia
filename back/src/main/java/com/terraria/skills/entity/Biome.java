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
@TableName("biomes")
public class Biome implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("code")
    private String code;

    @TableField("name_en")
    private String nameEn;

    @TableField("name_zh")
    private String nameZh;

    @TableField("alias_en")
    private String aliasEn;

    @TableField("alias_zh")
    private String aliasZh;

    @TableField("layer_type")
    private String layerType;

    @TableField("biome_type")
    private String biomeType;

    @TableField("description")
    private String description;

    @TableField("icon_url")
    private String iconUrl;

    @TableField("source_provider")
    private String sourceProvider;

    @TableField("source_page")
    private String sourcePage;

    @TableField("source_revision_timestamp")
    private LocalDateTime sourceRevisionTimestamp;

    @TableField("last_synced_at")
    private LocalDateTime lastSyncedAt;

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

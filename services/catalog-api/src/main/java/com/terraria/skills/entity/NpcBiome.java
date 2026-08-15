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
@TableName("npc_biomes")
public class NpcBiome implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("npc_id")
    private Long npcId;

    @TableField("biome_id")
    private Long biomeId;

    @TableField("relation_type")
    private String relationType;

    @TableField("spawn_context")
    private String spawnContext;

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

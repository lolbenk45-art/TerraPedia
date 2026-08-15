package com.terraria.skills.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("user_saved_routes")
public class UserSavedRoute implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("user_id")
    private Long userId;

    @TableField("target_type")
    private String targetType;

    @TableField("target_id")
    private Long targetId;

    @TableField("route_mode")
    private String routeMode;

    @TableField("selected_variant")
    private String selectedVariant;

    @TableField("selected_recipe_key")
    private String selectedRecipeKey;

    @TableField("max_depth")
    private Integer maxDepth;

    @TableField("title")
    private String title;

    @TableField("note")
    private String note;

    @TableField("url")
    private String url;

    @TableField("snapshot_json")
    private String snapshotJson;

    @TableField("deleted")
    private Integer deleted;

    @TableField("created_at")
    private LocalDateTime createdAt;

    @TableField("updated_at")
    private LocalDateTime updatedAt;
}

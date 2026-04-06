package com.terraria.skills.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("recipe_stations")
public class RecipeStation implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("recipe_id")
    private Long recipeId;

    @TableField("station_id")
    private Long stationId;

    @TableField("station_item_id")
    private Long stationItemId;

    @TableField("station_internal_name")
    private String stationInternalName;

    @TableField("station_name_raw")
    private String stationNameRaw;

    @TableField("is_alternative")
    private Boolean isAlternative;

    @TableField("sort_order")
    private Integer sortOrder;

    @TableField("created_at")
    private LocalDateTime createdAt;

    @TableField("updated_at")
    private LocalDateTime updatedAt;
}

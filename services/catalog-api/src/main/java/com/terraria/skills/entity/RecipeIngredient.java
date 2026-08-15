package com.terraria.skills.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("recipe_ingredients")
public class RecipeIngredient implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("recipe_id")
    private Long recipeId;

    @TableField("ingredient_item_id")
    private Long ingredientItemId;

    @TableField("ingredient_internal_name")
    private String ingredientInternalName;

    @TableField("ingredient_name_raw")
    private String ingredientNameRaw;

    @TableField("ingredient_group_type")
    private String ingredientGroupType;

    @TableField("quantity_min")
    private Integer quantityMin;

    @TableField("quantity_max")
    private Integer quantityMax;

    @TableField("quantity_text")
    private String quantityText;

    @TableField("sort_order")
    private Integer sortOrder;

    @TableField("created_at")
    private LocalDateTime createdAt;

    @TableField("updated_at")
    private LocalDateTime updatedAt;
}

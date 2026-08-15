package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class RecipeIngredientDTO {
    private Long id;
    private Long recipeId;
    private Long ingredientItemId;
    private String ingredientInternalName;
    private String ingredientNameRaw;
    private String ingredientGroupType;
    private Integer quantityMin;
    private Integer quantityMax;
    private String quantityText;
    private Integer sortOrder;
    private String itemName;
    private String itemNameZh;
    private String itemInternalName;
    private String itemImage;
}

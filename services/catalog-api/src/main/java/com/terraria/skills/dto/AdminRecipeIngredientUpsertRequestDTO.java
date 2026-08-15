package com.terraria.skills.dto;

import lombok.Data;

@Data
public class AdminRecipeIngredientUpsertRequestDTO {
    private Long ingredientItemId;
    private String ingredientInternalName;
    private String ingredientNameRaw;
    private String ingredientGroupType;
    private Integer quantityMin;
    private Integer quantityMax;
    private String quantityText;
    private Integer sortOrder;
}

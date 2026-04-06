package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class RecipeConditionDTO {
    private Long id;
    private Long recipeId;
    private String refType;
    private Long refId;
    private String requirementRole;
    private String notes;
    private Integer sortOrder;
    private String refCode;
    private String refNameEn;
    private String refNameZh;
    private String refContextType;
}

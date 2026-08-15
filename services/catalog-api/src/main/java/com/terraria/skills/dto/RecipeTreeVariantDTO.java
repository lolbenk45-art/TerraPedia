package com.terraria.skills.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class RecipeTreeVariantDTO {
    private String variantKey;
    private String variantLabel;
    private String versionScope;
    private Integer recipeCount;
    private List<RecipeTreeNodeDTO> roots = new ArrayList<>();
}

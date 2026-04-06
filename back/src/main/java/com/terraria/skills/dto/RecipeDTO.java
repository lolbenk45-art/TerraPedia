package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class RecipeDTO {
    private Long id;
    private Long resultItemId;
    private String resultInternalName;
    private String resultItemName;
    private String resultItemNameZh;
    private String resultItemInternalName;
    private String resultItemImage;
    private Integer resultQuantity;
    private String versionScope;
    private String notes;
    private String sourceProvider;
    private String sourcePage;
    private LocalDateTime sourceRevisionTimestamp;
    private Integer sortOrder;
    private List<RecipeIngredientDTO> ingredients = new ArrayList<>();
    private List<RecipeStationDTO> stations = new ArrayList<>();
    private List<RecipeConditionDTO> conditions = new ArrayList<>();
}

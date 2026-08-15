package com.terraria.skills.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class AdminRecipeUpsertRequestDTO {
    private String resultInternalName;
    private Integer resultQuantity;
    private String versionScope;
    private String notes;
    private String sourceProvider;
    private String sourcePage;
    private String sourceRevisionTimestamp;
    private Integer sortOrder;
    private List<AdminRecipeIngredientUpsertRequestDTO> ingredients = new ArrayList<>();
    private List<AdminRecipeStationUpsertRequestDTO> stations = new ArrayList<>();
    private List<AdminRecipeConditionUpsertRequestDTO> conditions = new ArrayList<>();
}

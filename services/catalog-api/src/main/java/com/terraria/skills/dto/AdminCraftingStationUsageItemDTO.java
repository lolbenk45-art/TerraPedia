package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AdminCraftingStationUsageItemDTO {
    private Long resultItemId;
    private String resultItemName;
    private String resultItemNameZh;
    private String resultItemInternalName;
    private String resultItemImage;
    private Integer recipeCount;
    private String versionScope;
    private List<Long> recipeIds = new ArrayList<>();
}

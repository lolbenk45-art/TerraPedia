package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class RecipeStationDTO {
    private Long id;
    private Long recipeId;
    private Long stationId;
    private Long stationItemId;
    private String stationInternalName;
    private String stationNameRaw;
    private Boolean isAlternative;
    private Integer sortOrder;
    private String itemName;
    private String itemNameZh;
    private String itemInternalName;
    private String itemImage;
}

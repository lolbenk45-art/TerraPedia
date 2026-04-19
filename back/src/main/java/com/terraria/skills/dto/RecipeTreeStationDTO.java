package com.terraria.skills.dto;

import lombok.Data;

@Data
public class RecipeTreeStationDTO {
    private Long stationItemId;
    private String stationInternalName;
    private String stationName;
    private String stationNameZh;
    private String stationNameRaw;
    private String stationImage;
    private Boolean isAlternative;
    private String stationType;
    private String requirementRole;
    private String notes;
}

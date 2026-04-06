package com.terraria.skills.dto;

import lombok.Data;

@Data
public class AdminRecipeStationUpsertRequestDTO {
    private Long stationId;
    private Long stationItemId;
    private String stationInternalName;
    private String stationNameRaw;
    private Boolean isAlternative;
    private Integer sortOrder;
}

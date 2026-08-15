package com.terraria.skills.dto;

import lombok.Data;

@Data
public class AdminBiomeRelationUpsertRequestDTO {
    private Long relatedBiomeId;
    private String relationType;
    private String notes;
}

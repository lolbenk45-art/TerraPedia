package com.terraria.skills.dto;

import lombok.Data;

@Data
public class AdminRecipeConditionUpsertRequestDTO {
    private String refType;
    private Long refId;
    private String requirementRole;
    private String notes;
    private Integer sortOrder;
}

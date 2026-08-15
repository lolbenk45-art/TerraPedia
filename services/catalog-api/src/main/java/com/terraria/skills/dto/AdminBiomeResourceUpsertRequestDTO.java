package com.terraria.skills.dto;

import lombok.Data;

@Data
public class AdminBiomeResourceUpsertRequestDTO {
    private Long itemId;
    private String resourceNameRaw;
    private String resourceType;
    private String notes;
    private Integer sortOrder;
}

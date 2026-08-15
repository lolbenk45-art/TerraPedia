package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class BiomeResourceDTO {
    private Long id;
    private Long biomeId;
    private Long itemId;
    private String resourceNameRaw;
    private String resourceType;
    private String notes;
    private Integer sortOrder;
    private String itemName;
    private String itemInternalName;
    private String itemImage;
}

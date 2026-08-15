package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class BiomeItemRelationDTO {
    private Long id;
    private Long biomeId;
    private Long itemId;
    private String relationType;
    private String notes;
    private Integer sortOrder;
    private String itemName;
    private String itemNameZh;
    private String itemInternalName;
    private String itemImage;
    private Boolean missingItem;
}

package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class BiomeItemSourceDTO {
    private Long id;
    private Long itemId;
    private String sourceType;
    private String sourceRefType;
    private Long sourceRefId;
    private String sourceRefName;
    private Long biomeId;
    private String quantityText;
    private String chanceText;
    private String conditions;
    private String notes;
    private String sourceProvider;
    private String sourcePage;
    private Integer sortOrder;
    private String itemName;
    private String itemNameZh;
    private String itemInternalName;
    private String itemImage;
    private Boolean missingItem;
}

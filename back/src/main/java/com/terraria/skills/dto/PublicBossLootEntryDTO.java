package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PublicBossLootEntryDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private Long itemId;
    private Integer sourceItemId;
    private String dropSourceKind;
    private Integer quantityMin;
    private Integer quantityMax;
    private String quantityText;
    private BigDecimal chanceValue;
    private String chanceText;
    private String conditions;
    private String notes;
    private Integer sortOrder;
    private String itemName;
    private String itemNameZh;
    private String itemInternalName;
    @JsonInclude(JsonInclude.Include.ALWAYS)
    private String itemImage;
}

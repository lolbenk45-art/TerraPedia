package com.terraria.skills.dto;

import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;

@Data
public class NpcLootEntryDTO implements Serializable {

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
    private Long sourceRefId;
    private String sourceRefName;
    private String sourcePage;
    private String sourceRevisionTimestamp;
    private String itemName;
    private String itemNameZh;
    private String itemInternalName;
    private String imageUrl;
}

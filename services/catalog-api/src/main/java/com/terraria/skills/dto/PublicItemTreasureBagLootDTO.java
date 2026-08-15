package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PublicItemTreasureBagLootDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private Long treasureBagItemId;
    private Long itemId;
    private String itemName;
    private String itemNameZh;
    private String itemInternalName;
    private String itemImage;
    private Long sourceNpcId;
    private String sourceNpcName;
    private String sourceNpcNameZh;
    private String sourceNpcImageUrl;
    private String sourceNpcDetailPath;
    private String dropSourceKind;
    private String dropSourceKindLabel;
    private Integer quantityMin;
    private Integer quantityMax;
    private String quantityText;
    private BigDecimal chanceValue;
    private String chanceText;
    private String conditions;
    private String notes;
    private Integer sortOrder;
}

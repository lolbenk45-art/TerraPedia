package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PublicItemDetailDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private String name;
    private String nameZh;
    private String nameEn;
    private String internalName;
    private String image;
    private Long categoryId;
    private String categoryName;
    private Long rarityId;
    private String rarity;
    private Long gamePeriodId;
    private String gamePeriod;
    private Long gameModelId;
    private Boolean isStackable;
    private Integer stackSize;
    private String description;
    private String descriptionZh;
    private String descriptionEn;
    private Integer damage;
    private Integer defense;
    private Integer knockback;
    private Integer useTime;
    private Integer width;
    private Integer height;
    private Integer buy;
    private Integer sell;
    private String tooltip;
    private String tooltipZh;
    private String tooltipEn;
}

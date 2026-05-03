package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import lombok.Data;

import java.io.Serializable;

@Data
public class NormalizedItemImportDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String name;
    private String internalName;

    @JsonAlias({"nameZh", "name_zh"})
    private String nameZh;

    @JsonAlias({"imageUrl", "image_url"})
    private String image;

    @JsonAlias({"categoryCode", "category_code"})
    private String categoryCode;

    @JsonAlias({"categoryName", "category_name"})
    private String categoryName;

    private String description;
    private Long rarityId;
    private String rarity;
    private Long gamePeriodId;
    private Long gameModelId;
    private Boolean isStackable;
    private Integer stackSize;
    private Integer status;
    private Integer damage;
    private Integer defense;
    private Integer knockback;
    private Integer useTime;
    private Integer width;
    private Integer height;
    private Integer buy;
    private Integer sell;
    private String tooltip;
}

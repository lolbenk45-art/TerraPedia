package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class ItemDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private String name;
    private String nameZh;
    private String nameEn;
    private String internalName;

    @JsonAlias({"imageUrl", "image_url"})
    private String image;

    private Long categoryId;
    private List<Long> relatedCategoryIds;
    private Long rarityId;
    private Long gamePeriodId;
    private Long gameModelId;
    private Boolean isStackable;
    private Integer stackSize;
    private Integer status;
    private String categoryName;
    private List<String> categoryPaths;
    private String relatedCategoryIdsRaw;
    private String rarity;
    private String gamePeriod;
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
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

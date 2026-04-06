package com.terraria.skills.vo;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ItemVO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private String name;
    private String nameZh;
    private String nameEn;
    private String internalName;
    private String image;
    private String imageUrl;
    private Long categoryId;
    private List<Long> relatedCategoryIds;
    private Long rarityId;
    private Long gamePeriodId;
    private Long gameModelId;
    private Boolean isStackable;
    private Integer stackSize;
    private Integer status;
    private String category;
    private String rare;
    private String categoryName;
    private List<String> categoryPaths;
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

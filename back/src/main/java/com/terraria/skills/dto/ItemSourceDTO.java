package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ItemSourceDTO {
    private Long id;
    private Long itemId;
    private String sourceType;
    private String sourceRefType;
    private Long sourceRefId;
    private String sourceRefName;
    private String sourceRefNameZh;
    private String imageUrl;
    private String sourceRefImageUrl;
    private String itemImageUrl;
    private String npcImageUrl;
    private Long biomeId;
    private Integer quantityMin;
    private Integer quantityMax;
    private String quantityText;
    private BigDecimal chanceValue;
    private String chanceText;
    private String conditions;
    private String notes;
    private String sourceProvider;
    private String sourcePage;
    private LocalDateTime sourceRevisionTimestamp;
    private Integer sortOrder;
    private String biomeCode;
    private String biomeNameEn;
    private String biomeNameZh;
}

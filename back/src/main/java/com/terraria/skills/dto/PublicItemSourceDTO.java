package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PublicItemSourceDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private Long itemId;
    private String sourceType;
    private String sourceRefType;
    private Long sourceRefId;
    private String sourceRefName;
    private String sourceRefNameZh;
    private Long biomeId;
    private Integer quantityMin;
    private Integer quantityMax;
    private String quantityText;
    private BigDecimal chanceValue;
    private String chanceText;
    private String conditions;
    private String notes;
    private Integer sortOrder;
    private String biomeCode;
    private String biomeNameEn;
    private String biomeNameZh;
}

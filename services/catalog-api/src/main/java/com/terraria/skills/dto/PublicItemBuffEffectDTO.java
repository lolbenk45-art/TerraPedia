package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PublicItemBuffEffectDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private Long buffId;
    private Integer buffSourceId;
    private String buffInternalName;
    private String buffNameEn;
    private String buffNameZh;
    private String imageUrl;
    private String relationType;
    private String relationLabel;
    private Integer durationTicks;
    private String durationText;
    private BigDecimal chanceValue;
    private String chanceText;
    private String conditions;
    private String notes;
}

package com.terraria.skills.dto;

import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;

@Data
public class NpcBuffRelationDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private Long buffId;
    private Integer buffSourceId;
    private String relationType;
    private Integer durationTicks;
    private BigDecimal chanceValue;
    private String chanceText;
    private String conditions;
    private String notes;
    private Integer sortOrder;
    private String buffInternalName;
    private String buffNameEn;
    private String buffNameZh;
    private String imageUrl;
}

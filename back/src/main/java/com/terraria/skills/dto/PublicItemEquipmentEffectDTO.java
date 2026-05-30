package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PublicItemEquipmentEffectDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private Long itemId;
    private String itemInternalName;
    private String ownerKind;
    private String ownerKey;
    private String sourceKind;
    private String sourceLine;
    private Integer effectIndex;
    private String applyScope;
    private String slotType;
    private String statKey;
    private String statLabelZh;
    private String classScope;
    private String operation;
    private BigDecimal valueDecimal;
    private String unit;
    private String rawText;
    private String parseStatus;
}

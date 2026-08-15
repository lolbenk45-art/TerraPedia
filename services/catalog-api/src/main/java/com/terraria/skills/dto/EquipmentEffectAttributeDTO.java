package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class EquipmentEffectAttributeDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String statKey;
    private String statLabelZh;
    private String classScope;
    private String operation;
    private BigDecimal valueDecimal;
    private BigDecimal valueMaxDecimal;
    private String unit;
    private String applyScope;
    private String variantLabel;
    private String itemInternalName;
    private String slotType;
    private String conditionText;
    private String rawText;
    private String parseStatus;
}

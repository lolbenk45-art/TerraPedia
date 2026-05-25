package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class BossConditionDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String conditionType;
    private String label;
    private String value;
    private String sourceText;
    private Double confidence;
    private Boolean derived;
}

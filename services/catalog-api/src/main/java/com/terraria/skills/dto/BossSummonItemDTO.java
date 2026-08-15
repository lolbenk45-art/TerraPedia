package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class BossSummonItemDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long itemId;
    private String internalName;
    private String name;
    private String nameZh;
    private String imageUrl;
    private String role;
    private String sourceText;
    private Double confidence;
    private Boolean derived;
}

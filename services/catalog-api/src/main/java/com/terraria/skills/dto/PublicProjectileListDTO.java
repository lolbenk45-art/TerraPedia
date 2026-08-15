package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PublicProjectileListDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private Integer sourceId;
    private String internalName;
    private String name;
    private String nameZh;
    @JsonInclude(JsonInclude.Include.ALWAYS)
    private String imageUrl;
    private Integer aiStyle;
    private Integer damage;
    private BigDecimal knockBack;
    private Boolean hostile;
    private Boolean friendly;
}

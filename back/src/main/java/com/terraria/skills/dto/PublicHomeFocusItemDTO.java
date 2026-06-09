package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Builder;
import lombok.Data;

import java.io.Serializable;

@Data
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PublicHomeFocusItemDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private String name;
    private String nameZh;
    private String internalName;
    private String href;
    private String image;
    private String categoryName;
    private String gamePeriod;
    private String rarity;
    private Integer damage;
    private Integer knockback;
    private Integer useTime;
    private Integer sell;
    private String reasonLabel;
}

package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PublicItemListDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private String name;
    private String nameZh;
    private String internalName;
    private String image;
    private Long categoryId;
    private String categoryName;
    private Long rarityId;
    private String rarity;
    private Long gamePeriodId;
    private String gamePeriod;
    private Boolean isStackable;
    private Integer stackSize;
    private Long price;
    private Long buy;
    private Long sell;

    @JsonIgnore
    private LocalDateTime updatedAt;
}

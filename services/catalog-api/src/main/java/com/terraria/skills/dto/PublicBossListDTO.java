package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PublicBossListDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private String code;
    private String name;
    private String nameZh;
    private String nameEn;
    private String bossType;
    @JsonInclude(JsonInclude.Include.ALWAYS)
    private String imageUrl;
    private Integer progressionOrder;
    private String summonMethod;
    private String notes;
    private Integer memberCount;
    private List<String> memberNames = new ArrayList<>();
    private String memberSourceMode;
    private Integer lootEntryCount;
    private Integer uniqueLootItemCount;
}

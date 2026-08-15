package com.terraria.skills.dto;

import lombok.Data;

@Data
public class PublicNpcQuery {
    private int page;
    private int limit;
    private String search;
    private Long categoryId;
    private Boolean isTownNpc;
    private Boolean isFriendly;
    private Boolean isBoss;
    private Boolean hasShop;
    private Boolean hasLoot;
}

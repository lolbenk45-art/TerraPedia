package com.terraria.skills.dto;

import lombok.Data;

@Data
public class PublicBossQuery {
    private int page;
    private int limit;
    private String search;
    private String bossType;
    private String sortBy;
    private String sortDirection;
}

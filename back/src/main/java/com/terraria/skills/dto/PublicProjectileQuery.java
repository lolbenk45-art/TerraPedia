package com.terraria.skills.dto;

import lombok.Data;

@Data
public class PublicProjectileQuery {
    private int page;
    private int limit;
    private String search;
    private String sortBy;
    private String sortDirection;
}

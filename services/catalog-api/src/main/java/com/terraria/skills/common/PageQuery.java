package com.terraria.skills.common;

import lombok.Data;
import java.util.List;

@Data
public class PageQuery {

    private int page = 1;
    private int limit = 20;
    private String search;
    private Long categoryId;
    private List<Long> categoryIds;
    private String rarity;
    private Long gamePeriodId;
    private String sortBy;
    private String sortDirection;
}

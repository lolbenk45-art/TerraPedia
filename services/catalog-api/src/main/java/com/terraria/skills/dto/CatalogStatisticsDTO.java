package com.terraria.skills.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CatalogStatisticsDTO {
    private long totalItems;
    private long totalCategories;
    private long totalBosses;
    private long totalNpcs;
    private long totalBuffs;
    private long totalBiomes;
    private long totalArmorSets;
    private long totalProjectiles;
    private long totalPublishedArticles;
    private List<CategoryCountDTO> rootCategoryCounts;
    private Map<Long, Long> categoryItemCounts;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class CategoryCountDTO {
        private Long categoryId;
        private String name;
        private long count;
    }
}

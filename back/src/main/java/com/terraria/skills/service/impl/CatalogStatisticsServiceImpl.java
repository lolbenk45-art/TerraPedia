package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.terraria.skills.dto.CatalogStatisticsDTO;
import com.terraria.skills.dto.CategoryDTO;
import com.terraria.skills.dto.CategoryItemCountDTO;
import com.terraria.skills.entity.Item;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.CategoryManagementService;
import com.terraria.skills.service.CatalogStatisticsService;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CatalogStatisticsServiceImpl implements CatalogStatisticsService {

    private final ItemMapper itemMapper;
    private final CategoryManagementService categoryManagementService;

    @Override
    @Cacheable(cacheNames = "stats:overview", unless = "#result == null")
    public CatalogStatisticsDTO getCatalogStatistics() {
        List<CategoryDTO> allCategories = categoryManagementService.getAllCategories();
        List<Long> allCategoryIds = allCategories.stream()
            .map(CategoryDTO::getId)
            .filter(Objects::nonNull)
            .collect(Collectors.toList());

        List<CategoryItemCountDTO> counts = Collections.emptyList();
        if (!allCategoryIds.isEmpty()) {
            counts = itemMapper.countItemsByCategoryIds(allCategoryIds);
        }

        Map<Long, Long> categoryCountMap = counts.stream()
            .collect(Collectors.toMap(CategoryItemCountDTO::getCategoryId, CategoryItemCountDTO::getCount));

        List<CatalogStatisticsDTO.CategoryCountDTO> rootCategoryCounts = buildRootCategoryCounts(allCategories, categoryCountMap);

        long totalItems = countAllItems();

        return CatalogStatisticsDTO.builder()
            .totalItems(totalItems)
            .totalCategories(allCategories.size())
            .rootCategoryCounts(rootCategoryCounts)
            .categoryItemCounts(categoryCountMap)
            .build();
    }

    private long countAllItems() {
        return itemMapper.countActiveItems();
    }

    private List<CatalogStatisticsDTO.CategoryCountDTO> buildRootCategoryCounts(
        List<CategoryDTO> allCategories,
        Map<Long, Long> counts
    ) {
        return allCategories.stream()
            .filter(cat -> (cat.getParentId() == null || cat.getParentId() == 0) &&
                !"CATEGORY_NPC".equals(cat.getCode()) &&
                !"CATEGORY_BUFF".equals(cat.getCode()))
            .map(cat -> {
                Set<Long> ids = new LinkedHashSet<>();
                ids.add(cat.getId());
                List<CategoryDTO> descendants = categoryManagementService.getAllDescendants(cat.getId());
                for (CategoryDTO descendant : descendants) {
                    if (descendant.getId() != null) {
                        ids.add(descendant.getId());
                    }
                }
                long aggregated = ids.stream()
                    .mapToLong(id -> counts.getOrDefault(id, 0L))
                    .sum();
                return CatalogStatisticsDTO.CategoryCountDTO.builder()
                    .categoryId(cat.getId())
                    .name(cat.getName())
                    .count(aggregated)
                    .build();
            })
            .collect(Collectors.toList());
    }
}

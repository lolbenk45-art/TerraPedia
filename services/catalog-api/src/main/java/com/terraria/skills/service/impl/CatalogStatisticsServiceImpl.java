package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.terraria.skills.dto.CatalogStatisticsDTO;
import com.terraria.skills.dto.CategoryDTO;
import com.terraria.skills.dto.CategoryItemCountDTO;
import com.terraria.skills.entity.ArmorSet;
import com.terraria.skills.entity.Article;
import com.terraria.skills.entity.Biome;
import com.terraria.skills.entity.BossGroup;
import com.terraria.skills.entity.Buff;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.Npc;
import com.terraria.skills.entity.Projectile;
import com.terraria.skills.mapper.ArmorSetMapper;
import com.terraria.skills.mapper.ArticleMapper;
import com.terraria.skills.mapper.BiomeMapper;
import com.terraria.skills.mapper.BossGroupMapper;
import com.terraria.skills.mapper.BuffMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.mapper.NpcMapper;
import com.terraria.skills.mapper.ProjectileMapper;
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
    private final BossGroupMapper bossGroupMapper;
    private final NpcMapper npcMapper;
    private final BuffMapper buffMapper;
    private final BiomeMapper biomeMapper;
    private final ArmorSetMapper armorSetMapper;
    private final ProjectileMapper projectileMapper;
    private final ArticleMapper articleMapper;

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
            .totalBosses(countActiveBosses())
            .totalNpcs(countActiveNpcs())
            .totalBuffs(countActiveBuffs())
            .totalBiomes(countActiveBiomes())
            .totalArmorSets(countActiveArmorSets())
            .totalProjectiles(countActiveProjectiles())
            .totalPublishedArticles(countPublishedArticles())
            .rootCategoryCounts(rootCategoryCounts)
            .categoryItemCounts(categoryCountMap)
            .build();
    }

    private long countAllItems() {
        return itemMapper.countActiveItems();
    }

    private long countActiveBosses() {
        return bossGroupMapper.selectCount(new LambdaQueryWrapper<BossGroup>()
            .and(scope -> scope.eq(BossGroup::getStatus, 1).or().isNull(BossGroup::getStatus)));
    }

    private long countActiveNpcs() {
        return npcMapper.selectCount(new LambdaQueryWrapper<Npc>()
            .and(scope -> scope.eq(Npc::getStatus, 1).or().isNull(Npc::getStatus)));
    }

    private long countActiveBuffs() {
        return buffMapper.selectCount(new LambdaQueryWrapper<Buff>()
            .and(scope -> scope.eq(Buff::getStatus, 1).or().isNull(Buff::getStatus)));
    }

    private long countActiveBiomes() {
        return biomeMapper.selectCount(new LambdaQueryWrapper<Biome>()
            .eq(Biome::getStatus, 1));
    }

    private long countActiveArmorSets() {
        return armorSetMapper.selectCount(new LambdaQueryWrapper<ArmorSet>()
            .eq(ArmorSet::getStatus, 1));
    }

    private long countActiveProjectiles() {
        return projectileMapper.selectCount(new LambdaQueryWrapper<Projectile>()
            .and(scope -> scope.eq(Projectile::getStatus, 1).or().isNull(Projectile::getStatus)));
    }

    private long countPublishedArticles() {
        return articleMapper.selectCount(new LambdaQueryWrapper<Article>()
            .eq(Article::getStatus, "PUBLISHED"));
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

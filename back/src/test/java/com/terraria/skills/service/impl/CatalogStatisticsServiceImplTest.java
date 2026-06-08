package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.terraria.skills.dto.CatalogStatisticsDTO;
import com.terraria.skills.mapper.ArmorSetMapper;
import com.terraria.skills.mapper.ArticleMapper;
import com.terraria.skills.mapper.BiomeMapper;
import com.terraria.skills.mapper.BossGroupMapper;
import com.terraria.skills.mapper.BuffMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.mapper.NpcMapper;
import com.terraria.skills.mapper.ProjectileMapper;
import com.terraria.skills.service.CategoryManagementService;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CatalogStatisticsServiceImplTest {

    @Test
    void shouldExposePublicEntityTotalsForHomepage() {
        ItemMapper itemMapper = mock(ItemMapper.class);
        CategoryManagementService categoryManagementService = mock(CategoryManagementService.class);
        BossGroupMapper bossGroupMapper = mock(BossGroupMapper.class);
        NpcMapper npcMapper = mock(NpcMapper.class);
        BuffMapper buffMapper = mock(BuffMapper.class);
        BiomeMapper biomeMapper = mock(BiomeMapper.class);
        ArmorSetMapper armorSetMapper = mock(ArmorSetMapper.class);
        ProjectileMapper projectileMapper = mock(ProjectileMapper.class);
        ArticleMapper articleMapper = mock(ArticleMapper.class);

        when(categoryManagementService.getAllCategories()).thenReturn(List.of());
        when(itemMapper.countActiveItems()).thenReturn(6131L);
        when(bossGroupMapper.selectCount(any(Wrapper.class))).thenReturn(31L);
        when(npcMapper.selectCount(any(Wrapper.class))).thenReturn(762L);
        when(buffMapper.selectCount(any(Wrapper.class))).thenReturn(388L);
        when(biomeMapper.selectCount(any(Wrapper.class))).thenReturn(7L);
        when(armorSetMapper.selectCount(any(Wrapper.class))).thenReturn(18L);
        when(projectileMapper.selectCount(any(Wrapper.class))).thenReturn(1111L);
        when(articleMapper.selectCount(any(Wrapper.class))).thenReturn(9L);

        CatalogStatisticsServiceImpl service = new CatalogStatisticsServiceImpl(
            itemMapper,
            categoryManagementService,
            bossGroupMapper,
            npcMapper,
            buffMapper,
            biomeMapper,
            armorSetMapper,
            projectileMapper,
            articleMapper
        );

        CatalogStatisticsDTO stats = service.getCatalogStatistics();

        assertEquals(6131L, stats.getTotalItems());
        assertEquals(31L, stats.getTotalBosses());
        assertEquals(762L, stats.getTotalNpcs());
        assertEquals(388L, stats.getTotalBuffs());
        assertEquals(7L, stats.getTotalBiomes());
        assertEquals(18L, stats.getTotalArmorSets());
        assertEquals(1111L, stats.getTotalProjectiles());
        assertEquals(9L, stats.getTotalPublishedArticles());
    }
}

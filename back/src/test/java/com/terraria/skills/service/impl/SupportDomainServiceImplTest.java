package com.terraria.skills.service.impl;

import com.terraria.skills.dto.CategoryDTO;
import com.terraria.skills.dto.SupportDomainCatalogDTO;
import com.terraria.skills.entity.ConditionTerm;
import com.terraria.skills.entity.GamePeriod;
import com.terraria.skills.entity.WorldContext;
import com.terraria.skills.mapper.ConditionTermMapper;
import com.terraria.skills.mapper.GamePeriodMapper;
import com.terraria.skills.mapper.WorldContextMapper;
import com.terraria.skills.service.CategoryManagementService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SupportDomainServiceImplTest {

    @Mock
    private CategoryManagementService categoryManagementService;

    @Mock
    private GamePeriodMapper gamePeriodMapper;

    @Mock
    private WorldContextMapper worldContextMapper;

    @Mock
    private ConditionTermMapper conditionTermMapper;

    @InjectMocks
    private SupportDomainServiceImpl supportDomainService;

    @Test
    void shouldBuildAdminCatalogFromCanonicalSupportSources() {
        CategoryDTO weapon = category(10L, null, "WEAPON", "Weapon", 1);
        CategoryDTO sword = category(11L, 10L, "WEAPON_MELEE_SWORD", "Sword", 2);
        weapon.setChildren(List.of(sword));

        when(categoryManagementService.buildItemCategoryTree()).thenReturn(List.of(weapon));
        when(gamePeriodMapper.selectList(any())).thenReturn(List.of(
            gamePeriod(1L, "pre_hardmode", "前期", "Pre-Hardmode", 1, 1),
            gamePeriod(2L, "hardmode", "困难模式", "Hardmode", 2, 1)
        ));
        when(worldContextMapper.selectList(any())).thenReturn(List.of(
            worldContext(9L, "BLOOD_MOON", "Blood Moon", "血月", "EVENT", 1, 1)
        ));
        when(conditionTermMapper.selectList(any())).thenReturn(List.of(
            conditionTerm(30L, "MOON_PHASE_1_4", "Moon Phase 1-4", "月相 1–4", "MOON_PHASE_RANGE", 30, 1)
        ));

        SupportDomainCatalogDTO catalog = supportDomainService.getAdminCatalog();

        assertNotNull(catalog);
        assertEquals(2, catalog.getItemCategories().size());
        assertEquals("Weapon / Sword", catalog.getItemCategories().get(1).getPathLabel());
        assertEquals(2, catalog.getGamePeriods().size());
        assertEquals("pre_hardmode", catalog.getGamePeriods().get(0).getCode());
        assertEquals("前期", catalog.getGamePeriods().get(0).getLabel());
        assertEquals(1, catalog.getWorldContexts().size());
        assertEquals("EVENT", catalog.getWorldContexts().get(0).getContextType());
        assertEquals(1, catalog.getConditionTerms().size());
        assertEquals("MOON_PHASE_RANGE", catalog.getConditionTerms().get(0).getContextType());
        assertEquals("前期", supportDomainService.getGamePeriodLabel(1L));
        assertEquals("阶段 99", supportDomainService.getGamePeriodLabel(99L));
    }

    private CategoryDTO category(Long id, Long parentId, String code, String name, int sort) {
        CategoryDTO dto = new CategoryDTO();
        dto.setId(id);
        dto.setParentId(parentId);
        dto.setCode(code);
        dto.setName(name);
        dto.setSort(sort);
        dto.setStatus(1);
        return dto;
    }

    private GamePeriod gamePeriod(Long id, String code, String labelZh, String labelEn, int sortOrder, int status) {
        GamePeriod gamePeriod = new GamePeriod();
        gamePeriod.setId(id);
        gamePeriod.setCode(code);
        gamePeriod.setDisplayNameZh(labelZh);
        gamePeriod.setDisplayNameEn(labelEn);
        gamePeriod.setSortOrder(sortOrder);
        gamePeriod.setStatus(status);
        gamePeriod.setDeleted(0);
        return gamePeriod;
    }

    private WorldContext worldContext(Long id, String code, String nameEn, String nameZh, String contextType, int sortOrder, int status) {
        WorldContext worldContext = new WorldContext();
        worldContext.setId(id);
        worldContext.setCode(code);
        worldContext.setNameEn(nameEn);
        worldContext.setNameZh(nameZh);
        worldContext.setContextType(contextType);
        worldContext.setSortOrder(sortOrder);
        worldContext.setStatus(status);
        worldContext.setDeleted(0);
        return worldContext;
    }

    private ConditionTerm conditionTerm(Long id, String code, String nameEn, String nameZh, String termType, int sortOrder, int status) {
        ConditionTerm conditionTerm = new ConditionTerm();
        conditionTerm.setId(id);
        conditionTerm.setCode(code);
        conditionTerm.setNameEn(nameEn);
        conditionTerm.setNameZh(nameZh);
        conditionTerm.setTermType(termType);
        conditionTerm.setSortOrder(sortOrder);
        conditionTerm.setStatus(status);
        conditionTerm.setDeleted(0);
        return conditionTerm;
    }
}

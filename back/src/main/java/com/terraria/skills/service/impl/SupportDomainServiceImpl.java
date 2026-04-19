package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.terraria.skills.dto.CategoryDTO;
import com.terraria.skills.dto.SupportCategoryOptionDTO;
import com.terraria.skills.dto.SupportDomainCatalogDTO;
import com.terraria.skills.dto.SupportDomainOptionDTO;
import com.terraria.skills.entity.GamePeriod;
import com.terraria.skills.entity.WorldContext;
import com.terraria.skills.mapper.GamePeriodMapper;
import com.terraria.skills.mapper.WorldContextMapper;
import com.terraria.skills.service.CategoryManagementService;
import com.terraria.skills.service.SupportDomainService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class SupportDomainServiceImpl implements SupportDomainService {

    private static final String UNSET_GAME_PERIOD_LABEL = "未设置";

    private final CategoryManagementService categoryManagementService;
    private final GamePeriodMapper gamePeriodMapper;
    private final WorldContextMapper worldContextMapper;

    @Override
    public SupportDomainCatalogDTO getAdminCatalog() {
        SupportDomainCatalogDTO catalog = new SupportDomainCatalogDTO();
        catalog.setItemCategories(flattenItemCategories(categoryManagementService.buildItemCategoryTree()));
        catalog.setGamePeriods(loadGamePeriods().stream().map(this::toGamePeriodOption).toList());
        catalog.setWorldContexts(loadWorldContexts().stream().map(this::toWorldContextOption).toList());
        return catalog;
    }

    @Override
    public Map<Long, String> getGamePeriodLabelMap() {
        Map<Long, String> labels = new LinkedHashMap<>();
        for (GamePeriod gamePeriod : loadGamePeriods()) {
            if (gamePeriod.getId() != null) {
                labels.put(gamePeriod.getId(), chooseLabel(gamePeriod.getDisplayNameZh(), gamePeriod.getDisplayNameEn(), gamePeriod.getCode()));
            }
        }
        return labels;
    }

    @Override
    public String getGamePeriodLabel(Long gamePeriodId) {
        return formatGamePeriodLabel(gamePeriodId, getGamePeriodLabelMap());
    }

    private List<GamePeriod> loadGamePeriods() {
        return gamePeriodMapper.selectList(new LambdaQueryWrapper<GamePeriod>()
            .orderByAsc(GamePeriod::getSortOrder, GamePeriod::getId));
    }

    private List<WorldContext> loadWorldContexts() {
        return worldContextMapper.selectList(new LambdaQueryWrapper<WorldContext>()
            .orderByAsc(WorldContext::getContextType, WorldContext::getSortOrder, WorldContext::getId));
    }

    private List<SupportCategoryOptionDTO> flattenItemCategories(List<CategoryDTO> roots) {
        List<SupportCategoryOptionDTO> result = new ArrayList<>();
        for (CategoryDTO root : roots == null ? List.<CategoryDTO>of() : roots) {
            flattenCategory(root, List.of(), result);
        }
        return result;
    }

    private void flattenCategory(CategoryDTO category, List<String> parentLabels, List<SupportCategoryOptionDTO> result) {
        if (category == null || category.getId() == null) {
            return;
        }
        String label = chooseLabel(category.getName(), category.getCode(), "Category " + category.getId());
        List<String> nextPath = new ArrayList<>(parentLabels);
        nextPath.add(label);

        SupportCategoryOptionDTO dto = new SupportCategoryOptionDTO();
        dto.setId(category.getId());
        dto.setParentId(category.getParentId());
        dto.setCode(category.getCode());
        dto.setLabel(label);
        dto.setPathLabel(String.join(" / ", nextPath));
        dto.setLevel(category.getLevel());
        dto.setSortOrder(category.getSort());
        dto.setStatus(category.getStatus());
        result.add(dto);

        for (CategoryDTO child : category.getChildren() == null ? List.<CategoryDTO>of() : category.getChildren()) {
            flattenCategory(child, nextPath, result);
        }
    }

    private SupportDomainOptionDTO toGamePeriodOption(GamePeriod gamePeriod) {
        SupportDomainOptionDTO dto = new SupportDomainOptionDTO();
        dto.setId(gamePeriod.getId());
        dto.setCode(gamePeriod.getCode());
        dto.setLabel(chooseLabel(gamePeriod.getDisplayNameZh(), gamePeriod.getDisplayNameEn(), gamePeriod.getCode()));
        dto.setLabelZh(trimToNull(gamePeriod.getDisplayNameZh()));
        dto.setLabelEn(trimToNull(gamePeriod.getDisplayNameEn()));
        dto.setSortOrder(gamePeriod.getSortOrder());
        dto.setStatus(gamePeriod.getStatus());
        return dto;
    }

    private SupportDomainOptionDTO toWorldContextOption(WorldContext worldContext) {
        SupportDomainOptionDTO dto = new SupportDomainOptionDTO();
        dto.setId(worldContext.getId());
        dto.setCode(worldContext.getCode());
        dto.setLabel(chooseLabel(worldContext.getNameZh(), worldContext.getNameEn(), worldContext.getCode()));
        dto.setLabelZh(trimToNull(worldContext.getNameZh()));
        dto.setLabelEn(trimToNull(worldContext.getNameEn()));
        dto.setContextType(trimToNull(worldContext.getContextType()));
        dto.setSortOrder(worldContext.getSortOrder());
        dto.setStatus(worldContext.getStatus());
        return dto;
    }

    private String formatGamePeriodLabel(Long gamePeriodId, Map<Long, String> labels) {
        if (gamePeriodId == null || gamePeriodId == 0) {
            return UNSET_GAME_PERIOD_LABEL;
        }
        return labels.getOrDefault(gamePeriodId, "阶段 " + gamePeriodId);
    }

    private String chooseLabel(String primary, String secondary, String fallback) {
        String first = trimToNull(primary);
        if (first != null) {
            return first;
        }
        String second = trimToNull(secondary);
        if (second != null) {
            return second;
        }
        return trimToNull(fallback);
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}

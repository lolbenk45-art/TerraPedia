package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.common.PageQuery;
import com.terraria.skills.dto.CategoryDTO;
import com.terraria.skills.dto.PublicItemDetailDTO;
import com.terraria.skills.dto.PublicItemListDTO;
import com.terraria.skills.dto.PublicItemSuggestionDTO;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.CategoryManagementService;
import com.terraria.skills.service.PublicItemService;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class PublicItemServiceImpl implements PublicItemService {

    private final ItemMapper itemMapper;
    private final CategoryManagementService categoryManagementService;

    @Override
    @Cacheable(cacheNames = "item:public:list", key = "#root.target.buildPublicListCacheKey(#pageQuery)", unless = "#result == null")
    public Page<PublicItemListDTO> getPublicItems(PageQuery pageQuery) {
        PageQuery safeQuery = pageQuery == null ? new PageQuery() : pageQuery;
        String normalizedSearch = trimToEmpty(safeQuery.getSearch());
        Long rarityId = mapRarityToId(safeQuery.getRarity());
        List<Long> categoryIds = resolveCategoryIds(safeQuery.getCategoryId());
        long total = itemMapper.countItemsWithSearch(
            normalizedSearch,
            safeQuery.getCategoryId(),
            categoryIds,
            rarityId,
            safeQuery.getGamePeriodId()
        );
        long limit = Math.max(safeQuery.getLimit(), 1);
        long offset = Math.max(safeQuery.getPage() - 1L, 0L) * limit;
        List<PublicItemListDTO> records = itemMapper.selectPublicItemsWithSearch(
            normalizedSearch,
            safeQuery.getCategoryId(),
            categoryIds,
            rarityId,
            safeQuery.getGamePeriodId(),
            normalizeSortBy(safeQuery.getSortBy()),
            normalizeSortDirection(safeQuery.getSortDirection()),
            limit,
            offset
        );

        Page<PublicItemListDTO> itemPage = new Page<>(safeQuery.getPage(), safeQuery.getLimit(), total);
        itemPage.setRecords(records);
        itemPage.setTotal(total);
        return itemPage;
    }

    @Override
    @Cacheable(cacheNames = "item:public:detail", key = "#id", unless = "#result == null")
    public PublicItemDetailDTO getPublicItemById(Long id) {
        return itemMapper.selectPublicItemDetailById(id);
    }

    @Override
    @Cacheable(
        cacheNames = "item:public:suggestions",
        key = "#root.target.buildPublicSuggestionsCacheKey(#keyword, #limit)",
        condition = "#keyword != null && !#keyword.trim().isEmpty()",
        unless = "#result == null"
    )
    public List<PublicItemSuggestionDTO> searchSuggestions(String keyword, int limit) {
        String normalizedKeyword = trimToEmpty(keyword);
        if (normalizedKeyword.isBlank()) {
            return List.of();
        }

        return itemMapper.selectPublicItemSuggestions(normalizedKeyword, normalizeSuggestionLimit(limit));
    }

    public String buildPublicListCacheKey(PageQuery pageQuery) {
        int page = pageQuery == null || pageQuery.getPage() < 1 ? 1 : pageQuery.getPage();
        int limit = pageQuery == null || pageQuery.getLimit() < 1 ? 20 : pageQuery.getLimit();
        String search = pageQuery == null ? "" : trimToEmpty(pageQuery.getSearch());
        String categoryId = pageQuery == null || pageQuery.getCategoryId() == null ? "" : String.valueOf(pageQuery.getCategoryId());
        String rarity = pageQuery == null ? "" : trimToEmpty(pageQuery.getRarity());
        String gamePeriodId = pageQuery == null || pageQuery.getGamePeriodId() == null ? "" : String.valueOf(pageQuery.getGamePeriodId());
        String sortBy = normalizeSortBy(pageQuery == null ? null : pageQuery.getSortBy());
        String sortDirection = normalizeSortDirection(pageQuery == null ? null : pageQuery.getSortDirection());

        return String.join("|",
            "v2",
            String.valueOf(page),
            String.valueOf(limit),
            search,
            categoryId,
            rarity,
            gamePeriodId,
            sortBy,
            sortDirection
        );
    }

    public String buildPublicSuggestionsCacheKey(String keyword, int limit) {
        return String.join("|",
            "v1",
            trimToEmpty(keyword),
            String.valueOf(normalizeSuggestionLimit(limit))
        );
    }

    private int normalizeSuggestionLimit(int limit) {
        if (limit < 1) {
            return 8;
        }
        return Math.min(limit, 10);
    }

    private List<Long> resolveCategoryIds(Long categoryId) {
        if (categoryId == null) {
            return null;
        }

        LinkedHashSet<Long> categoryIds = new LinkedHashSet<>();
        categoryIds.add(categoryId);
        categoryManagementService.getAllDescendants(categoryId).stream()
            .map(CategoryDTO::getId)
            .filter(Objects::nonNull)
            .forEach(categoryIds::add);

        return new ArrayList<>(categoryIds);
    }

    private Long mapRarityToId(String rarity) {
        if (rarity == null || rarity.isBlank()) {
            return null;
        }
        String value = rarity.trim();
        return switch (value) {
            case "鐏拌壊", "gray" -> -1L;
            case "鐧借壊", "普通", "white", "common" -> 0L;
            case "钃濊壊", "blue" -> 1L;
            case "缁胯壊", "green" -> 2L;
            case "姗欒壊", "orange" -> 3L;
            case "娴呯孩鑹?", "light_red", "light red" -> 4L;
            case "绮夎壊", "绮夌孩鑹?", "pink", "稀有", "rare" -> 5L;
            case "娴呯传鑹?", "light_purple", "light purple" -> 6L;
            case "榛勭豢鑹?", "lime" -> 7L;
            case "榛勮壊", "yellow", "史诗", "epic" -> 8L;
            case "闈掕壊", "cyan" -> 9L;
            case "绾㈣壊", "red", "传说", "legendary" -> 10L;
            case "绱壊", "purple" -> 11L;
            case "浠诲姟", "quest" -> -11L;
            case "涓撳", "expert" -> -12L;
            case "澶у笀", "master" -> -13L;
            default -> {
                try {
                    yield Long.parseLong(value);
                } catch (NumberFormatException ex) {
                    yield null;
                }
            }
        };
    }

    private String normalizeSortBy(String sortBy) {
        if (sortBy == null || sortBy.isBlank()) {
            return "id";
        }

        return switch (sortBy.trim()) {
            case "name" -> "name";
            case "rarityId" -> "rarityId";
            default -> "id";
        };
    }

    private String normalizeSortDirection(String sortDirection) {
        if (sortDirection == null || sortDirection.isBlank()) {
            return "asc";
        }

        return "asc".equalsIgnoreCase(sortDirection.trim()) ? "asc" : "desc";
    }

    private String trimToEmpty(String value) {
        return value == null ? "" : value.trim();
    }
}

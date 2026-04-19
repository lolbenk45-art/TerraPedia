package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.common.PageQuery;
import com.terraria.skills.dto.CategoryDTO;
import com.terraria.skills.dto.ItemDTO;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.ItemCategoryRel;
import com.terraria.skills.mapper.ItemCategoryRelMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.CategoryManagementService;
import com.terraria.skills.service.ItemService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

@Slf4j
@Service
@RequiredArgsConstructor
public class ItemServiceImpl implements ItemService {

    private static final String RARITY_COMMON = "\u666e\u901a";
    private static final String RARITY_RARE = "\u7a00\u6709";
    private static final String RARITY_EPIC = "\u53f2\u8bd7";
    private static final String RARITY_LEGENDARY = "\u4f20\u8bf4";

    private final ItemMapper itemMapper;
    private final ItemCategoryRelMapper itemCategoryRelMapper;
    private final CategoryManagementService categoryManagementService;

    @Override
    @Cacheable(cacheNames = "item:list", key = "#root.target.buildListCacheKey(#pageQuery)", unless = "#result == null")
    public Page<ItemDTO> getItems(PageQuery pageQuery) {
        Page<ItemDTO> mpPage = new Page<>(pageQuery.getPage(), pageQuery.getLimit());
        Long rarityId = mapRarityToId(pageQuery.getRarity());
        List<Long> categoryIds = resolveCategoryIds(pageQuery.getCategoryId());
        Page<ItemDTO> itemPage = itemMapper.selectItemsWithSearch(
            mpPage,
            pageQuery.getSearch(),
            pageQuery.getCategoryId(),
            categoryIds,
            rarityId,
            pageQuery.getGamePeriodId(),
            normalizeSortBy(pageQuery.getSortBy()),
            normalizeSortDirection(pageQuery.getSortDirection())
        );
        itemPage.getRecords().forEach(this::normalizeItemDTO);
        applyCategoryPaths(itemPage.getRecords());
        return itemPage;
    }

    @Override
    @Cacheable(cacheNames = "item:detail", key = "#id", unless = "#result == null")
    public ItemDTO getItemById(Long id) {
        ItemDTO dto = itemMapper.selectItemDetailById(id);
        normalizeItemDTO(dto);
        applyCategoryPaths(dto == null ? Collections.emptyList() : List.of(dto));
        return dto;
    }

    @Override
    public List<ItemDTO> getAllItems() {
        List<Item> items = itemMapper.selectList(new LambdaQueryWrapper<>());
        List<ItemDTO> dtoList = new ArrayList<>();
        for (Item item : items) {
            ItemDTO dto = new ItemDTO();
            BeanUtils.copyProperties(item, dto);
            normalizeItemDTO(dto);
            dtoList.add(dto);
        }
        return dtoList;
    }

    @Override
    @Cacheable(
        cacheNames = "item:suggestions",
        key = "#root.target.buildSuggestionsCacheKey(#keyword, #limit)",
        condition = "#keyword != null && !#keyword.trim().isEmpty()",
        unless = "#result == null"
    )
    public List<ItemDTO> searchSuggestions(String keyword, int limit) {
        String normalizedKeyword = trimToEmpty(keyword);
        if (normalizedKeyword.isBlank()) {
            return Collections.emptyList();
        }

        int normalizedLimit = normalizeSuggestionLimit(limit);
        List<ItemDTO> suggestions = itemMapper.selectItemSuggestions(normalizedKeyword, normalizedLimit);
        suggestions.forEach(this::normalizeItemDTO);
        applyCategoryPaths(suggestions);
        return suggestions;
    }

    @Override
    @Caching(evict = {
        @CacheEvict(cacheNames = "item:list", allEntries = true),
        @CacheEvict(cacheNames = "item:suggestions", allEntries = true),
        @CacheEvict(cacheNames = "item:aggregate", allEntries = true),
        @CacheEvict(cacheNames = "stats:overview", allEntries = true)
    })
    @Transactional
    public ItemDTO createItem(ItemDTO itemDTO) {
        validateItemInput(itemDTO);

        Item item = new Item();
        BeanUtils.copyProperties(itemDTO, item);

        if (item.getInternalName() == null || item.getInternalName().isBlank()) {
            item.setInternalName(generateInternalName(itemDTO.getName()));
        }
        if (item.getStatus() == null) {
            item.setStatus(1);
        }
        item.setRarityId(resolveRarityId(itemDTO));
        itemMapper.insert(item);
        syncItemCategoryRelations(item.getId(), itemDTO);
        return getItemById(item.getId());
    }

    @Override
    @Caching(evict = {
        @CacheEvict(cacheNames = "item:list", allEntries = true),
        @CacheEvict(cacheNames = "item:suggestions", allEntries = true),
        @CacheEvict(cacheNames = "item:aggregate", allEntries = true),
        @CacheEvict(cacheNames = "item:detail", key = "#id"),
        @CacheEvict(cacheNames = "stats:overview", allEntries = true)
    })
    @Transactional
    public ItemDTO updateItem(Long id, ItemDTO itemDTO) {
        validateItemInput(itemDTO);

        Item item = itemMapper.selectById(id);
        if (item == null) {
            return null;
        }

        BeanUtils.copyProperties(itemDTO, item, "id");
        if (item.getInternalName() == null || item.getInternalName().isBlank()) {
            item.setInternalName(generateInternalName(item.getName()));
        }
        item.setUpdatedAt(LocalDateTime.now());
        item.setRarityId(resolveRarityId(itemDTO));
        itemMapper.updateById(item);
        syncItemCategoryRelations(id, itemDTO);
        return getItemById(id);
    }

    @Override
    @Caching(evict = {
        @CacheEvict(cacheNames = "item:list", allEntries = true),
        @CacheEvict(cacheNames = "item:suggestions", allEntries = true),
        @CacheEvict(cacheNames = "item:aggregate", allEntries = true),
        @CacheEvict(cacheNames = "item:detail", key = "#id"),
        @CacheEvict(cacheNames = "stats:overview", allEntries = true)
    })
    public void deleteItem(Long id) {
        itemMapper.deleteById(id);
    }

    private void validateItemInput(ItemDTO itemDTO) {
        if (itemDTO == null) {
            throw new IllegalArgumentException("Request body is required");
        }
        if (itemDTO.getCategoryId() == null) {
            throw new IllegalArgumentException("categoryId is required");
        }
    }

    private void normalizeItemDTO(ItemDTO dto) {
        if (dto == null) {
            return;
        }
        if (dto.getNameEn() == null || dto.getNameEn().isBlank()) {
            dto.setNameEn(dto.getName());
        }
        if (dto.getDescriptionEn() == null || dto.getDescriptionEn().isBlank()) {
            dto.setDescriptionEn(dto.getDescription());
        }
        if (dto.getTooltipEn() == null || dto.getTooltipEn().isBlank()) {
            dto.setTooltipEn(dto.getTooltip());
        }
        if (dto.getRarity() == null || dto.getRarity().isBlank()) {
            dto.setRarity(mapRarityFromId(dto.getRarityId()));
        }
        dto.setRelatedCategoryIds(parseCategoryIds(dto.getCategoryId(), dto.getRelatedCategoryIdsRaw()));
    }

    private void applyCategoryPaths(List<ItemDTO> items) {
        if (items == null || items.isEmpty()) {
            return;
        }

        Map<Long, String> categoryPathById = categoryManagementService.getCategoryPathMap();

        for (ItemDTO item : items) {
            LinkedHashSet<Long> categoryIds = new LinkedHashSet<>();
            if (item.getCategoryId() != null) {
                categoryIds.add(item.getCategoryId());
            }
            if (item.getRelatedCategoryIdsRaw() != null && !item.getRelatedCategoryIdsRaw().isBlank()) {
                for (String value : item.getRelatedCategoryIdsRaw().split(",")) {
                    try {
                        categoryIds.add(Long.parseLong(value.trim()));
                    } catch (NumberFormatException ignored) {
                    }
                }
            }

            List<String> paths = new ArrayList<>();
            for (Long categoryId : categoryIds) {
                String path = categoryPathById.get(categoryId);
                if (path != null && !path.isBlank() && !paths.contains(path)) {
                    paths.add(path);
                }
            }
            item.setCategoryPaths(paths);
        }
    }

    private Long resolveRarityId(ItemDTO itemDTO) {
        if (itemDTO.getRarityId() != null) {
            return itemDTO.getRarityId();
        }
        return mapRarityToId(itemDTO.getRarity());
    }

    private Long mapRarityToId(String rarity) {
        if (rarity == null || rarity.isBlank()) {
            return null;
        }
        String value = rarity.trim();
        return switch (value) {
            case "灰色", "gray" -> -1L;
            case "白色", RARITY_COMMON, "white", "common" -> 0L;
            case "蓝色", "blue" -> 1L;
            case "绿色", "green" -> 2L;
            case "橙色", "orange" -> 3L;
            case "浅红色", "light_red", "light red" -> 4L;
            case "粉色", "粉红色", "pink", RARITY_RARE, "rare" -> 5L;
            case "浅紫色", "light_purple", "light purple" -> 6L;
            case "黄绿色", "lime" -> 7L;
            case "黄色", "yellow", RARITY_EPIC, "epic" -> 8L;
            case "青色", "cyan" -> 9L;
            case "红色", "red", RARITY_LEGENDARY, "legendary" -> 10L;
            case "紫色", "purple" -> 11L;
            case "任务", "quest" -> -11L;
            case "专家", "expert" -> -12L;
            case "大师", "master" -> -13L;
            default -> {
                try {
                    yield Long.parseLong(value);
                } catch (NumberFormatException ex) {
                    yield null;
                }
            }
        };
    }

    private String mapRarityFromId(Long rarityId) {
        if (Objects.equals(rarityId, -13L)) return "大师";
        if (Objects.equals(rarityId, -12L)) return "专家";
        if (Objects.equals(rarityId, -11L)) return "任务";
        if (Objects.equals(rarityId, -1L)) return "灰色";
        if (Objects.equals(rarityId, 0L)) return "白色";
        if (Objects.equals(rarityId, 1L)) return "蓝色";
        if (Objects.equals(rarityId, 2L)) return "绿色";
        if (Objects.equals(rarityId, 3L)) return "橙色";
        if (Objects.equals(rarityId, 4L)) return "浅红色";
        if (Objects.equals(rarityId, 5L)) return "粉红色";
        if (Objects.equals(rarityId, 6L)) return "浅紫色";
        if (Objects.equals(rarityId, 7L)) return "黄绿色";
        if (Objects.equals(rarityId, 8L)) return "黄色";
        if (Objects.equals(rarityId, 9L)) return "青色";
        if (Objects.equals(rarityId, 10L)) return "红色";
        if (Objects.equals(rarityId, 11L)) return "紫色";
        return "白色";
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

    public String buildListCacheKey(PageQuery pageQuery) {
        int page = pageQuery == null || pageQuery.getPage() < 1
            ? 1
            : pageQuery.getPage();
        int limit = pageQuery == null || pageQuery.getLimit() < 1
            ? 20
            : pageQuery.getLimit();
        String search = pageQuery == null ? "" : trimToEmpty(pageQuery.getSearch());
        String categoryId = pageQuery == null || pageQuery.getCategoryId() == null ? "" : String.valueOf(pageQuery.getCategoryId());
        String rarity = pageQuery == null ? "" : trimToEmpty(pageQuery.getRarity());
        String gamePeriodId = pageQuery == null || pageQuery.getGamePeriodId() == null ? "" : String.valueOf(pageQuery.getGamePeriodId());
        String sortBy = normalizeSortBy(pageQuery == null ? null : pageQuery.getSortBy());
        String sortDirection = normalizeSortDirection(pageQuery == null ? null : pageQuery.getSortDirection());

        return String.join("|",
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

    public String buildSuggestionsCacheKey(String keyword, int limit) {
        return String.join("|",
            trimToEmpty(keyword),
            String.valueOf(normalizeSuggestionLimit(limit))
        );
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

    private String trimToEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private int normalizeSuggestionLimit(int limit) {
        return Math.max(1, Math.min(limit, 10));
    }

    private String generateInternalName(String name) {
        String normalized = name == null ? "" : name.trim().toUpperCase(Locale.ROOT)
            .replaceAll("[^A-Z0-9]+", "_")
            .replaceAll("^_+|_+$", "");
        if (normalized.isBlank()) {
            normalized = "ITEM";
        }
        return normalized + "_" + System.currentTimeMillis();
    }

    private List<Long> parseCategoryIds(Long primaryCategoryId, String rawCategoryIds) {
        LinkedHashSet<Long> ids = new LinkedHashSet<>();
        if (primaryCategoryId != null) {
            ids.add(primaryCategoryId);
        }
        if (rawCategoryIds != null && !rawCategoryIds.isBlank()) {
            for (String value : rawCategoryIds.split(",")) {
                try {
                    long parsed = Long.parseLong(value.trim());
                    if (parsed > 0) {
                        ids.add(parsed);
                    }
                } catch (NumberFormatException ignored) {
                }
            }
        }
        return new ArrayList<>(ids);
    }

    private void syncItemCategoryRelations(Long itemId, ItemDTO itemDTO) {
        if (itemId == null || itemDTO == null || itemDTO.getCategoryId() == null) {
            return;
        }

        LinkedHashSet<Long> categoryIds = new LinkedHashSet<>();
        categoryIds.add(itemDTO.getCategoryId());
        if (itemDTO.getRelatedCategoryIds() != null) {
            itemDTO.getRelatedCategoryIds().stream()
                .filter(Objects::nonNull)
                .filter(id -> id > 0)
                .forEach(categoryIds::add);
        }

        Map<Long, CategoryDTO> categoryById = categoryManagementService.getCategoryMap();

        itemCategoryRelMapper.delete(new LambdaQueryWrapper<ItemCategoryRel>().eq(ItemCategoryRel::getItemId, itemId));

        int sortOrder = 1;
        for (Long categoryId : categoryIds) {
            if (!categoryById.containsKey(categoryId)) {
                continue;
            }
            ItemCategoryRel relation = new ItemCategoryRel();
            relation.setItemId(itemId);
            relation.setCategoryId(categoryId);
            relation.setIsPrimary(Objects.equals(categoryId, itemDTO.getCategoryId()));
            relation.setRelationType("manual_admin");
            relation.setSortOrder(sortOrder++);
            relation.setSourceProvider("admin");
            relation.setStatus(1);
            relation.setDeleted(0);
            itemCategoryRelMapper.insert(relation);
        }
    }
}

package com.terraria.skills.service.impl;

import com.terraria.skills.dto.CategoryDTO;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.CategoryManagementService;
import com.terraria.skills.service.CategoryNavigationService;
import com.terraria.skills.service.CategoryNavigationUnavailableException;
import com.terraria.skills.vo.CategoryNavigationChildVO;
import com.terraria.skills.vo.CategoryNavigationVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class CategoryNavigationServiceImpl implements CategoryNavigationService {

    private static final List<NavigationDefinition> DEFINITIONS = List.of(
        new NavigationDefinition("weapons", "weapon", List.of("WEAPON")),
        new NavigationDefinition("armor", "armor", List.of("ARMOR")),
        new NavigationDefinition("potions", "potion", List.of("CONSUMABLE_POTION")),
        new NavigationDefinition("materials", "material", List.of("MATERIAL")),
        new NavigationDefinition("furniture", "furniture", List.of("FURNITURE")),
        new NavigationDefinition("tools", "tool", List.of("TOOL"))
    );

    private static final Comparator<CategoryDTO> CATEGORY_ORDER = Comparator
        .comparing(CategoryDTO::getSort, Comparator.nullsLast(Integer::compareTo))
        .thenComparing(CategoryDTO::getId, Comparator.nullsLast(Long::compareTo));

    private final CategoryManagementService categoryManagementService;
    private final ItemMapper itemMapper;

    @Override
    public List<CategoryNavigationVO> getNavigation() {
        Map<Long, CategoryDTO> categoryById = categoryManagementService.getCategoryMap();
        Map<String, CategoryDTO> categoryByCode = indexCategoriesByCode(categoryById);
        validateConfiguredCodes(categoryByCode);

        return DEFINITIONS.stream()
            .map(definition -> buildEntry(definition, categoryById, categoryByCode))
            .toList();
    }

    private Map<String, CategoryDTO> indexCategoriesByCode(Map<Long, CategoryDTO> categoryById) {
        Map<String, CategoryDTO> categoryByCode = new LinkedHashMap<>();
        categoryById.values().stream()
            .filter(Objects::nonNull)
            .filter(category -> category.getCode() != null && !category.getCode().isBlank())
            .forEach(category -> categoryByCode.putIfAbsent(normalizeCode(category.getCode()), category));
        return categoryByCode;
    }

    private void validateConfiguredCodes(Map<String, CategoryDTO> categoryByCode) {
        List<String> missingCodes = DEFINITIONS.stream()
            .flatMap(definition -> definition.categoryCodes().stream())
            .filter(code -> !categoryByCode.containsKey(normalizeCode(code)))
            .distinct()
            .toList();

        if (!missingCodes.isEmpty()) {
            throw new CategoryNavigationUnavailableException(
                "Missing category codes: " + String.join(", ", missingCodes)
            );
        }
    }

    private CategoryNavigationVO buildEntry(
        NavigationDefinition definition,
        Map<Long, CategoryDTO> categoryById,
        Map<String, CategoryDTO> categoryByCode
    ) {
        List<CategoryDTO> roots = definition.categoryCodes().stream()
            .map(code -> categoryByCode.get(normalizeCode(code)))
            .toList();
        CategoryDTO primaryRoot = roots.get(0);
        Set<Long> rootIds = roots.stream()
            .map(CategoryDTO::getId)
            .filter(Objects::nonNull)
            .collect(LinkedHashSet::new, LinkedHashSet::add, LinkedHashSet::addAll);
        List<Long> categoryIds = resolveCategoryIds(roots);

        CategoryNavigationVO entry = new CategoryNavigationVO();
        entry.setSlug(definition.slug());
        entry.setFilterKey(definition.filterKey());
        entry.setName(primaryRoot.getName());
        entry.setDescription(primaryRoot.getDescription());
        entry.setIcon(primaryRoot.getIcon());
        entry.setCategoryPath("/categories/" + definition.slug());
        entry.setItemPath("/items?filter=" + definition.filterKey());
        entry.setCategoryCodes(definition.categoryCodes());
        entry.setCategoryIds(categoryIds);
        entry.setItemCount(itemMapper.countItemsWithSearch("", null, categoryIds, null, null));
        entry.setChildren(resolveImmediateChildren(categoryById, rootIds));
        return entry;
    }

    private List<Long> resolveCategoryIds(List<CategoryDTO> roots) {
        LinkedHashSet<Long> categoryIds = new LinkedHashSet<>();
        for (CategoryDTO root : roots) {
            if (root.getId() == null) {
                continue;
            }
            categoryIds.add(root.getId());
            categoryManagementService.getAllDescendants(root.getId()).stream()
                .map(CategoryDTO::getId)
                .filter(Objects::nonNull)
                .forEach(categoryIds::add);
        }
        return new ArrayList<>(categoryIds);
    }

    private List<CategoryNavigationChildVO> resolveImmediateChildren(
        Map<Long, CategoryDTO> categoryById,
        Set<Long> rootIds
    ) {
        return categoryById.values().stream()
            .filter(Objects::nonNull)
            .filter(category -> rootIds.contains(category.getParentId()))
            .sorted(CATEGORY_ORDER)
            .map(this::toChild)
            .toList();
    }

    private CategoryNavigationChildVO toChild(CategoryDTO category) {
        CategoryNavigationChildVO child = new CategoryNavigationChildVO();
        child.setId(category.getId());
        child.setCode(category.getCode());
        child.setName(category.getName());
        return child;
    }

    private String normalizeCode(String code) {
        return code.trim().toUpperCase(Locale.ROOT);
    }

    private record NavigationDefinition(String slug, String filterKey, List<String> categoryCodes) {
    }
}

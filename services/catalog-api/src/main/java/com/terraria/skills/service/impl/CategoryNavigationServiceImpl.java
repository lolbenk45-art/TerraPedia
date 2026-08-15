package com.terraria.skills.service.impl;

import com.terraria.skills.dto.CategoryDTO;
import com.terraria.skills.dto.CategoryItemCountDTO;
import com.terraria.skills.dto.CategoryNavigationChildAggregateDTO;
import com.terraria.skills.dto.CategoryNavigationParentScopeMembershipDTO;
import com.terraria.skills.dto.CategoryNavigationScopeMembershipDTO;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.CategoryManagementService;
import com.terraria.skills.service.CategoryNavigationService;
import com.terraria.skills.service.CategoryNavigationUnavailableException;
import com.terraria.skills.service.ManagedImageUrlPolicy;
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
    private final ManagedImageUrlPolicy managedImageUrlPolicy;

    @Override
    public List<CategoryNavigationVO> getNavigation() {
        Map<Long, CategoryDTO> categoryById = categoryManagementService.getCategoryMap();
        Map<String, CategoryDTO> categoryByCode = indexCategoriesByCode(categoryById);
        validateConfiguredCodes(categoryByCode);
        Map<NavigationDefinition, ParentScope> parentScopesByDefinition = new LinkedHashMap<>();
        Map<NavigationDefinition, List<ChildScope>> childScopesByDefinition = new LinkedHashMap<>();
        for (NavigationDefinition definition : DEFINITIONS) {
            List<CategoryDTO> roots = definition.categoryCodes().stream()
                .map(code -> categoryByCode.get(normalizeCode(code)))
                .toList();
            parentScopesByDefinition.put(
                definition,
                new ParentScope(roots.get(0), resolveCategoryIds(roots))
            );
            childScopesByDefinition.put(
                definition,
                resolveChildScopes(definition, categoryById, categoryByCode)
            );
        }
        Map<Long, Long> parentCounts = resolveParentCounts(parentScopesByDefinition);
        Map<Long, ChildAggregate> childAggregates = resolveChildAggregates(childScopesByDefinition);

        return DEFINITIONS.stream()
            .map(definition -> buildEntry(
                definition,
                parentScopesByDefinition.get(definition),
                childScopesByDefinition.getOrDefault(definition, List.of()),
                parentCounts,
                childAggregates
            ))
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
        ParentScope parentScope,
        List<ChildScope> childScopes,
        Map<Long, Long> parentCounts,
        Map<Long, ChildAggregate> childAggregates
    ) {
        CategoryDTO primaryRoot = parentScope.category();
        List<Long> categoryIds = parentScope.categoryIds();
        Long itemCount = parentCounts.get(primaryRoot.getId());
        if (itemCount == null) {
            throw new CategoryNavigationUnavailableException(
                "Missing parent navigation count: " + primaryRoot.getCode()
            );
        }

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
        entry.setItemCount(itemCount);
        entry.setChildren(childScopes.stream()
            .map(scope -> toChild(scope, childAggregates.get(scope.category().getId())))
            .toList());
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

    private Map<Long, Long> resolveParentCounts(
        Map<NavigationDefinition, ParentScope> parentScopesByDefinition
    ) {
        List<CategoryNavigationParentScopeMembershipDTO> memberships = parentScopesByDefinition.values().stream()
            .flatMap(scope -> scope.categoryIds().stream()
                .map(categoryId -> new CategoryNavigationParentScopeMembershipDTO(scope.category().getId(), categoryId)))
            .toList();
        List<CategoryItemCountDTO> rows = itemMapper.selectCategoryNavigationParentCounts(memberships);
        Map<Long, Long> parentCounts = new LinkedHashMap<>();
        for (CategoryItemCountDTO row : rows == null ? List.<CategoryItemCountDTO>of() : rows) {
            if (row == null || row.getCategoryId() == null || row.getCount() < 0
                || parentCounts.containsKey(row.getCategoryId())) {
                throw new CategoryNavigationUnavailableException("Malformed parent navigation count");
            }
            parentCounts.put(row.getCategoryId(), row.getCount());
        }
        Set<Long> expectedParentIds = parentScopesByDefinition.values().stream()
            .map(ParentScope::category)
            .map(CategoryDTO::getId)
            .collect(LinkedHashSet::new, LinkedHashSet::add, LinkedHashSet::addAll);
        if (!parentCounts.keySet().equals(expectedParentIds)) {
            throw new CategoryNavigationUnavailableException("Incomplete parent navigation counts");
        }
        return parentCounts;
    }

    private List<ChildScope> resolveChildScopes(
        NavigationDefinition definition,
        Map<Long, CategoryDTO> categoryById,
        Map<String, CategoryDTO> categoryByCode
    ) {
        Set<Long> rootIds = definition.categoryCodes().stream()
            .map(code -> categoryByCode.get(normalizeCode(code)))
            .map(CategoryDTO::getId)
            .filter(Objects::nonNull)
            .collect(LinkedHashSet::new, LinkedHashSet::add, LinkedHashSet::addAll);

        return categoryById.values().stream()
            .filter(Objects::nonNull)
            .filter(category -> rootIds.contains(category.getParentId()))
            .sorted(CATEGORY_ORDER)
            .map(category -> new ChildScope(category, resolveCategoryIds(List.of(category))))
            .toList();
    }

    private Map<Long, ChildAggregate> resolveChildAggregates(
        Map<NavigationDefinition, List<ChildScope>> childScopesByDefinition
    ) {
        List<ChildScope> childScopes = childScopesByDefinition.values().stream()
            .flatMap(List::stream)
            .toList();
        if (childScopes.isEmpty()) {
            return Map.of();
        }

        List<CategoryNavigationScopeMembershipDTO> scopeMemberships = childScopes.stream()
            .flatMap(scope -> scope.categoryIds().stream()
                .map(categoryId -> new CategoryNavigationScopeMembershipDTO(scope.category().getId(), categoryId)))
            .toList();
        List<CategoryNavigationChildAggregateDTO> rows = itemMapper.selectCategoryNavigationChildAggregates(
            scopeMemberships,
            managedImageReadPrefixes()
        );
        Map<Long, ChildAggregate> aggregates = new LinkedHashMap<>();
        for (CategoryNavigationChildAggregateDTO row : rows == null ? List.<CategoryNavigationChildAggregateDTO>of() : rows) {
            if (row == null || row.getChildId() == null || row.getItemCount() < 0 || aggregates.containsKey(row.getChildId())) {
                throw new CategoryNavigationUnavailableException("Malformed child navigation aggregate");
            }
            String image = normalizeManagedImage(row.getImage(), row.getChildId());
            aggregates.put(row.getChildId(), new ChildAggregate(row.getItemCount(), image));
        }
        for (ChildScope childScope : childScopes) {
            Long childId = childScope.category().getId();
            if (!aggregates.containsKey(childId)) {
                throw new CategoryNavigationUnavailableException(
                    "Missing child navigation aggregate: " + childScope.category().getCode()
                );
            }
        }
        if (aggregates.size() != childScopes.size()) {
            throw new CategoryNavigationUnavailableException("Unexpected child navigation aggregate");
        }
        return aggregates;
    }

    private CategoryNavigationChildVO toChild(ChildScope scope, ChildAggregate aggregate) {
        CategoryDTO category = scope.category();
        if (aggregate == null || category.getId() == null || category.getCode() == null || category.getCode().isBlank()
            || scope.categoryIds().isEmpty()) {
            throw new CategoryNavigationUnavailableException("Malformed child navigation scope");
        }
        CategoryNavigationChildVO child = new CategoryNavigationChildVO();
        child.setId(category.getId());
        child.setCode(category.getCode());
        child.setName(category.getName());
        child.setCategoryIds(scope.categoryIds());
        child.setItemPath("/items?category=" + category.getCode());
        child.setItemCount(aggregate.itemCount());
        child.setImage(aggregate.image());
        return child;
    }

    private List<String> managedImageReadPrefixes() {
        List<String> readPrefixes = managedImageUrlPolicy.trustedManagedImageReadUrlPrefixes();
        if (readPrefixes != null && !readPrefixes.isEmpty()) {
            return itemImagePrefixes(readPrefixes);
        }
        List<String> writePrefixes = managedImageUrlPolicy.trustedManagedImageUrlPrefixes();
        return writePrefixes == null ? List.of() : itemImagePrefixes(writePrefixes);
    }

    private List<String> itemImagePrefixes(List<String> prefixes) {
        return prefixes.stream()
            .filter(Objects::nonNull)
            .map(String::trim)
            .filter(prefix -> !prefix.isEmpty())
            .filter(prefix -> prefix.toLowerCase(Locale.ROOT).contains("/terrapedia-images/items/"))
            .distinct()
            .toList();
    }

    private String normalizeManagedImage(String image, Long childId) {
        if (image == null) {
            return null;
        }
        return managedImageUrlPolicy.normalizeManagedImagePathForDomain(image, "items")
            .orElseThrow(() -> new CategoryNavigationUnavailableException(
                "Invalid child navigation image for category " + childId
            ));
    }

    private String normalizeCode(String code) {
        return code.trim().toUpperCase(Locale.ROOT);
    }

    private record NavigationDefinition(String slug, String filterKey, List<String> categoryCodes) {
    }

    private record ChildScope(CategoryDTO category, List<Long> categoryIds) {
    }

    private record ParentScope(CategoryDTO category, List<Long> categoryIds) {
    }

    private record ChildAggregate(long itemCount, String image) {
    }
}

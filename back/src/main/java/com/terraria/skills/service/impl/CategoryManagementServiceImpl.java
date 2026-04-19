package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.terraria.skills.dto.CategoryDTO;
import com.terraria.skills.entity.Category;
import com.terraria.skills.mapper.CategoryMapper;
import com.terraria.skills.service.CategoryManagementService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class CategoryManagementServiceImpl implements CategoryManagementService {

    private static final Set<String> ITEM_ROOT_CATEGORY_CODES = Set.of(
        "WEAPON",
        "TOOL",
        "ARMOR",
        "CONSUMABLE",
        "MATERIAL",
        "FURNITURE",
        "AMMUNITION",
        "ACCESSORY",
        "VANITY",
        "DYE",
        "PET",
        "MOUNT",
        "CRITTER",
        "MISC"
    );

    private final CategoryMapper categoryMapper;
    private volatile CategorySnapshot categorySnapshot;

    @Override
    public List<CategoryDTO> getAllCategories() {
        return cloneCategoryList(getSnapshot().orderedCategories);
    }

    @Override
    public Map<Long, CategoryDTO> getCategoryMap() {
        Map<Long, CategoryDTO> result = new LinkedHashMap<>();
        getSnapshot().categoryById.forEach((id, category) -> result.put(id, cloneCategory(category)));
        return result;
    }

    @Override
    public Map<Long, String> getCategoryPathMap() {
        return getSnapshot().categoryPathById;
    }

    @Override
    public CategoryDTO getCategoryById(Long id) {
        return cloneCategory(getSnapshot().categoryById.get(id));
    }

    @Override
    public List<CategoryDTO> getCategoriesByParentId(Long parentId) {
        Long normalizedParentId = normalizeParentId(parentId);
        return cloneCategoryList(
            getSnapshot().orderedCategories.stream()
                .filter(category -> Objects.equals(normalizeParentId(category.getParentId()), normalizedParentId))
                .toList()
        );
    }

    @Override
    public List<CategoryDTO> buildCategoryTree() {
        return buildCategoryTreeFromIds(getSnapshot().rootCategoryIds, 1);
    }

    @Override
    public List<CategoryDTO> buildItemCategoryTree() {
        return buildCategoryTreeFromIds(getSnapshot().itemRootCategoryIds, 1);
    }

    @Override
    public List<CategoryDTO> searchCategories(String keyword) {
        if (keyword == null || keyword.trim().isEmpty()) {
            return getAllCategories();
        }

        String keywordLower = keyword.toLowerCase(Locale.ROOT);
        return cloneCategoryList(
            getSnapshot().orderedCategories.stream()
                .filter(cat -> cat.getName().toLowerCase(Locale.ROOT).contains(keywordLower)
                    || (cat.getCode() != null && cat.getCode().toLowerCase(Locale.ROOT).contains(keywordLower)))
                .toList()
        );
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public CategoryDTO createCategory(CategoryDTO categoryDTO) {
        if (categoryDTO.getParentId() != null && categoryDTO.getParentId() > 0) {
            Category parent = categoryMapper.selectById(categoryDTO.getParentId());
            if (parent == null) {
                throw new IllegalArgumentException("Parent category does not exist");
            }

            if (!validateHierarchy(null, categoryDTO.getParentId())) {
                throw new IllegalArgumentException("Invalid category hierarchy");
            }
        }

        Category category = new Category();
        BeanUtils.copyProperties(categoryDTO, category);
        if (category.getParentId() == null) {
            category.setParentId(0L);
        }
        if (category.getCode() == null || category.getCode().isBlank()) {
            category.setCode(generateCategoryCode(categoryDTO.getName()));
        }
        if (category.getTopType() == null) {
            category.setTopType("");
        }
        if (category.getSort() == null || category.getSort() < 1) {
            category.setSort(1);
        }
        category.setCreatedAt(LocalDateTime.now());
        category.setUpdatedAt(LocalDateTime.now());

        categoryMapper.insert(category);
        invalidateSnapshot();
        return convertToDTO(category);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public CategoryDTO updateCategory(Long id, CategoryDTO categoryDTO) {
        Category existing = categoryMapper.selectById(id);
        if (existing == null) {
            throw new IllegalArgumentException("Category does not exist");
        }

        if (categoryDTO.getName() != null) {
            existing.setName(categoryDTO.getName());
        }
        if (categoryDTO.getCode() != null) {
            existing.setCode(categoryDTO.getCode());
        } else if (existing.getCode() == null || existing.getCode().isBlank()) {
            existing.setCode(generateCategoryCode(existing.getName()));
        }
        if (categoryDTO.getSort() != null) {
            existing.setSort(Math.max(1, categoryDTO.getSort()));
        }
        if (categoryDTO.getParentId() != null || existing.getParentId() != null) {
            if (categoryDTO.getParentId() != null && categoryDTO.getParentId().equals(id)) {
                throw new IllegalArgumentException("Category cannot be its own parent");
            }
            if (categoryDTO.getParentId() != null && isDescendant(categoryDTO.getParentId(), id)) {
                throw new IllegalArgumentException("Circular hierarchy is not allowed");
            }
            existing.setParentId(categoryDTO.getParentId() == null ? 0L : categoryDTO.getParentId());
        }
        if (categoryDTO.getStatus() != null) {
            existing.setStatus(categoryDTO.getStatus());
        }
        if (categoryDTO.getTopType() != null) {
            existing.setTopType(categoryDTO.getTopType());
        } else if (existing.getTopType() == null) {
            existing.setTopType("");
        }

        existing.setUpdatedAt(LocalDateTime.now());
        categoryMapper.updateById(existing);
        invalidateSnapshot();
        return convertToDTO(existing);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public CategoryDTO updateCategoryParent(Long id, Long newParentId) {
        Category existing = categoryMapper.selectById(id);
        if (existing == null) {
            throw new IllegalArgumentException("Category does not exist");
        }

        if (newParentId != null && newParentId > 0) {
            Category newParent = categoryMapper.selectById(newParentId);
            if (newParent == null) {
                throw new IllegalArgumentException("Parent category does not exist");
            }
            if (newParentId.equals(id)) {
                throw new IllegalArgumentException("Category cannot be its own parent");
            }
            if (isDescendant(newParentId, id)) {
                throw new IllegalArgumentException("Circular hierarchy is not allowed");
            }
        }

        existing.setParentId(newParentId == null ? 0L : newParentId);
        existing.setUpdatedAt(LocalDateTime.now());
        categoryMapper.updateById(existing);
        invalidateSnapshot();
        return convertToDTO(existing);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public CategoryDTO updateCategorySort(Long id, Integer newSort) {
        Category existing = categoryMapper.selectById(id);
        if (existing == null) {
            throw new IllegalArgumentException("Category does not exist");
        }

        existing.setSort(Math.max(1, newSort == null ? 1 : newSort));
        existing.setUpdatedAt(LocalDateTime.now());
        categoryMapper.updateById(existing);
        invalidateSnapshot();
        return convertToDTO(existing);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteCategory(Long id) {
        Category category = categoryMapper.selectById(id);
        if (category == null) {
            throw new IllegalArgumentException("Category does not exist");
        }

        List<Category> children = categoryMapper.selectList(
            new LambdaQueryWrapper<Category>()
                .eq(Category::getParentId, id)
        );

        if (!children.isEmpty()) {
            throw new IllegalArgumentException("Category still has children");
        }

        categoryMapper.deleteById(id);
        invalidateSnapshot();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteCategoryWithChildren(Long id) {
        Category category = categoryMapper.selectById(id);
        if (category == null) {
            throw new IllegalArgumentException("Category does not exist");
        }

        deleteDescendants(id);
        categoryMapper.deleteById(id);
        invalidateSnapshot();
    }

    @Override
    public boolean validateHierarchy(Long id, Long parentId) {
        if (parentId == null || parentId == 0) {
            return true;
        }

        Category parent = categoryMapper.selectById(parentId);
        if (parent == null) {
            return false;
        }

        return id == null || !isDescendant(parentId, id);
    }

    @Override
    public List<CategoryDTO> getPathToRoot(Long id) {
        List<CategoryDTO> path = new ArrayList<>();

        CategoryDTO current = getSnapshot().categoryById.get(id);
        while (current != null) {
            path.add(cloneCategory(current));
            if (current.getParentId() == null || current.getParentId() == 0) {
                break;
            }
            current = getSnapshot().categoryById.get(current.getParentId());
        }

        Collections.reverse(path);
        return path;
    }

    @Override
    public List<CategoryDTO> getAllDescendants(Long id) {
        return cloneCategoryList(
            getSnapshot().descendantIdsByParent.getOrDefault(id, List.of()).stream()
                .map(getSnapshot().categoryById::get)
                .filter(Objects::nonNull)
                .toList()
        );
    }

    @Override
    public int countDescendants(Long id) {
        return getAllDescendants(id).size();
    }

    private List<CategoryDTO> buildCategoryTreeFromIds(List<Long> rootIds, int level) {
        return rootIds.stream()
            .map(getSnapshot().categoryById::get)
            .filter(Objects::nonNull)
            .map(category -> buildCategoryNode(category, level))
            .toList();
    }

    private CategoryDTO buildCategoryNode(CategoryDTO category, int level) {
        CategoryDTO dto = cloneCategory(category);
        dto.setLevel(level);
        dto.setChildren(
            getSnapshot().childrenByParent.getOrDefault(category.getId(), List.of()).stream()
                .map(getSnapshot().categoryById::get)
                .filter(Objects::nonNull)
                .map(child -> buildCategoryNode(child, level + 1))
                .toList()
        );
        return dto;
    }

    private String normalizeCategoryCode(String value) {
        if (value == null) {
            return "";
        }
        return value.trim().toUpperCase(Locale.ROOT);
    }

    private boolean isDescendant(Long potentialDescendantId, Long ancestorId) {
        CategoryDTO current = getSnapshot().categoryById.get(potentialDescendantId);
        while (current != null) {
            if (current.getParentId() != null && current.getParentId().equals(ancestorId)) {
                return true;
            }
            if (current.getParentId() == null || current.getParentId() == 0) {
                break;
            }
            current = getSnapshot().categoryById.get(current.getParentId());
        }
        return false;
    }

    private void deleteDescendants(Long parentId) {
        List<Category> children = categoryMapper.selectList(
            new LambdaQueryWrapper<Category>()
                .eq(Category::getParentId, parentId)
        );

        for (Category child : children) {
            deleteDescendants(child.getId());
            categoryMapper.deleteById(child.getId());
        }
    }

    private CategoryDTO convertToDTO(Category category) {
        CategoryDTO dto = new CategoryDTO();
        BeanUtils.copyProperties(category, dto);
        if (Long.valueOf(0L).equals(dto.getParentId())) {
            dto.setParentId(null);
        }
        dto.setLevel(category.getLevel() != null ? category.getLevel() : 0);
        return dto;
    }

    private String generateCategoryCode(String name) {
        String normalized = name == null ? "" : name.trim().toUpperCase(Locale.ROOT)
            .replaceAll("[^A-Z0-9]+", "_")
            .replaceAll("^_+|_+$", "");
        if (normalized.isBlank()) {
            normalized = "CATEGORY";
        }
        return normalized + "_" + System.currentTimeMillis();
    }

    private CategorySnapshot getSnapshot() {
        CategorySnapshot snapshot = categorySnapshot;
        if (snapshot != null) {
            return snapshot;
        }

        synchronized (this) {
            if (categorySnapshot == null) {
                categorySnapshot = buildSnapshot();
            }
            return categorySnapshot;
        }
    }

    private CategorySnapshot buildSnapshot() {
        List<CategoryDTO> categories = categoryMapper.selectAllCategories().stream()
            .map(this::convertToDTO)
            .sorted(Comparator
                .comparing(CategoryDTO::getSort, Comparator.nullsLast(Integer::compareTo))
                .thenComparing(CategoryDTO::getId, Comparator.nullsLast(Long::compareTo)))
            .toList();

        Map<Long, CategoryDTO> categoryById = new LinkedHashMap<>();
        Map<Long, List<Long>> childrenByParent = new LinkedHashMap<>();
        List<Long> rootIds = new ArrayList<>();
        List<Long> itemRootIds = new ArrayList<>();

        for (CategoryDTO category : categories) {
            if (category.getId() == null) {
                continue;
            }
            categoryById.put(category.getId(), cloneCategory(category));
            Long parentId = normalizeParentId(category.getParentId());
            if (parentId == null) {
                rootIds.add(category.getId());
                if (ITEM_ROOT_CATEGORY_CODES.contains(normalizeCategoryCode(category.getCode()))) {
                    itemRootIds.add(category.getId());
                }
            } else {
                childrenByParent.computeIfAbsent(parentId, ignored -> new ArrayList<>()).add(category.getId());
            }
        }

        Map<Long, String> categoryPathById = new LinkedHashMap<>();
        for (Long categoryId : categoryById.keySet()) {
            categoryPathById.put(categoryId, buildCategoryPath(categoryId, categoryById));
        }

        Map<Long, List<Long>> descendantIdsByParent = new LinkedHashMap<>();
        for (Long categoryId : categoryById.keySet()) {
            List<Long> descendants = new ArrayList<>();
            collectDescendantIds(categoryId, childrenByParent, descendants);
            descendantIdsByParent.put(categoryId, List.copyOf(descendants));
        }

        Map<Long, List<Long>> immutableChildrenByParent = childrenByParent.entrySet().stream()
            .collect(Collectors.toMap(
                Map.Entry::getKey,
                entry -> List.copyOf(entry.getValue()),
                (left, right) -> left,
                LinkedHashMap::new
            ));

        return new CategorySnapshot(
            List.copyOf(categories),
            Collections.unmodifiableMap(categoryById),
            Collections.unmodifiableMap(immutableChildrenByParent),
            Collections.unmodifiableMap(new LinkedHashMap<>(categoryPathById)),
            Collections.unmodifiableMap(new LinkedHashMap<>(descendantIdsByParent)),
            List.copyOf(rootIds),
            List.copyOf(itemRootIds)
        );
    }

    private void collectDescendantIds(Long parentId, Map<Long, List<Long>> childrenByParent, List<Long> descendants) {
        for (Long childId : childrenByParent.getOrDefault(parentId, List.of())) {
            descendants.add(childId);
            collectDescendantIds(childId, childrenByParent, descendants);
        }
    }

    private String buildCategoryPath(Long categoryId, Map<Long, CategoryDTO> categoryById) {
        List<String> names = new ArrayList<>();
        CategoryDTO current = categoryById.get(categoryId);
        while (current != null) {
            if (current.getName() != null && !current.getName().isBlank()) {
                names.add(current.getName());
            }
            if (current.getParentId() == null || current.getParentId() == 0) {
                break;
            }
            current = categoryById.get(current.getParentId());
        }
        Collections.reverse(names);
        return String.join(" / ", names);
    }

    private List<CategoryDTO> cloneCategoryList(List<CategoryDTO> categories) {
        return categories.stream()
            .map(this::cloneCategory)
            .toList();
    }

    private CategoryDTO cloneCategory(CategoryDTO category) {
        if (category == null) {
            return null;
        }
        CategoryDTO clone = new CategoryDTO();
        BeanUtils.copyProperties(category, clone);
        if (category.getChildren() != null && !category.getChildren().isEmpty()) {
            clone.setChildren(cloneCategoryList(category.getChildren()));
        } else {
            clone.setChildren(null);
        }
        return clone;
    }

    private Long normalizeParentId(Long parentId) {
        return parentId == null || parentId == 0 ? null : parentId;
    }

    private void invalidateSnapshot() {
        categorySnapshot = null;
    }

    private record CategorySnapshot(
        List<CategoryDTO> orderedCategories,
        Map<Long, CategoryDTO> categoryById,
        Map<Long, List<Long>> childrenByParent,
        Map<Long, String> categoryPathById,
        Map<Long, List<Long>> descendantIdsByParent,
        List<Long> rootCategoryIds,
        List<Long> itemRootCategoryIds
    ) {
    }
}

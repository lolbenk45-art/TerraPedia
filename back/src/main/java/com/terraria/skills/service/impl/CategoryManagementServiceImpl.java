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
import java.util.List;
import java.util.Locale;
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

    @Override
    public List<CategoryDTO> getAllCategories() {
        List<Category> categories = categoryMapper.selectAllCategories();
        return categories.stream()
            .map(this::convertToDTO)
            .collect(Collectors.toList());
    }

    @Override
    public CategoryDTO getCategoryById(Long id) {
        Category category = categoryMapper.selectById(id);
        if (category == null) {
            return null;
        }
        return convertToDTO(category);
    }

    @Override
    public List<CategoryDTO> getCategoriesByParentId(Long parentId) {
        List<Category> categories = categoryMapper.selectList(
            new LambdaQueryWrapper<Category>()
                .eq(parentId != null, Category::getParentId, parentId)
                .orderByAsc(Category::getSort, Category::getId)
        );

        return categories.stream()
            .map(this::convertToDTO)
            .collect(Collectors.toList());
    }

    @Override
    public List<CategoryDTO> buildCategoryTree() {
        List<Category> allCategories = categoryMapper.selectAllCategories();

        List<CategoryDTO> rootCategories = allCategories.stream()
            .filter(cat -> cat.getParentId() == null || cat.getParentId() == 0)
            .map(cat -> {
                CategoryDTO dto = convertToDTO(cat);
                dto.setLevel(1);
                return dto;
            })
            .collect(Collectors.toList());

        for (CategoryDTO root : rootCategories) {
            root.setChildren(buildChildren(allCategories, root.getId(), 1));
        }

        return rootCategories;
    }

    @Override
    public List<CategoryDTO> buildItemCategoryTree() {
        return buildCategoryTree().stream()
            .filter(category -> ITEM_ROOT_CATEGORY_CODES.contains(normalizeCategoryCode(category.getCode())))
            .collect(Collectors.toList());
    }

    @Override
    public List<CategoryDTO> searchCategories(String keyword) {
        if (keyword == null || keyword.trim().isEmpty()) {
            return getAllCategories();
        }

        String keywordLower = keyword.toLowerCase(Locale.ROOT);
        List<Category> allCategories = categoryMapper.selectAllCategories();

        return allCategories.stream()
            .filter(cat -> cat.getName().toLowerCase(Locale.ROOT).contains(keywordLower)
                || (cat.getCode() != null && cat.getCode().toLowerCase(Locale.ROOT).contains(keywordLower)))
            .map(this::convertToDTO)
            .collect(Collectors.toList());
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

        Category current = categoryMapper.selectById(id);
        while (current != null) {
            path.add(convertToDTO(current));
            if (current.getParentId() == null || current.getParentId() == 0) {
                break;
            }
            current = categoryMapper.selectById(current.getParentId());
        }

        Collections.reverse(path);
        return path;
    }

    @Override
    public List<CategoryDTO> getAllDescendants(Long id) {
        List<Category> allCategories = categoryMapper.selectAllCategories();
        return collectDescendants(id, allCategories).stream()
            .map(this::convertToDTO)
            .collect(Collectors.toList());
    }

    @Override
    public int countDescendants(Long id) {
        return getAllDescendants(id).size();
    }

    private List<CategoryDTO> buildChildren(List<Category> allCategories, Long parentId, int level) {
        return allCategories.stream()
            .filter(cat -> parentId.equals(cat.getParentId()))
            .map(cat -> {
                CategoryDTO dto = convertToDTO(cat);
                dto.setLevel(level);
                dto.setChildren(buildChildren(allCategories, cat.getId(), level + 1));
                return dto;
            })
            .sorted(Comparator.comparing(CategoryDTO::getSort))
            .collect(Collectors.toList());
    }

    private String normalizeCategoryCode(String value) {
        if (value == null) {
            return "";
        }
        return value.trim().toUpperCase(Locale.ROOT);
    }

    private boolean isDescendant(Long potentialDescendantId, Long ancestorId) {
        Category current = categoryMapper.selectById(potentialDescendantId);
        while (current != null) {
            if (current.getParentId() != null && current.getParentId().equals(ancestorId)) {
                return true;
            }
            if (current.getParentId() == null || current.getParentId() == 0) {
                break;
            }
            current = categoryMapper.selectById(current.getParentId());
        }
        return false;
    }

    private List<Category> collectDescendants(Long parentId, List<Category> allCategories) {
        List<Category> descendants = new ArrayList<>();

        for (Category category : allCategories) {
            if (parentId.equals(category.getParentId())) {
                descendants.add(category);
                descendants.addAll(collectDescendants(category.getId(), allCategories));
            }
        }

        return descendants;
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
}

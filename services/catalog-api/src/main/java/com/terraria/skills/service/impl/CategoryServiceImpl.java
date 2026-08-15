package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.terraria.skills.dto.CategoryDTO;
import com.terraria.skills.entity.Category;
import com.terraria.skills.mapper.CategoryMapper;
import com.terraria.skills.service.CategoryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class CategoryServiceImpl implements CategoryService {

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
        log.info("数据库查询到分类总数：{}", allCategories.size());

        List<CategoryDTO> rootCategories = allCategories.stream()
            .filter(cat -> cat.getParentId() == null || cat.getParentId() == 0)
            .map(cat -> {
                CategoryDTO dto = convertToDTO(cat);
                dto.setLevel(1);
                return dto;
            })
            .collect(Collectors.toList());

        log.info("根分类数量：{}", rootCategories.size());
        rootCategories.forEach(cat -> log.info("根分类：{} (id={})", cat.getName(), cat.getId()));

        for (CategoryDTO root : rootCategories) {
            List<CategoryDTO> children = buildChildren(allCategories, root.getId(), 1);
            root.setChildren(children);
            log.info("分类 {} 有 {} 个子分类", root.getName(), children.size());
        }

        return rootCategories;
    }

    private List<CategoryDTO> buildChildren(List<Category> allCategories, Long parentId, int level) {
        List<CategoryDTO> children = allCategories.stream()
            .filter(cat -> parentId.equals(cat.getParentId()))
            .map(cat -> {
                CategoryDTO dto = convertToDTO(cat);
                dto.setLevel(level + 1);
                List<CategoryDTO> subChildren = buildChildren(allCategories, cat.getId(), level + 1);
                dto.setChildren(subChildren);
                return dto;
            })
            .sorted(Comparator.comparing(CategoryDTO::getSort))
            .collect(Collectors.toList());
        
        if (!children.isEmpty()) {
            log.info("父分类 ID={} 有 {} 个子分类", parentId, children.size());
        }
        return children;
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

    @Override
    public CategoryDTO createCategory(CategoryDTO categoryDTO) {
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
        categoryMapper.insert(category);
        return convertToDTO(categoryMapper.selectById(category.getId()));
    }

    @Override
    public CategoryDTO updateCategory(Long id, CategoryDTO categoryDTO) {
        Category category = categoryMapper.selectById(id);
        if (category != null) {
            BeanUtils.copyProperties(categoryDTO, category, "id", "createdAt", "updatedAt", "children", "level");
            if (categoryDTO.getParentId() == null) {
                category.setParentId(0L);
            }
            if (category.getCode() == null || category.getCode().isBlank()) {
                category.setCode(generateCategoryCode(category.getName()));
            }
            if (category.getTopType() == null) {
                category.setTopType("");
            }
            if (category.getSort() == null || category.getSort() < 1) {
                category.setSort(1);
            }
            categoryMapper.updateById(category);
            return convertToDTO(categoryMapper.selectById(id));
        }
        return null;
    }

    @Override
    public void deleteCategory(Long id) {
        categoryMapper.deleteById(id);
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

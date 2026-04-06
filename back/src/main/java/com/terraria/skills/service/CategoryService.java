package com.terraria.skills.service;

import com.terraria.skills.dto.CategoryDTO;

import java.util.List;

public interface CategoryService {

    List<CategoryDTO> getAllCategories();

    CategoryDTO getCategoryById(Long id);

    List<CategoryDTO> getCategoriesByParentId(Long parentId);

    List<CategoryDTO> buildCategoryTree();

    CategoryDTO createCategory(CategoryDTO categoryDTO);

    CategoryDTO updateCategory(Long id, CategoryDTO categoryDTO);

    void deleteCategory(Long id);
}

package com.terraria.skills.service;

import com.terraria.skills.dto.CategoryDTO;

import java.util.List;
import java.util.Map;

public interface CategoryManagementService {

    // Query operations
    List<CategoryDTO> getAllCategories();

    Map<Long, CategoryDTO> getCategoryMap();

    Map<Long, String> getCategoryPathMap();
    
    CategoryDTO getCategoryById(Long id);
    
    List<CategoryDTO> getCategoriesByParentId(Long parentId);
    
    List<CategoryDTO> buildCategoryTree();

    List<CategoryDTO> buildItemCategoryTree();
    
    List<CategoryDTO> searchCategories(String keyword);
    
    // Create operations
    CategoryDTO createCategory(CategoryDTO categoryDTO);
    
    // Update operations
    CategoryDTO updateCategory(Long id, CategoryDTO categoryDTO);
    
    CategoryDTO updateCategoryParent(Long id, Long newParentId);
    
    CategoryDTO updateCategorySort(Long id, Integer newSort);
    
    // Delete operations
    void deleteCategory(Long id);
    
    void deleteCategoryWithChildren(Long id);
    
    // Hierarchy validation
    boolean validateHierarchy(Long id, Long parentId);
    
    List<CategoryDTO> getPathToRoot(Long id);
    
    List<CategoryDTO> getAllDescendants(Long id);
    
    int countDescendants(Long id);
}

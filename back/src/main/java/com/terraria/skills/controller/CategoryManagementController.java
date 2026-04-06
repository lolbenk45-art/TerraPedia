package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.CategoryDTO;
import com.terraria.skills.service.CategoryManagementService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Slf4j
@RestController
@RequestMapping("/admin/categories")
@RequiredArgsConstructor
public class CategoryManagementController {

    private final CategoryManagementService categoryManagementService;

    /**
     * Get all categories (flat list)
     */
    @GetMapping
    public ApiResponse<List<CategoryDTO>> getAllCategories() {
        log.info("获取所有分类列表");
        List<CategoryDTO> categories = categoryManagementService.getAllCategories();
        return ApiResponse.success(categories);
    }

    /**
     * Get category tree structure
     */
    @GetMapping("/tree")
    public ApiResponse<List<CategoryDTO>> getCategoryTree() {
        log.info("获取分类树结构");
        List<CategoryDTO> tree = categoryManagementService.buildCategoryTree();
        return ApiResponse.success(tree);
    }

    /**
     * Get category by ID
     */
    @GetMapping("/{id}")
    public ApiResponse<CategoryDTO> getCategoryById(@PathVariable Long id) {
        log.info("获取分类详情，id={}", id);
        CategoryDTO category = categoryManagementService.getCategoryById(id);
        if (category == null) {
            return ApiResponse.error(404, "分类不存在");
        }
        return ApiResponse.success(category);
    }

    /**
     * Get categories by parent ID
     */
    @GetMapping("/parent/{parentId}")
    public ApiResponse<List<CategoryDTO>> getCategoriesByParentId(@PathVariable Long parentId) {
        log.info("获取父分类 ID={} 的子分类", parentId);
        List<CategoryDTO> categories = categoryManagementService.getCategoriesByParentId(parentId);
        return ApiResponse.success(categories);
    }

    /**
     * Search categories by keyword
     */
    @GetMapping("/search")
    public ApiResponse<List<CategoryDTO>> searchCategories(@RequestParam String keyword) {
        log.info("搜索分类，keyword={}", keyword);
        List<CategoryDTO> categories = categoryManagementService.searchCategories(keyword);
        return ApiResponse.success(categories);
    }

    /**
     * Get path from category to root
     */
    @GetMapping("/{id}/path")
    public ApiResponse<List<CategoryDTO>> getCategoryPathToRoot(@PathVariable Long id) {
        log.info("获取分类路径，id={}", id);
        List<CategoryDTO> path = categoryManagementService.getPathToRoot(id);
        return ApiResponse.success(path);
    }

    /**
     * Get all descendants of a category
     */
    @GetMapping("/{id}/descendants")
    public ApiResponse<List<CategoryDTO>> getCategoryDescendants(@PathVariable Long id) {
        log.info("获取分类后代，id={}", id);
        List<CategoryDTO> descendants = categoryManagementService.getAllDescendants(id);
        return ApiResponse.success(descendants);
    }

    /**
     * Count descendants of a category
     */
    @GetMapping("/{id}/descendants/count")
    public ApiResponse<Integer> countCategoryDescendants(@PathVariable Long id) {
        log.info("统计分类后代数量，id={}", id);
        int count = categoryManagementService.countDescendants(id);
        return ApiResponse.success(count);
    }

    /**
     * Create a new category
     */
    @PostMapping
    public ApiResponse<CategoryDTO> createCategory(@RequestBody CategoryDTO categoryDTO) {
        log.info("创建分类，name={}, parentId={}", categoryDTO.getName(), categoryDTO.getParentId());
        try {
            CategoryDTO created = categoryManagementService.createCategory(categoryDTO);
            return ApiResponse.success(created, "分类创建成功");
        } catch (IllegalArgumentException e) {
            return ApiResponse.error(400, e.getMessage());
        }
    }

    /**
     * Update category information
     */
    @PutMapping("/{id}")
    public ApiResponse<CategoryDTO> updateCategory(
            @PathVariable Long id,
            @RequestBody CategoryDTO categoryDTO) {
        log.info("更新分类，id={}", id);
        try {
            CategoryDTO updated = categoryManagementService.updateCategory(id, categoryDTO);
            return ApiResponse.success(updated, "分类更新成功");
        } catch (IllegalArgumentException e) {
            return ApiResponse.error(400, e.getMessage());
        }
    }

    /**
     * Update category parent (move category)
     */
    @PutMapping("/{id}/parent")
    public ApiResponse<CategoryDTO> updateCategoryParent(
            @PathVariable Long id,
            @RequestParam Long newParentId) {
        log.info("更新分类父级，id={}, newParentId={}", id, newParentId);
        try {
            CategoryDTO updated = categoryManagementService.updateCategoryParent(id, newParentId);
            return ApiResponse.success(updated, "分类移动成功");
        } catch (IllegalArgumentException e) {
            return ApiResponse.error(400, e.getMessage());
        }
    }

    /**
     * Update category sort order
     */
    @PutMapping("/{id}/sort")
    public ApiResponse<CategoryDTO> updateCategorySort(
            @PathVariable Long id,
            @RequestParam Integer newSort) {
        log.info("更新分类排序，id={}, newSort={}", id, newSort);
        try {
            CategoryDTO updated = categoryManagementService.updateCategorySort(id, newSort);
            return ApiResponse.success(updated, "排序更新成功");
        } catch (IllegalArgumentException e) {
            return ApiResponse.error(400, e.getMessage());
        }
    }

    /**
     * Delete a category (soft delete, must have no children)
     */
    @DeleteMapping("/{id}")
    public ApiResponse<Void> deleteCategory(@PathVariable Long id) {
        log.info("删除分类，id={}", id);
        try {
            categoryManagementService.deleteCategory(id);
            return ApiResponse.success(null, "分类删除成功");
        } catch (IllegalArgumentException e) {
            return ApiResponse.error(400, e.getMessage());
        }
    }

    /**
     * Delete a category with all its descendants
     */
    @DeleteMapping("/{id}/with-children")
    public ApiResponse<Void> deleteCategoryWithChildren(@PathVariable Long id) {
        log.info("删除分类及其子分类，id={}", id);
        try {
            categoryManagementService.deleteCategoryWithChildren(id);
            return ApiResponse.success(null, "分类及子分类删除成功");
        } catch (IllegalArgumentException e) {
            return ApiResponse.error(400, e.getMessage());
        }
    }

    /**
     * Validate category hierarchy
     */
    @GetMapping("/{id}/validate")
    public ApiResponse<Boolean> validateCategoryHierarchy(
            @PathVariable Long id,
            @RequestParam(required = false) Long parentId) {
        log.info("验证分类层级，id={}, parentId={}", id, parentId);
        boolean valid = categoryManagementService.validateHierarchy(id, parentId);
        return ApiResponse.success(valid);
    }
}

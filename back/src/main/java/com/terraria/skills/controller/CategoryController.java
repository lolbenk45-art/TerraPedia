package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.CategoryDTO;
import com.terraria.skills.service.CategoryManagementService;
import com.terraria.skills.vo.CategoryVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@RestController
@RequestMapping("/categories")
@RequiredArgsConstructor
public class CategoryController {

    private final CategoryManagementService categoryManagementService;

    @GetMapping
    public ResponseEntity<ApiResponse<List<CategoryVO>>> getCategories() {
        List<CategoryDTO> dtoList = categoryManagementService.buildCategoryTree();
        log.info("Returning full category tree roots={}", dtoList.size());
        return ResponseEntity.ok(ApiResponse.success(convertTree(dtoList)));
    }

    @GetMapping("/items")
    public ResponseEntity<ApiResponse<List<CategoryVO>>> getItemCategories() {
        List<CategoryDTO> dtoList = categoryManagementService.buildItemCategoryTree();
        log.info("Returning item-only category tree roots={}", dtoList.size());
        return ResponseEntity.ok(ApiResponse.success(convertTree(dtoList)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<CategoryVO>> getCategoryById(@PathVariable Long id) {
        CategoryDTO dto = categoryManagementService.getCategoryById(id);
        if (dto == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error(404, "Category not found"));
        }

        CategoryVO vo = new CategoryVO();
        BeanUtils.copyProperties(dto, vo);
        return ResponseEntity.ok(ApiResponse.success(vo));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<CategoryVO>> createCategory(@RequestBody CategoryDTO categoryDTO) {
        try {
            CategoryDTO created = categoryManagementService.createCategory(categoryDTO);
            CategoryVO vo = new CategoryVO();
            BeanUtils.copyProperties(created, vo);
            return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(vo, "Category created"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(400, e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<CategoryVO>> updateCategory(@PathVariable Long id, @RequestBody CategoryDTO categoryDTO) {
        try {
            CategoryDTO updated = categoryManagementService.updateCategory(id, categoryDTO);
            if (updated == null) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.error(404, "Category not found"));
            }
            CategoryVO vo = new CategoryVO();
            BeanUtils.copyProperties(updated, vo);
            return ResponseEntity.ok(ApiResponse.success(vo, "Category updated"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(400, e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteCategory(@PathVariable Long id) {
        try {
            categoryManagementService.deleteCategory(id);
            return ResponseEntity.ok(ApiResponse.success(null, "Category deleted"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(400, e.getMessage()));
        }
    }

    private List<CategoryVO> convertChildren(List<CategoryDTO> children) {
        if (children == null) {
            return null;
        }
        return children.stream()
            .map(child -> {
                CategoryVO vo = new CategoryVO();
                BeanUtils.copyProperties(child, vo);
                vo.setChildren(convertChildren(child.getChildren()));
                return vo;
            })
            .collect(Collectors.toList());
    }

    private List<CategoryVO> convertTree(List<CategoryDTO> categories) {
        return categories.stream()
            .map(dto -> {
                CategoryVO vo = new CategoryVO();
                BeanUtils.copyProperties(dto, vo);
                vo.setChildren(convertChildren(dto.getChildren()));
                return vo;
            })
            .collect(Collectors.toList());
    }
}

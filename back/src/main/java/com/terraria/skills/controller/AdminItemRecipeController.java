package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.AdminRecipeUpsertRequestDTO;
import com.terraria.skills.dto.RecipeDTO;
import com.terraria.skills.dto.RecipeTreeResponseDTO;
import com.terraria.skills.service.RecipeService;
import com.terraria.skills.service.RecipeTreeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/admin/items")
@RequiredArgsConstructor
@Tag(name = "AdminItemRecipes", description = "Admin item recipe management")
@SecurityRequirement(name = "bearerAuth")
public class AdminItemRecipeController {

    private final RecipeService recipeService;
    private final RecipeTreeService recipeTreeService;

    @GetMapping("/{id}/recipes")
    @Operation(summary = "Get item recipes for admin")
    public ResponseEntity<ApiResponse<List<RecipeDTO>>> getItemRecipes(@PathVariable("id") Long itemId) {
        return ResponseEntity.ok(ApiResponse.success(recipeService.getRecipesByResultItemId(itemId)));
    }

    @GetMapping("/{id}/recipe-tree")
    @Operation(summary = "Get grouped recipe tree for admin")
    public ResponseEntity<ApiResponse<RecipeTreeResponseDTO>> getItemRecipeTree(
        @PathVariable("id") Long itemId,
        @RequestParam(defaultValue = "3") int maxDepth
    ) {
        return ResponseEntity.ok(ApiResponse.success(recipeTreeService.getRecipeTreeByItemId(itemId, maxDepth)));
    }

    @PutMapping("/{id}/recipes")
    @Operation(summary = "Replace item recipes")
    public ResponseEntity<ApiResponse<List<RecipeDTO>>> replaceItemRecipes(
        @PathVariable("id") Long itemId,
        @RequestParam(required = false) String scopeMode,
        @RequestBody(required = false) List<AdminRecipeUpsertRequestDTO> request
    ) {
        List<RecipeDTO> recipes = recipeService.replaceRecipesForResultItemId(itemId, request, scopeMode);
        recipeTreeService.invalidateCaches();
        return ResponseEntity.ok(ApiResponse.success(recipes, "Recipes updated"));
    }
}

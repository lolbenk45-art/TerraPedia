package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.RecipeDTO;
import com.terraria.skills.dto.RecipeTreeResponseDTO;
import com.terraria.skills.service.RecipeService;
import com.terraria.skills.service.RecipeTreeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/items")
@RequiredArgsConstructor
@Tag(name = "Item Recipes", description = "Read-only recipe query APIs")
public class ItemRecipeController {

    private final RecipeService recipeService;
    private final RecipeTreeService recipeTreeService;

    @GetMapping("/{id}/recipes")
    @Operation(summary = "Get recipes that produce the item")
    public ResponseEntity<ApiResponse<List<RecipeDTO>>> getItemRecipes(@PathVariable("id") Long itemId) {
        return ResponseEntity.ok(ApiResponse.success(recipeService.getRecipesByResultItemId(itemId)));
    }

    @GetMapping("/{id}/recipe-tree")
    @Operation(summary = "Get grouped recipe tree for public item detail")
    public ResponseEntity<ApiResponse<RecipeTreeResponseDTO>> getItemRecipeTree(
        @PathVariable("id") Long itemId,
        @RequestParam(defaultValue = "3") int maxDepth
    ) {
        return ResponseEntity.ok(ApiResponse.success(recipeTreeService.getRecipeTreeByItemId(itemId, maxDepth)));
    }
}

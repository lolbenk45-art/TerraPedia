package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.RecipeDTO;
import com.terraria.skills.dto.RecipeTreeResponseDTO;
import com.terraria.skills.service.PublicRecipeTreeFacade;
import com.terraria.skills.service.RecipeService;
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
@RequestMapping("/public/items")
@RequiredArgsConstructor
@Tag(name = "Public Item Recipes", description = "Public lightweight item recipe APIs")
public class PublicItemRecipeController {

    private final PublicRecipeTreeFacade publicRecipeTreeFacade;
    private final RecipeService recipeService;

    @GetMapping("/{id}/recipe-tree")
    @Operation(summary = "Get public grouped recipe tree for item detail")
    public ResponseEntity<ApiResponse<RecipeTreeResponseDTO>> getItemRecipeTree(
        @PathVariable("id") Long itemId,
        @RequestParam(defaultValue = "3") int maxDepth
    ) {
        RecipeTreeResponseDTO response = publicRecipeTreeFacade.getPublicRecipeTree(itemId, maxDepth);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/{id}/recipe-usages")
    @Operation(summary = "Get public recipes that use the item as an ingredient")
    public ResponseEntity<ApiResponse<List<RecipeDTO>>> getItemRecipeUsages(@PathVariable("id") Long itemId) {
        return ResponseEntity.ok(ApiResponse.success(recipeService.getRecipesByIngredientItemId(itemId)));
    }
}

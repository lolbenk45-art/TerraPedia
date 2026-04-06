package com.terraria.skills.service;

import com.terraria.skills.dto.AdminRecipeUpsertRequestDTO;
import com.terraria.skills.dto.RecipeDTO;

import java.util.List;

public interface RecipeService {

    List<RecipeDTO> getRecipesByResultItemId(Long itemId);

    List<RecipeDTO> replaceRecipesForResultItemId(Long itemId, List<AdminRecipeUpsertRequestDTO> recipes);

    List<RecipeDTO> replaceRecipesForResultItemId(Long itemId, List<AdminRecipeUpsertRequestDTO> recipes, String scopeMode);
}

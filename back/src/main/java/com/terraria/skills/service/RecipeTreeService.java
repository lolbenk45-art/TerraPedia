package com.terraria.skills.service;

import com.terraria.skills.dto.RecipeTreeResponseDTO;

public interface RecipeTreeService {

    RecipeTreeResponseDTO getRecipeTreeByItemId(Long itemId, int maxDepth);
}

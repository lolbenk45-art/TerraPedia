package com.terraria.skills.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.ItemDTO;
import com.terraria.skills.dto.RecipeDTO;
import com.terraria.skills.dto.RecipeIngredientDTO;
import com.terraria.skills.dto.RecipeTreeNodeDTO;
import com.terraria.skills.dto.RecipeTreeResponseDTO;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.ItemService;
import com.terraria.skills.service.RecipeService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RecipeTreeServiceImplTest {

    @Mock
    private ItemService itemService;

    @Mock
    private RecipeService recipeService;

    @Mock
    private ItemMapper itemMapper;

    @Test
    void shouldResolveRecipeGroupByChineseAliasAndExposeMembers() {
        RecipeTreeServiceImpl service = new RecipeTreeServiceImpl(
            itemService,
            recipeService,
            new ObjectMapper(),
            itemMapper
        );

        ItemDTO item = new ItemDTO();
        item.setId(5153L);
        item.setName("Balloon Candelabra");
        item.setNameZh("气球烛台");
        item.setInternalName("BalloonCandelabra");
        item.setImage("http://localhost:9000/terrapedia-images/items/example.png");

        RecipeIngredientDTO groupIngredient = new RecipeIngredientDTO();
        groupIngredient.setIngredientGroupType("group");
        groupIngredient.setIngredientNameRaw("任何气球");
        groupIngredient.setQuantityText("5");
        groupIngredient.setQuantityMin(5);
        groupIngredient.setQuantityMax(5);

        RecipeDTO recipe = new RecipeDTO();
        recipe.setId(1274L);
        recipe.setResultItemId(5153L);
        recipe.setResultItemName("Balloon Candelabra");
        recipe.setResultItemNameZh("气球烛台");
        recipe.setResultItemInternalName("BalloonCandelabra");
        recipe.setResultItemImage("http://localhost:9000/terrapedia-images/items/example.png");
        recipe.setResultQuantity(1);
        recipe.setIngredients(List.of(groupIngredient));

        when(itemService.getItemById(5153L)).thenReturn(item);
        when(recipeService.getRecipesByResultItemId(5153L)).thenReturn(List.of(recipe));
        when(itemMapper.selectList(any())).thenReturn(List.of());

        RecipeTreeResponseDTO response = service.getRecipeTreeByItemId(5153L, 4);

        RecipeTreeNodeDTO groupNode = response.getVariants().get(0).getRoots().get(0).getChildren().get(0);
        assertEquals("任意气球", groupNode.getDisplayName());
        assertEquals("Any Balloon", groupNode.getSecondaryName());
        assertEquals("Any Balloon", groupNode.getGroupCanonicalName());
        assertFalse(groupNode.getGroupMembers().isEmpty());
        assertNotNull(groupNode.getGroupMembers().get(0).getImage());
    }
}

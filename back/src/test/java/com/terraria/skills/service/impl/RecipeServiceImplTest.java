package com.terraria.skills.service.impl;

import com.terraria.skills.dto.RecipeDTO;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.Recipe;
import com.terraria.skills.mapper.BiomeMapper;
import com.terraria.skills.mapper.CraftingStationMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.mapper.RecipeContextRequirementMapper;
import com.terraria.skills.mapper.RecipeIngredientMapper;
import com.terraria.skills.mapper.RecipeMapper;
import com.terraria.skills.mapper.RecipeStationMapper;
import com.terraria.skills.mapper.WorldContextMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RecipeServiceImplTest {

    @Mock
    private RecipeMapper recipeMapper;

    @Mock
    private RecipeIngredientMapper recipeIngredientMapper;

    @Mock
    private RecipeStationMapper recipeStationMapper;

    @Mock
    private RecipeContextRequirementMapper recipeContextRequirementMapper;

    @Mock
    private CraftingStationMapper craftingStationMapper;

    @Mock
    private ItemMapper itemMapper;

    @Mock
    private BiomeMapper biomeMapper;

    @Mock
    private WorldContextMapper worldContextMapper;

    @InjectMocks
    private RecipeServiceImpl service;

    @BeforeEach
    void setUp() {
        when(recipeIngredientMapper.selectList(any())).thenReturn(Collections.emptyList());
        when(recipeStationMapper.selectList(any())).thenReturn(Collections.emptyList());
        when(recipeContextRequirementMapper.selectList(any())).thenReturn(Collections.emptyList());
        when(itemMapper.selectBatchIds(any())).thenReturn(List.of(resultItem()));
    }

    @Test
    void shouldPreferManualAdminRecipesOverAutomaticProviders() {
        when(recipeMapper.selectList(any())).thenReturn(List.of(
            recipe(11L, "manual_admin"),
            recipe(12L, "wiki_gg"),
            recipe(13L, "wiki_zh")
        ));

        List<RecipeDTO> recipes = service.getRecipesByResultItemId(1L);

        assertEquals(1, recipes.size());
        assertEquals("manual_admin", recipes.get(0).getSourceProvider());
    }

    @Test
    void shouldPreferWikiGgOverZhReferenceAndWikiZh() {
        when(recipeMapper.selectList(any())).thenReturn(List.of(
            recipe(21L, "wiki_gg_zh_reference"),
            recipe(22L, "wiki_zh"),
            recipe(23L, "wiki_gg")
        ));

        List<RecipeDTO> recipes = service.getRecipesByResultItemId(1L);

        assertEquals(1, recipes.size());
        assertEquals("wiki_gg", recipes.get(0).getSourceProvider());
    }

    @Test
    void shouldPreferZhReferenceOverWikiZhWhenWikiGgIsMissing() {
        when(recipeMapper.selectList(any())).thenReturn(List.of(
            recipe(31L, "wiki_gg_zh_reference"),
            recipe(32L, "wiki_zh")
        ));

        List<RecipeDTO> recipes = service.getRecipesByResultItemId(1L);

        assertEquals(1, recipes.size());
        assertEquals("wiki_gg_zh_reference", recipes.get(0).getSourceProvider());
    }

    @Test
    void shouldKeepAllVariantsWithinPreferredProviderCohort() {
        when(recipeMapper.selectList(any())).thenReturn(List.of(
            recipe(41L, "wiki_zh"),
            recipe(42L, "wiki_zh")
        ));

        List<RecipeDTO> recipes = service.getRecipesByResultItemId(1L);

        assertEquals(2, recipes.size());
        assertEquals(List.of("wiki_zh", "wiki_zh"), recipes.stream().map(RecipeDTO::getSourceProvider).toList());
    }

    private Recipe recipe(Long id, String sourceProvider) {
        Recipe recipe = new Recipe();
        recipe.setId(id);
        recipe.setResultItemId(1L);
        recipe.setResultInternalName("SeafoodDinner");
        recipe.setResultQuantity(1);
        recipe.setSortOrder(id.intValue());
        recipe.setStatus(1);
        recipe.setDeleted(0);
        recipe.setSourceProvider(sourceProvider);
        return recipe;
    }

    private Item resultItem() {
        Item item = new Item();
        item.setId(1L);
        item.setInternalName("SeafoodDinner");
        item.setName("Seafood Dinner");
        item.setNameZh("海鲜大餐");
        item.setImage("https://example.invalid/seafood-dinner.png");
        return item;
    }
}

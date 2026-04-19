package com.terraria.skills.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.ItemDTO;
import com.terraria.skills.dto.RecipeConditionDTO;
import com.terraria.skills.dto.RecipeDTO;
import com.terraria.skills.dto.RecipeIngredientDTO;
import com.terraria.skills.dto.RecipeStationDTO;
import com.terraria.skills.dto.RecipeTreeNodeDTO;
import com.terraria.skills.dto.RecipeTreeResponseDTO;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.ItemService;
import com.terraria.skills.service.RecipeService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
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

    @Test
    void shouldExposeRecipeConditionsAsIndependentTreeEntries() {
        RecipeTreeServiceImpl service = new RecipeTreeServiceImpl(
            itemService,
            recipeService,
            new ObjectMapper(),
            itemMapper
        );

        ItemDTO item = new ItemDTO();
        item.setId(100L);
        item.setName("Pumpkin Pie");
        item.setNameZh("南瓜派");
        item.setInternalName("PumpkinPie");

        RecipeIngredientDTO ingredient = new RecipeIngredientDTO();
        ingredient.setIngredientItemId(200L);
        ingredient.setIngredientNameRaw("Pumpkin");
        ingredient.setQuantityText("1");

        RecipeConditionDTO condition = new RecipeConditionDTO();
        condition.setRefType("WORLD_CONTEXT");
        condition.setRefId(11L);
        condition.setRefCode("FULL_MOON");
        condition.setRefNameEn("Full Moon");
        condition.setRefNameZh("满月");
        condition.setRequirementRole("required");
        condition.setNotes("夜间可制作");

        RecipeDTO recipe = new RecipeDTO();
        recipe.setId(901L);
        recipe.setResultItemId(100L);
        recipe.setResultItemName("Pumpkin Pie");
        recipe.setResultItemNameZh("南瓜派");
        recipe.setResultItemInternalName("PumpkinPie");
        recipe.setResultQuantity(1);
        recipe.setIngredients(List.of(ingredient));
        recipe.setConditions(List.of(condition));

        when(itemService.getItemById(100L)).thenReturn(item);
        when(recipeService.getRecipesByResultItemId(100L)).thenReturn(List.of(recipe));
        when(recipeService.getRecipesByResultItemId(200L)).thenReturn(List.of());
        when(itemMapper.selectList(any())).thenReturn(List.of());

        RecipeTreeResponseDTO response = service.getRecipeTreeByItemId(100L, 3);

        RecipeTreeNodeDTO root = response.getVariants().get(0).getRoots().get(0);
        assertEquals(1, root.getStations().size());
        assertEquals("condition", root.getStations().get(0).getStationType());
        assertEquals("满月", root.getStations().get(0).getStationNameZh());
        assertEquals("Full Moon", root.getStations().get(0).getStationName());
        assertEquals("required", root.getStations().get(0).getRequirementRole());
        assertEquals("夜间可制作", root.getStations().get(0).getNotes());
        assertTrue(root.getChildren().isEmpty() || root.getChildren().size() == 1);
    }

    @Test
    void shouldPreferEnvironmentStationTypeWhenStationRelationIsTaggedAsEnvironment() {
        ObjectMapper objectMapper = new ObjectMapper();
        RecipeTreeServiceImpl service = new RecipeTreeServiceImpl(
            itemService,
            recipeService,
            objectMapper,
            itemMapper
        );

        ItemDTO item = new ItemDTO();
        item.setId(250L);
        item.setName("Honey Dispenser");
        item.setNameZh("蜂蜜分配机");
        item.setInternalName("HoneyDispenser");

        RecipeIngredientDTO ingredient = new RecipeIngredientDTO();
        ingredient.setIngredientItemId(251L);
        ingredient.setIngredientNameRaw("Glass");
        ingredient.setQuantityText("1");

        RecipeStationDTO environmentStation = objectMapper.convertValue(Map.of(
            "stationId", 29L,
            "stationNameRaw", "蜂蜜",
            "itemName", "Honey",
            "itemNameZh", "蜂蜜",
            "stationType", "environment"
        ), RecipeStationDTO.class);

        RecipeDTO recipe = new RecipeDTO();
        recipe.setId(902L);
        recipe.setResultItemId(250L);
        recipe.setResultItemName("Honey Dispenser");
        recipe.setResultItemNameZh("蜂蜜分配机");
        recipe.setResultItemInternalName("HoneyDispenser");
        recipe.setResultQuantity(1);
        recipe.setIngredients(List.of(ingredient));
        recipe.setStations(List.of(environmentStation));

        when(itemService.getItemById(250L)).thenReturn(item);
        when(recipeService.getRecipesByResultItemId(250L)).thenReturn(List.of(recipe));
        when(recipeService.getRecipesByResultItemId(251L)).thenReturn(List.of());
        when(itemMapper.selectList(any())).thenReturn(List.of());

        RecipeTreeResponseDTO response = service.getRecipeTreeByItemId(250L, 3);

        RecipeTreeNodeDTO root = response.getVariants().get(0).getRoots().get(0);
        assertEquals(1, root.getStations().size());
        assertEquals("environment", root.getStations().get(0).getStationType());
        assertEquals("蜂蜜", root.getStations().get(0).getStationNameZh());
    }
}

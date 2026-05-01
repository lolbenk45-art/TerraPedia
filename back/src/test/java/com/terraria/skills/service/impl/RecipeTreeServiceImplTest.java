package com.terraria.skills.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.ItemDTO;
import com.terraria.skills.dto.RecipeConditionDTO;
import com.terraria.skills.dto.RecipeDTO;
import com.terraria.skills.dto.RecipeIngredientDTO;
import com.terraria.skills.dto.RecipeStationDTO;
import com.terraria.skills.dto.RecipeTreeNodeDTO;
import com.terraria.skills.dto.RecipeTreeResponseDTO;
import com.terraria.skills.entity.Item;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.ItemService;
import com.terraria.skills.service.RecipeService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.nio.file.Files;
import java.nio.file.Path;
import java.io.IOException;
import java.lang.reflect.Method;
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

    @TempDir
    Path tempDir;

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
        when(itemMapper.selectList(any())).thenReturn(List.of(
            itemEntity(3735L, "SillyBalloonGreen", "Silly Green Balloon", "呆萌绿气球", "https://terraria.wiki.gg/images/Silly_Green_Balloon.png"),
            itemEntity(3736L, "SillyBalloonPink", "Silly Pink Balloon", "呆萌粉气球", "https://terraria.wiki.gg/images/Silly_Pink_Balloon.png")
        ));

        RecipeTreeResponseDTO response = service.getRecipeTreeByItemId(5153L, 4);

        RecipeTreeNodeDTO groupNode = response.getVariants().get(0).getRoots().get(0).getChildren().get(0);
        assertEquals("任意气球", groupNode.getDisplayName());
        assertEquals("Any Balloon", groupNode.getSecondaryName());
        assertEquals("Any Balloon", groupNode.getGroupCanonicalName());
        assertFalse(groupNode.getGroupMembers().isEmpty());
        assertEquals("https://terraria.wiki.gg/images/Silly_Green_Balloon.png", groupNode.getGroupMembers().get(0).getImage());
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

    @Test
    void shouldExposeOnlyTwoRecipeGroupPreviewMembers() {
        RecipeTreeServiceImpl service = new RecipeTreeServiceImpl(
            itemService,
            recipeService,
            new ObjectMapper(),
            itemMapper
        );

        ItemDTO item = recipeTreeItem(4745L, "CoffinMinecart", "Coffin Minecart", "棺材矿车");
        RecipeIngredientDTO groupIngredient = groupIngredient("Any Wood", "10");
        RecipeDTO recipe = recipeWithIngredient(53667L, item, groupIngredient);

        when(itemService.getItemById(4745L)).thenReturn(item);
        when(recipeService.getRecipesByResultItemId(4745L)).thenReturn(List.of(recipe));
        when(itemMapper.selectList(any())).thenReturn(List.of(
            itemEntity(9L, "Wood", "Wood", "木材", "https://terraria.wiki.gg/images/Wood.png"),
            itemEntity(619L, "Ebonwood", "Ebonwood", "乌木", "https://terraria.wiki.gg/images/Ebonwood.png")
        ));

        RecipeTreeResponseDTO response = service.getRecipeTreeByItemId(4745L, 4);

        RecipeTreeNodeDTO groupNode = response.getVariants().get(0).getRoots().get(0).getChildren().get(0);
        assertEquals("Any Wood", groupNode.getGroupCanonicalName());
        assertEquals(2, groupNode.getGroupMembers().size());
        assertEquals("Wood", groupNode.getGroupMembers().get(0).getInternalName());
        assertEquals("Ebonwood", groupNode.getGroupMembers().get(1).getInternalName());
        assertTrue(groupNode.getGroupMemberNames().size() > groupNode.getGroupMembers().size());
    }

    @Test
    void shouldPreferResolvedWikiImageForRecipeGroupMembers() {
        RecipeTreeServiceImpl service = new RecipeTreeServiceImpl(
            itemService,
            recipeService,
            new ObjectMapper(),
            itemMapper
        );

        ItemDTO item = recipeTreeItem(4745L, "CoffinMinecart", "Coffin Minecart", "棺材矿车");
        RecipeIngredientDTO groupIngredient = groupIngredient("Any Iron Bar", "5");
        RecipeDTO recipe = recipeWithIngredient(53668L, item, groupIngredient);

        when(itemService.getItemById(4745L)).thenReturn(item);
        when(recipeService.getRecipesByResultItemId(4745L)).thenReturn(List.of(recipe));
        when(itemMapper.selectList(any())).thenReturn(List.of(
            itemEntity(22L, "IronBar", "Iron Bar", "铁锭", "https://terraria.wiki.gg/images/Iron_Bar.png"),
            itemEntity(704L, "LeadBar", "Lead Bar", "铅锭", "https://terraria.wiki.gg/images/Lead_Bar.png")
        ));

        RecipeTreeResponseDTO response = service.getRecipeTreeByItemId(4745L, 4);

        RecipeTreeNodeDTO groupNode = response.getVariants().get(0).getRoots().get(0).getChildren().get(0);
        assertEquals(2, groupNode.getGroupMembers().size());
        assertEquals(22L, groupNode.getGroupMembers().get(0).getItemId());
        assertEquals("https://terraria.wiki.gg/images/Iron_Bar.png", groupNode.getGroupMembers().get(0).getImage());
        assertEquals("https://terraria.wiki.gg/images/Lead_Bar.png", groupNode.getGroupMembers().get(1).getImage());
    }

    @Test
    void shouldResolveRecipeGroupFromCentralItemGroupOverride() throws IOException {
        String originalUserDir = System.getProperty("user.dir");
        Path repoRoot = tempDir.resolve("repo");
        Files.createDirectories(repoRoot.resolve("back"));
        Files.createDirectories(repoRoot.resolve("data/generated"));
        Files.writeString(repoRoot.resolve("data/generated/item-group-overrides.json"), """
            {
              "schemaVersion": "1.0.0",
              "groups": [
                {
                  "canonicalName": "Any Pylon",
                  "displayNameEn": "Any Pylon",
                  "aliases": ["Any Teleportation Pylon"],
                  "displayNameZh": "任意晶塔",
                  "domains": ["recipe", "npc_shop"],
                  "sourceProvider": "wiki_gg",
                  "sourcePage": "https://terraria.wiki.gg/wiki/Pylons",
                  "members": [
                    {
                      "internalName": "TeleportationPylonPurity",
                      "name": "Forest Pylon",
                      "nameZh": "森林晶塔"
                    }
                  ]
                }
              ]
            }
            """);
        try {
            System.setProperty("user.dir", repoRoot.resolve("back").toString());
            RecipeTreeServiceImpl service = new RecipeTreeServiceImpl(
                itemService,
                recipeService,
                new ObjectMapper(),
                itemMapper
            );

            ItemDTO item = recipeTreeItem(9001L, "PylonTestItem", "Pylon Test Item", "晶塔测试物品");
            RecipeIngredientDTO groupIngredient = groupIngredient("Any Teleportation Pylon", "1");
            RecipeDTO recipe = recipeWithIngredient(9002L, item, groupIngredient);

            when(itemService.getItemById(9001L)).thenReturn(item);
            when(recipeService.getRecipesByResultItemId(9001L)).thenReturn(List.of(recipe));
            when(itemMapper.selectList(any())).thenReturn(List.of(
                itemEntity(4875L, "TeleportationPylonPurity", "Forest Pylon", "森林晶塔", "https://terraria.wiki.gg/images/Forest_Pylon.png")
            ));

            RecipeTreeResponseDTO response = service.getRecipeTreeByItemId(9001L, 4);

            RecipeTreeNodeDTO groupNode = response.getVariants().get(0).getRoots().get(0).getChildren().get(0);
            assertEquals("任意晶塔", groupNode.getDisplayName());
            assertEquals("Any Pylon", groupNode.getSecondaryName());
            assertEquals("Any Pylon", groupNode.getGroupCanonicalName());
            assertEquals(1, groupNode.getGroupMembers().size());
            assertEquals("TeleportationPylonPurity", groupNode.getGroupMembers().get(0).getInternalName());
        } finally {
            if (originalUserDir == null) {
                System.clearProperty("user.dir");
            } else {
                System.setProperty("user.dir", originalUserDir);
            }
        }
    }

    @Test
    void shouldNotLetCentralItemGroupAliasShadowRecipeReferenceGroup() throws IOException {
        String originalUserDir = System.getProperty("user.dir");
        Path repoRoot = tempDir.resolve("repo-shadow");
        Files.createDirectories(repoRoot.resolve("back"));
        Files.createDirectories(repoRoot.resolve("data/generated"));
        Files.writeString(repoRoot.resolve("data/generated/recipe-material-reference.json"), """
            {
              "groups": [
                {
                  "canonicalName": "Any Wood",
                  "displayNameEn": "Any Wood",
                  "members": [
                    { "internalName": "Wood", "name": "Wood" },
                    { "internalName": "Ebonwood", "name": "Ebonwood" }
                  ]
                }
              ]
            }
            """);
        Files.writeString(repoRoot.resolve("data/generated/item-group-overrides.json"), """
            {
              "groups": [
                {
                  "canonicalName": "Any Timber",
                  "displayNameEn": "Any Timber",
                  "aliases": ["Any Wood"],
                  "domains": ["recipe"],
                  "members": [
                    { "internalName": "StoneBlock", "name": "Stone Block" }
                  ]
                }
              ]
            }
            """);
        try {
            System.setProperty("user.dir", repoRoot.resolve("back").toString());
            RecipeTreeServiceImpl service = new RecipeTreeServiceImpl(
                itemService,
                recipeService,
                new ObjectMapper(),
                itemMapper
            );

            ItemDTO item = recipeTreeItem(4745L, "CoffinMinecart", "Coffin Minecart", "Coffin Minecart");
            RecipeIngredientDTO groupIngredient = groupIngredient("Any Wood", "10");
            RecipeDTO recipe = recipeWithIngredient(53669L, item, groupIngredient);

            when(itemService.getItemById(4745L)).thenReturn(item);
            when(recipeService.getRecipesByResultItemId(4745L)).thenReturn(List.of(recipe));
            when(itemMapper.selectList(any())).thenReturn(List.of(
                itemEntity(9L, "Wood", "Wood", "Wood", "https://terraria.wiki.gg/images/Wood.png"),
                itemEntity(619L, "Ebonwood", "Ebonwood", "Ebonwood", "https://terraria.wiki.gg/images/Ebonwood.png"),
                itemEntity(3L, "StoneBlock", "Stone Block", "Stone Block", "https://terraria.wiki.gg/images/Stone_Block.png")
            ));

            RecipeTreeResponseDTO response = service.getRecipeTreeByItemId(4745L, 4);

            RecipeTreeNodeDTO groupNode = response.getVariants().get(0).getRoots().get(0).getChildren().get(0);
            assertEquals("Any Wood", groupNode.getGroupCanonicalName());
            assertEquals(2, groupNode.getGroupMembers().size());
            assertEquals("Wood", groupNode.getGroupMembers().get(0).getInternalName());
            assertEquals("Ebonwood", groupNode.getGroupMembers().get(1).getInternalName());
        } finally {
            if (originalUserDir == null) {
                System.clearProperty("user.dir");
            } else {
                System.setProperty("user.dir", originalUserDir);
            }
        }
    }

    @Test
    void shouldNotRejectDemonRecipeMemberImagesAsDemoImages() throws Exception {
        RecipeTreeServiceImpl service = new RecipeTreeServiceImpl(
            itemService,
            recipeService,
            new ObjectMapper(),
            itemMapper
        );
        Method method = RecipeTreeServiceImpl.class.getDeclaredMethod("acceptableWikiItemIconUrl", String.class);
        method.setAccessible(true);

        assertEquals(Boolean.TRUE, method.invoke(service, "https://terraria.wiki.gg/images/Living_Demon_Fire_Block.png"));
        assertEquals(Boolean.FALSE, method.invoke(service, "https://terraria.wiki.gg/images/Work_Bench_demo.png"));
    }

    private ItemDTO recipeTreeItem(Long id, String internalName, String name, String nameZh) {
        ItemDTO item = new ItemDTO();
        item.setId(id);
        item.setInternalName(internalName);
        item.setName(name);
        item.setNameZh(nameZh);
        return item;
    }

    private RecipeIngredientDTO groupIngredient(String rawName, String quantityText) {
        RecipeIngredientDTO ingredient = new RecipeIngredientDTO();
        ingredient.setIngredientGroupType("group");
        ingredient.setIngredientNameRaw(rawName);
        ingredient.setQuantityText(quantityText);
        return ingredient;
    }

    private RecipeDTO recipeWithIngredient(Long recipeId, ItemDTO resultItem, RecipeIngredientDTO ingredient) {
        RecipeDTO recipe = new RecipeDTO();
        recipe.setId(recipeId);
        recipe.setResultItemId(resultItem.getId());
        recipe.setResultItemName(resultItem.getName());
        recipe.setResultItemNameZh(resultItem.getNameZh());
        recipe.setResultItemInternalName(resultItem.getInternalName());
        recipe.setResultQuantity(1);
        recipe.setIngredients(List.of(ingredient));
        return recipe;
    }

    private Item itemEntity(Long id, String internalName, String name, String nameZh, String image) {
        Item item = new Item();
        item.setId(id);
        item.setInternalName(internalName);
        item.setName(name);
        item.setNameZh(nameZh);
        item.setImage(image);
        item.setDeleted(0);
        item.setStatus(1);
        return item;
    }
}

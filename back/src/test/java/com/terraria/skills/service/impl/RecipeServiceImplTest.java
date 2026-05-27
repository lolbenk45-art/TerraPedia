package com.terraria.skills.service.impl;

import com.terraria.skills.dto.RecipeDTO;
import com.terraria.skills.dto.RecipeStationDTO;
import com.terraria.skills.dto.AdminRecipeIngredientUpsertRequestDTO;
import com.terraria.skills.dto.AdminRecipeStationUpsertRequestDTO;
import com.terraria.skills.dto.AdminRecipeUpsertRequestDTO;
import com.terraria.skills.entity.ConditionTerm;
import com.terraria.skills.entity.CraftingStation;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.Recipe;
import com.terraria.skills.entity.RecipeContextRequirement;
import com.terraria.skills.entity.RecipeIngredient;
import com.terraria.skills.entity.RecipeStation;
import com.terraria.skills.mapper.BiomeMapper;
import com.terraria.skills.mapper.ConditionTermMapper;
import com.terraria.skills.mapper.CraftingStationMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.mapper.RecipeContextRequirementMapper;
import com.terraria.skills.mapper.RecipeIngredientMapper;
import com.terraria.skills.mapper.RecipeMapper;
import com.terraria.skills.mapper.RecipeStationMapper;
import com.terraria.skills.mapper.WorldContextMapper;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import com.terraria.skills.service.ManagedItemImageResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.Mockito.lenient;
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

    @Mock
    private ConditionTermMapper conditionTermMapper;

    @Mock
    private ManagedItemImageResolver managedItemImageResolver;

    @Mock
    private ManagedImageUrlPolicy managedImageUrlPolicy;

    @InjectMocks
    private RecipeServiceImpl service;

    @BeforeEach
    void setUp() {
        lenient().when(recipeIngredientMapper.selectList(any())).thenReturn(Collections.emptyList());
        lenient().when(recipeStationMapper.selectList(any())).thenReturn(Collections.emptyList());
        lenient().when(recipeContextRequirementMapper.selectList(any())).thenReturn(Collections.emptyList());
        lenient().when(itemMapper.selectBatchIds(any())).thenReturn(List.of(resultItem()));
        lenient().when(managedItemImageResolver.resolveManagedImages(any())).thenReturn(Map.of());
        lenient().when(managedItemImageResolver.resolveManagedImage(any(), anyMap())).thenReturn(null);
        lenient().when(managedImageUrlPolicy.isManagedImageUrl(any())).thenAnswer(invocation -> {
            String value = invocation.getArgument(0);
            return value != null && value.startsWith("http://localhost:9000/terrapedia-images/");
        });
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
        RecipeIngredient leftIngredient = new RecipeIngredient();
        leftIngredient.setRecipeId(41L);
        leftIngredient.setIngredientItemId(150L);
        leftIngredient.setIngredientInternalName("Cobweb");
        leftIngredient.setIngredientNameRaw("蛛网");
        leftIngredient.setIngredientGroupType("item");
        leftIngredient.setSortOrder(1);

        RecipeIngredient rightIngredient = new RecipeIngredient();
        rightIngredient.setRecipeId(42L);
        rightIngredient.setIngredientItemId(9L);
        rightIngredient.setIngredientInternalName("Wood");
        rightIngredient.setIngredientNameRaw("木材");
        rightIngredient.setIngredientGroupType("item");
        rightIngredient.setSortOrder(1);
        when(recipeIngredientMapper.selectList(any())).thenReturn(List.of(leftIngredient, rightIngredient));

        List<RecipeDTO> recipes = service.getRecipesByResultItemId(1L);

        assertEquals(2, recipes.size());
        assertEquals(List.of("wiki_zh", "wiki_zh"), recipes.stream().map(RecipeDTO::getSourceProvider).toList());
    }

    @Test
    void shouldKeepComplementaryRecipesFromDifferentProviders() {
        Recipe wikiGgRecipe = recipe(45L, "wiki_gg");
        Recipe wikiZhRecipe = recipe(46L, "wiki_zh");
        when(recipeMapper.selectList(any())).thenReturn(List.of(wikiGgRecipe, wikiZhRecipe));

        RecipeIngredient wikiGgIngredient = new RecipeIngredient();
        wikiGgIngredient.setRecipeId(45L);
        wikiGgIngredient.setIngredientItemId(150L);
        wikiGgIngredient.setIngredientInternalName("Cobweb");
        wikiGgIngredient.setIngredientNameRaw("蛛网");
        wikiGgIngredient.setIngredientGroupType("item");
        wikiGgIngredient.setSortOrder(1);

        RecipeIngredient wikiZhIngredient = new RecipeIngredient();
        wikiZhIngredient.setRecipeId(46L);
        wikiZhIngredient.setIngredientItemId(9L);
        wikiZhIngredient.setIngredientInternalName("Wood");
        wikiZhIngredient.setIngredientNameRaw("木材");
        wikiZhIngredient.setIngredientGroupType("item");
        wikiZhIngredient.setSortOrder(1);
        when(recipeIngredientMapper.selectList(any())).thenReturn(List.of(wikiGgIngredient, wikiZhIngredient));

        when(itemMapper.selectBatchIds(any())).thenReturn(List.of(
            resultItem(),
            item(150L, "Cobweb", "Cobweb", "蛛网", null),
            item(9L, "Wood", "Wood", "木材", null)
        ));

        List<RecipeDTO> recipes = service.getRecipesByResultItemId(1L);

        assertEquals(2, recipes.size());
        assertEquals(List.of("wiki_gg", "wiki_zh"), recipes.stream().map(RecipeDTO::getSourceProvider).toList());
        assertEquals(List.of("蛛网", "木材"), recipes.stream()
            .map(recipe -> recipe.getIngredients().get(0).getItemNameZh())
            .toList());
    }

    @Test
    void shouldCollapseEquivalentRecipesAcrossProviderAliasesAndQuantityDefaults() {
        Recipe legacyProviderRecipe = recipe(47L, "terraria.wiki.gg");
        legacyProviderRecipe.setVersionScope("Desktop version Console version Mobile version only");
        Recipe canonicalProviderRecipe = recipe(48L, "wiki_gg");
        canonicalProviderRecipe.setVersionScope("电脑版 主机版 移动版 only");
        when(recipeMapper.selectList(any())).thenReturn(List.of(legacyProviderRecipe, canonicalProviderRecipe));

        RecipeIngredient legacyIngredient = new RecipeIngredient();
        legacyIngredient.setRecipeId(47L);
        legacyIngredient.setIngredientItemId(273L);
        legacyIngredient.setIngredientInternalName("NightsEdge");
        legacyIngredient.setIngredientNameRaw("永夜刃");
        legacyIngredient.setIngredientGroupType("item");
        legacyIngredient.setQuantityMin(0);
        legacyIngredient.setQuantityMax(0);
        legacyIngredient.setSortOrder(1);

        RecipeIngredient canonicalIngredient = new RecipeIngredient();
        canonicalIngredient.setRecipeId(48L);
        canonicalIngredient.setIngredientItemId(273L);
        canonicalIngredient.setIngredientInternalName("NightsEdge");
        canonicalIngredient.setIngredientNameRaw("永夜刃");
        canonicalIngredient.setIngredientGroupType("item");
        canonicalIngredient.setSortOrder(1);
        when(recipeIngredientMapper.selectList(any())).thenReturn(List.of(legacyIngredient, canonicalIngredient));

        RecipeStation legacyStation = new RecipeStation();
        legacyStation.setRecipeId(47L);
        legacyStation.setStationId(17L);
        legacyStation.setStationItemId(525L);
        legacyStation.setStationInternalName("MythrilAnvil");
        legacyStation.setStationNameRaw("秘银砧");

        RecipeStation canonicalStation = new RecipeStation();
        canonicalStation.setRecipeId(48L);
        canonicalStation.setStationItemId(525L);
        canonicalStation.setStationInternalName("MythrilAnvil");
        canonicalStation.setStationNameRaw("秘银砧");
        when(recipeStationMapper.selectList(any())).thenReturn(List.of(legacyStation, canonicalStation));

        when(itemMapper.selectBatchIds(any())).thenReturn(List.of(
            resultItem(),
            item(273L, "NightsEdge", "Night's Edge", "永夜刃", null),
            item(525L, "MythrilAnvil", "Mythril Anvil", "秘银砧", null)
        ));

        List<RecipeDTO> recipes = service.getRecipesByResultItemId(1L);

        assertEquals(1, recipes.size());
        assertEquals("terraria.wiki.gg", recipes.get(0).getSourceProvider());
    }

    @Test
    void shouldCollapseEquivalentRecipesWhenCanonicalIdsHaveDifferentRawNames() {
        Recipe englishRawRecipe = recipe(86L, "wiki_gg");
        Recipe chineseRawRecipe = recipe(87L, "wiki_zh");
        chineseRawRecipe.setVersionScope("电脑版 主机版 移动版 only");
        when(recipeMapper.selectList(any())).thenReturn(List.of(englishRawRecipe, chineseRawRecipe));

        RecipeIngredient englishIngredient = new RecipeIngredient();
        englishIngredient.setRecipeId(86L);
        englishIngredient.setIngredientItemId(9L);
        englishIngredient.setIngredientInternalName("Wood");
        englishIngredient.setIngredientNameRaw("Wood");
        englishIngredient.setIngredientGroupType("item");
        englishIngredient.setSortOrder(1);

        RecipeIngredient chineseIngredient = new RecipeIngredient();
        chineseIngredient.setRecipeId(87L);
        chineseIngredient.setIngredientItemId(9L);
        chineseIngredient.setIngredientInternalName("Wood");
        chineseIngredient.setIngredientNameRaw("木材");
        chineseIngredient.setIngredientGroupType("item");
        chineseIngredient.setSortOrder(1);
        when(recipeIngredientMapper.selectList(any())).thenReturn(List.of(englishIngredient, chineseIngredient));

        RecipeStation englishStation = new RecipeStation();
        englishStation.setRecipeId(86L);
        englishStation.setStationItemId(75L);
        englishStation.setStationInternalName("WorkBench");
        englishStation.setStationNameRaw("Work Bench");

        RecipeStation chineseStation = new RecipeStation();
        chineseStation.setRecipeId(87L);
        chineseStation.setStationItemId(75L);
        chineseStation.setStationInternalName("WorkBench");
        chineseStation.setStationNameRaw("工作台");
        when(recipeStationMapper.selectList(any())).thenReturn(List.of(englishStation, chineseStation));

        when(itemMapper.selectBatchIds(any())).thenReturn(List.of(
            resultItem(),
            item(9L, "Wood", "Wood", "木材", null),
            item(75L, "WorkBench", "Work Bench", "工作台", null)
        ));

        List<RecipeDTO> recipes = service.getRecipesByResultItemId(1L);

        assertEquals(1, recipes.size());
        assertEquals("wiki_zh", recipes.get(0).getSourceProvider());
    }

    @Test
    void shouldCollapseEquivalentAnyMaterialGroupQuantityDefaults() {
        Recipe missingQuantityRecipe = recipe(88L, "wiki_gg");
        Recipe zeroQuantityRecipe = recipe(89L, "wiki_zh");
        zeroQuantityRecipe.setVersionScope("电脑版 主机版 移动版 only");
        when(recipeMapper.selectList(any())).thenReturn(List.of(missingQuantityRecipe, zeroQuantityRecipe));

        RecipeIngredient missingQuantityGroup = new RecipeIngredient();
        missingQuantityGroup.setRecipeId(88L);
        missingQuantityGroup.setIngredientNameRaw("任意木材");
        missingQuantityGroup.setIngredientGroupType("group");
        missingQuantityGroup.setSortOrder(1);

        RecipeIngredient zeroQuantityGroup = new RecipeIngredient();
        zeroQuantityGroup.setRecipeId(89L);
        zeroQuantityGroup.setIngredientNameRaw("任意木材");
        zeroQuantityGroup.setIngredientGroupType("group");
        zeroQuantityGroup.setQuantityMin(0);
        zeroQuantityGroup.setQuantityMax(0);
        zeroQuantityGroup.setSortOrder(1);
        when(recipeIngredientMapper.selectList(any())).thenReturn(List.of(missingQuantityGroup, zeroQuantityGroup));

        List<RecipeDTO> recipes = service.getRecipesByResultItemId(1L);

        assertEquals(1, recipes.size());
        assertEquals("wiki_zh", recipes.get(0).getSourceProvider());
        assertEquals("1", recipes.get(0).getIngredients().get(0).getQuantityText());
    }

    @Test
    void shouldCollapseUnscopedDuplicateWhenScopedRecipeHasSameStructure() {
        Recipe unscopedRecipe = recipe(49L, "wiki_gg");
        Recipe scopedRecipe = recipe(50L, "wiki_zh");
        scopedRecipe.setVersionScope("电脑版 主机版 移动版 only");
        when(recipeMapper.selectList(any())).thenReturn(List.of(unscopedRecipe, scopedRecipe));

        RecipeIngredient unscopedIngredient = new RecipeIngredient();
        unscopedIngredient.setRecipeId(49L);
        unscopedIngredient.setIngredientItemId(1862L);
        unscopedIngredient.setIngredientInternalName("FrostsparkBoots");
        unscopedIngredient.setIngredientNameRaw("霜花靴");
        unscopedIngredient.setIngredientGroupType("item");

        RecipeIngredient scopedIngredient = new RecipeIngredient();
        scopedIngredient.setRecipeId(50L);
        scopedIngredient.setIngredientItemId(1862L);
        scopedIngredient.setIngredientInternalName("FrostsparkBoots");
        scopedIngredient.setIngredientNameRaw("霜花靴");
        scopedIngredient.setIngredientGroupType("item");
        when(recipeIngredientMapper.selectList(any())).thenReturn(List.of(unscopedIngredient, scopedIngredient));

        RecipeStation unscopedStation = new RecipeStation();
        unscopedStation.setRecipeId(49L);
        unscopedStation.setStationItemId(398L);
        unscopedStation.setStationInternalName("TinkerersWorkshop");
        unscopedStation.setStationNameRaw("工匠作坊");

        RecipeStation scopedStation = new RecipeStation();
        scopedStation.setRecipeId(50L);
        scopedStation.setStationId(21L);
        scopedStation.setStationItemId(398L);
        scopedStation.setStationInternalName("TinkerersWorkshop");
        scopedStation.setStationNameRaw("工匠作坊");
        when(recipeStationMapper.selectList(any())).thenReturn(List.of(unscopedStation, scopedStation));

        when(itemMapper.selectBatchIds(any())).thenReturn(List.of(
            resultItem(),
            item(1862L, "FrostsparkBoots", "Frostspark Boots", "霜花靴", null),
            item(398L, "TinkerersWorkshop", "Tinkerer's Workshop", "工匠作坊", null)
        ));

        List<RecipeDTO> recipes = service.getRecipesByResultItemId(1L);

        assertEquals(1, recipes.size());
        assertEquals("wiki_zh", recipes.get(0).getSourceProvider());
    }

    @Test
    void shouldPreferCraftingStationDisplayWhenStationIdExists() {
        Recipe recipe = recipe(51L, "manual_admin");
        when(recipeMapper.selectList(any())).thenReturn(List.of(recipe));

        RecipeStation recipeStation = new RecipeStation();
        recipeStation.setRecipeId(51L);
        recipeStation.setStationId(10L);
        recipeStation.setStationItemId(4114L);
        recipeStation.setStationInternalName("VoidLens");
        recipeStation.setStationNameRaw("恶魔祭坛");
        when(recipeStationMapper.selectList(any())).thenReturn(List.of(recipeStation));

        CraftingStation craftingStation = new CraftingStation();
        craftingStation.setId(10L);
        craftingStation.setItemId(6130L);
        craftingStation.setInternalName("DemonAltarIcon");
        craftingStation.setNameEn("Demon Altar");
        craftingStation.setNameZh("恶魔祭坛");
        when(craftingStationMapper.selectBatchIds(any())).thenReturn(List.of(craftingStation));

        when(itemMapper.selectBatchIds(any())).thenReturn(List.of(
            item(1L, "SeafoodDinner", "Seafood Dinner", "娴烽矞澶ч", "https://example.invalid/seafood-dinner.png"),
            item(4114L, "VoidLens", "Void Bag", "虚空袋", "https://example.invalid/void-bag.png"),
            item(6130L, "DemonAltar", "Demon Altar", "恶魔祭坛", "https://example.invalid/demon-altar.png")
        ));

        List<RecipeDTO> recipes = service.getRecipesByResultItemId(1L);

        assertEquals(1, recipes.size());
        assertEquals(1, recipes.get(0).getStations().size());
        assertEquals("恶魔祭坛", recipes.get(0).getStations().get(0).getItemNameZh());
        assertEquals("Demon Altar", recipes.get(0).getStations().get(0).getItemName());
        assertEquals("DemonAltarIcon", recipes.get(0).getStations().get(0).getItemInternalName());
    }

    @Test
    void shouldUseManagedItemImagesForRecipeResultIngredientsAndStations() {
        Recipe recipe = recipe(55L, "wiki_zh");
        when(recipeMapper.selectList(any())).thenReturn(List.of(recipe));

        RecipeIngredient ingredient = new RecipeIngredient();
        ingredient.setRecipeId(55L);
        ingredient.setIngredientItemId(22L);
        ingredient.setIngredientInternalName("IronBar");
        ingredient.setIngredientNameRaw("Iron Bar");
        ingredient.setIngredientGroupType("item");
        ingredient.setSortOrder(1);
        when(recipeIngredientMapper.selectList(any())).thenReturn(List.of(ingredient));

        RecipeStation station = new RecipeStation();
        station.setRecipeId(55L);
        station.setStationItemId(75L);
        station.setStationInternalName("WorkBench");
        station.setStationNameRaw("Work Bench");
        station.setSortOrder(1);
        when(recipeStationMapper.selectList(any())).thenReturn(List.of(station));

        when(itemMapper.selectBatchIds(any())).thenReturn(List.of(
            item(1L, "SeafoodDinner", "Seafood Dinner", null, "https://terraria.wiki.gg/images/Seafood_Dinner.png"),
            item(22L, "IronBar", "Iron Bar", null, "https://terraria.wiki.gg/images/Iron_Bar.png"),
            item(75L, "WorkBench", "Work Bench", null, "https://terraria.wiki.gg/images/Work_Bench.png")
        ));
        Map<Long, String> managedImages = Map.of(
            1L, "http://localhost:9000/terrapedia-images/items/seafood-dinner.png",
            22L, "http://localhost:9000/terrapedia-images/items/iron-bar.png",
            75L, "http://localhost:9000/terrapedia-images/items/work-bench.png"
        );
        when(managedItemImageResolver.resolveManagedImages(any())).thenReturn(managedImages);
        when(managedItemImageResolver.resolveManagedImage(any(), anyMap())).thenAnswer(invocation -> {
            Item item = invocation.getArgument(0);
            return item == null ? null : managedImages.get(item.getId());
        });

        List<RecipeDTO> recipes = service.getRecipesByResultItemId(1L);

        assertEquals("http://localhost:9000/terrapedia-images/items/seafood-dinner.png", recipes.get(0).getResultItemImage());
        assertEquals("http://localhost:9000/terrapedia-images/items/iron-bar.png", recipes.get(0).getIngredients().get(0).getItemImage());
        assertEquals("http://localhost:9000/terrapedia-images/items/work-bench.png", recipes.get(0).getStations().get(0).getItemImage());
    }

    @Test
    void shouldDefaultSingleItemIngredientQuantityToOneInRecipeDto() {
        Recipe recipe = recipe(56L, "wiki_gg");
        recipe.setResultItemId(675L);
        recipe.setResultInternalName("TrueNightsEdge");
        when(recipeMapper.selectList(any())).thenReturn(List.of(recipe));

        RecipeIngredient nightsEdge = new RecipeIngredient();
        nightsEdge.setRecipeId(56L);
        nightsEdge.setIngredientItemId(273L);
        nightsEdge.setIngredientInternalName("NightsEdge");
        nightsEdge.setIngredientNameRaw("Night's Edge");
        nightsEdge.setIngredientGroupType("item");
        nightsEdge.setQuantityMin(0);
        nightsEdge.setQuantityMax(0);
        nightsEdge.setSortOrder(1);

        RecipeIngredient soulOfFright = new RecipeIngredient();
        soulOfFright.setRecipeId(56L);
        soulOfFright.setIngredientItemId(547L);
        soulOfFright.setIngredientInternalName("SoulofFright");
        soulOfFright.setIngredientNameRaw("Soul of Fright");
        soulOfFright.setIngredientGroupType("item");
        soulOfFright.setQuantityText("20");
        soulOfFright.setQuantityMin(20);
        soulOfFright.setQuantityMax(20);
        soulOfFright.setSortOrder(2);
        when(recipeIngredientMapper.selectList(any())).thenReturn(List.of(nightsEdge, soulOfFright));

        when(itemMapper.selectBatchIds(any())).thenReturn(List.of(
            item(675L, "TrueNightsEdge", "True Night's Edge", "真永夜刃", null),
            item(273L, "NightsEdge", "Night's Edge", "永夜刃", null),
            item(547L, "SoulofFright", "Soul of Fright", "恐惧之魂", null)
        ));

        List<RecipeDTO> recipes = service.getRecipesByResultItemId(675L);

        assertEquals(1, recipes.size());
        assertEquals("1", recipes.get(0).getIngredients().get(0).getQuantityText());
        assertEquals(1, recipes.get(0).getIngredients().get(0).getQuantityMin());
        assertEquals(1, recipes.get(0).getIngredients().get(0).getQuantityMax());
        assertEquals("20", recipes.get(0).getIngredients().get(1).getQuantityText());
        assertEquals(20, recipes.get(0).getIngredients().get(1).getQuantityMin());
        assertEquals(20, recipes.get(0).getIngredients().get(1).getQuantityMax());
    }

    @Test
    void shouldUseManagedCraftingStationImageUrlWhenItemImageIsMissing() {
        Recipe recipe = recipe(57L, "manual_admin");
        when(recipeMapper.selectList(any())).thenReturn(List.of(recipe));

        RecipeStation recipeStation = new RecipeStation();
        recipeStation.setRecipeId(57L);
        recipeStation.setStationId(10L);
        recipeStation.setStationItemId(75L);
        recipeStation.setStationInternalName("WorkBench");
        recipeStation.setStationNameRaw("Work Bench");
        recipeStation.setSortOrder(1);
        when(recipeStationMapper.selectList(any())).thenReturn(List.of(recipeStation));

        CraftingStation craftingStation = new CraftingStation();
        craftingStation.setId(10L);
        craftingStation.setItemId(75L);
        craftingStation.setInternalName("WorkBench");
        craftingStation.setNameEn("Work Bench");
        craftingStation.setImageUrl("http://localhost:9000/terrapedia-images/items/stations/work-bench.png");
        when(craftingStationMapper.selectBatchIds(any())).thenReturn(List.of(craftingStation));

        Item result = item(1L, "SeafoodDinner", "Seafood Dinner", null, "https://terraria.wiki.gg/images/Seafood_Dinner.png");
        Item stationItem = item(75L, "WorkBench", "Work Bench", null, "https://terraria.wiki.gg/images/Work_Bench.png");
        when(itemMapper.selectBatchIds(any())).thenReturn(List.of(result, stationItem));

        List<RecipeDTO> recipes = service.getRecipesByResultItemId(1L);

        assertEquals("http://localhost:9000/terrapedia-images/items/stations/work-bench.png", recipes.get(0).getStations().get(0).getItemImage());
    }

    @Test
    void shouldResolveConditionTermRequirements() {
        Recipe recipe = recipe(59L, "manual_admin");
        when(recipeMapper.selectList(any())).thenReturn(List.of(recipe));

        RecipeContextRequirement condition = new RecipeContextRequirement();
        condition.setId(90L);
        condition.setRecipeId(59L);
        condition.setRefType("CONDITION_TERM");
        condition.setRefId(30L);
        condition.setRequirementRole("required");
        condition.setSortOrder(1);
        when(recipeContextRequirementMapper.selectList(any())).thenReturn(List.of(condition));

        ConditionTerm term = new ConditionTerm();
        term.setId(30L);
        term.setCode("MOON_PHASE_1_4");
        term.setNameEn("Moon Phase 1-4");
        term.setNameZh("月相 1–4");
        term.setTermType("MOON_PHASE_RANGE");
        when(conditionTermMapper.selectBatchIds(any())).thenReturn(List.of(term));

        List<RecipeDTO> recipes = service.getRecipesByResultItemId(1L);

        assertEquals(1, recipes.get(0).getConditions().size());
        assertEquals("CONDITION_TERM", recipes.get(0).getConditions().get(0).getRefType());
        assertEquals("MOON_PHASE_1_4", recipes.get(0).getConditions().get(0).getRefCode());
        assertEquals("MOON_PHASE_RANGE", recipes.get(0).getConditions().get(0).getRefContextType());
    }

    @Test
    void shouldPreferRicherWikiZhRecipesOverLegacyWikiGgRows() {
        Recipe legacy = recipe(61L, "wiki_gg");
        Recipe refined = recipe(62L, "wiki_zh");
        when(recipeMapper.selectList(any())).thenReturn(List.of(legacy, refined));

        RecipeStation legacyStationA = new RecipeStation();
        legacyStationA.setRecipeId(61L);
        legacyStationA.setStationItemId(75L);
        legacyStationA.setStationInternalName("WorkBench");
        legacyStationA.setStationNameRaw("工作台");
        legacyStationA.setIsAlternative(false);

        RecipeStation legacyStationB = new RecipeStation();
        legacyStationB.setRecipeId(61L);
        legacyStationB.setStationNameRaw("灵雾");
        legacyStationB.setIsAlternative(true);

        RecipeStation refinedStationA = new RecipeStation();
        refinedStationA.setRecipeId(62L);
        refinedStationA.setStationId(6L);
        refinedStationA.setStationItemId(75L);
        refinedStationA.setStationInternalName("WorkBench");
        refinedStationA.setStationNameRaw("工作台");
        refinedStationA.setIsAlternative(false);

        RecipeStation refinedStationB = new RecipeStation();
        refinedStationB.setRecipeId(62L);
        refinedStationB.setStationId(14L);
        refinedStationB.setStationNameRaw("灵雾");
        refinedStationB.setIsAlternative(false);

        when(recipeStationMapper.selectList(any())).thenReturn(List.of(
            legacyStationA,
            legacyStationB,
            refinedStationA,
            refinedStationB
        ));

        List<RecipeDTO> recipes = service.getRecipesByResultItemId(1L);

        assertEquals(1, recipes.size());
        assertEquals("wiki_zh", recipes.get(0).getSourceProvider());
        assertEquals(List.of(false, false), recipes.get(0).getStations().stream().map(RecipeStationDTO::getIsAlternative).toList());
    }

    @Test
    void shouldCollapseDuplicateRecipesWithinPreferredProvider() {
        Recipe left = recipe(71L, "wiki_zh");
        Recipe right = recipe(72L, "wiki_zh");
        when(recipeMapper.selectList(any())).thenReturn(List.of(left, right));

        RecipeIngredient leftIngredient = new RecipeIngredient();
        leftIngredient.setRecipeId(71L);
        leftIngredient.setIngredientItemId(150L);
        leftIngredient.setIngredientInternalName("Cobweb");
        leftIngredient.setIngredientNameRaw("蛛网");
        leftIngredient.setIngredientGroupType("item");
        leftIngredient.setSortOrder(1);

        RecipeIngredient rightIngredient = new RecipeIngredient();
        rightIngredient.setRecipeId(72L);
        rightIngredient.setIngredientItemId(150L);
        rightIngredient.setIngredientInternalName("Cobweb");
        rightIngredient.setIngredientNameRaw("蛛网");
        rightIngredient.setIngredientGroupType("item");
        rightIngredient.setSortOrder(1);

        when(recipeIngredientMapper.selectList(any())).thenReturn(List.of(leftIngredient, rightIngredient));

        RecipeStation leftStation = new RecipeStation();
        leftStation.setRecipeId(71L);
        leftStation.setStationId(6L);
        leftStation.setStationItemId(75L);
        leftStation.setStationInternalName("WorkBench");
        leftStation.setStationNameRaw("工作台");
        leftStation.setSortOrder(1);

        RecipeStation rightStation = new RecipeStation();
        rightStation.setRecipeId(72L);
        rightStation.setStationId(6L);
        rightStation.setStationItemId(75L);
        rightStation.setStationInternalName("WorkBench");
        rightStation.setStationNameRaw("工作台");
        rightStation.setSortOrder(1);

        when(recipeStationMapper.selectList(any())).thenReturn(List.of(leftStation, rightStation));

        List<RecipeDTO> recipes = service.getRecipesByResultItemId(1L);

        assertEquals(1, recipes.size());
        assertEquals("wiki_zh", recipes.get(0).getSourceProvider());
    }

    @Test
    void shouldKeepRequiredAndAlternativeStationStructuresSeparateWhenStationsAreCanonical() {
        Recipe requiredStations = recipe(81L, "wiki_zh");
        Recipe alternativeStations = recipe(82L, "wiki_zh");
        when(recipeMapper.selectList(any())).thenReturn(List.of(requiredStations, alternativeStations));

        RecipeIngredient requiredIngredient = new RecipeIngredient();
        requiredIngredient.setRecipeId(81L);
        requiredIngredient.setIngredientItemId(150L);
        requiredIngredient.setIngredientInternalName("Cobweb");
        requiredIngredient.setIngredientNameRaw("蛛网");
        requiredIngredient.setIngredientGroupType("item");
        requiredIngredient.setSortOrder(1);

        RecipeIngredient alternativeIngredient = new RecipeIngredient();
        alternativeIngredient.setRecipeId(82L);
        alternativeIngredient.setIngredientItemId(150L);
        alternativeIngredient.setIngredientInternalName("Cobweb");
        alternativeIngredient.setIngredientNameRaw("蛛网");
        alternativeIngredient.setIngredientGroupType("item");
        alternativeIngredient.setSortOrder(1);
        when(recipeIngredientMapper.selectList(any())).thenReturn(List.of(requiredIngredient, alternativeIngredient));

        RecipeStation requiredA = new RecipeStation();
        requiredA.setRecipeId(81L);
        requiredA.setStationItemId(525L);
        requiredA.setStationInternalName("MythrilAnvil");
        requiredA.setStationNameRaw("秘银砧");
        requiredA.setIsAlternative(false);

        RecipeStation requiredB = new RecipeStation();
        requiredB.setRecipeId(81L);
        requiredB.setStationItemId(1220L);
        requiredB.setStationInternalName("OrichalcumAnvil");
        requiredB.setStationNameRaw("山铜砧");
        requiredB.setIsAlternative(false);

        RecipeStation alternativeA = new RecipeStation();
        alternativeA.setRecipeId(82L);
        alternativeA.setStationItemId(525L);
        alternativeA.setStationInternalName("MythrilAnvil");
        alternativeA.setStationNameRaw("秘银砧");
        alternativeA.setIsAlternative(false);

        RecipeStation alternativeB = new RecipeStation();
        alternativeB.setRecipeId(82L);
        alternativeB.setStationItemId(1220L);
        alternativeB.setStationInternalName("OrichalcumAnvil");
        alternativeB.setStationNameRaw("山铜砧");
        alternativeB.setIsAlternative(true);

        when(recipeStationMapper.selectList(any())).thenReturn(List.of(requiredA, requiredB, alternativeA, alternativeB));

        List<RecipeDTO> recipes = service.getRecipesByResultItemId(1L);

        assertEquals(2, recipes.size());
        assertEquals(List.of(List.of(false, false), List.of(false, true)), recipes.stream()
            .map(recipe -> recipe.getStations().stream().map(RecipeStationDTO::getIsAlternative).toList())
            .toList());
    }

    @Test
    void shouldKeepRequiredAndAlternativeStationStructuresSeparateWhenOnlyStationIdExists() {
        Recipe requiredStation = recipe(90L, "wiki_zh");
        Recipe alternativeStation = recipe(91L, "wiki_zh");
        when(recipeMapper.selectList(any())).thenReturn(List.of(requiredStation, alternativeStation));

        RecipeIngredient requiredIngredient = new RecipeIngredient();
        requiredIngredient.setRecipeId(90L);
        requiredIngredient.setIngredientItemId(150L);
        requiredIngredient.setIngredientInternalName("Cobweb");
        requiredIngredient.setIngredientNameRaw("蛛网");
        requiredIngredient.setIngredientGroupType("item");
        requiredIngredient.setSortOrder(1);

        RecipeIngredient alternativeIngredient = new RecipeIngredient();
        alternativeIngredient.setRecipeId(91L);
        alternativeIngredient.setIngredientItemId(150L);
        alternativeIngredient.setIngredientInternalName("Cobweb");
        alternativeIngredient.setIngredientNameRaw("蛛网");
        alternativeIngredient.setIngredientGroupType("item");
        alternativeIngredient.setSortOrder(1);
        when(recipeIngredientMapper.selectList(any())).thenReturn(List.of(requiredIngredient, alternativeIngredient));

        RecipeStation required = new RecipeStation();
        required.setRecipeId(90L);
        required.setStationId(14L);
        required.setStationNameRaw("灵雾");
        required.setIsAlternative(false);

        RecipeStation alternative = new RecipeStation();
        alternative.setRecipeId(91L);
        alternative.setStationId(14L);
        alternative.setStationNameRaw("灵雾");
        alternative.setIsAlternative(true);
        when(recipeStationMapper.selectList(any())).thenReturn(List.of(required, alternative));

        CraftingStation craftingStation = new CraftingStation();
        craftingStation.setId(14L);
        craftingStation.setInternalName("EctoMist");
        craftingStation.setNameZh("灵雾");
        when(craftingStationMapper.selectBatchIds(any())).thenReturn(List.of(craftingStation));

        List<RecipeDTO> recipes = service.getRecipesByResultItemId(1L);

        assertEquals(2, recipes.size());
        assertEquals(List.of(false, true), recipes.stream()
            .map(recipe -> recipe.getStations().get(0).getIsAlternative())
            .toList());
    }

    @Test
    void shouldCollapseStationIdOnlyDuplicateWithCanonicalStationItem() {
        Recipe stationIdOnlyRecipe = recipe(92L, "wiki_gg");
        Recipe canonicalItemRecipe = recipe(93L, "wiki_zh");
        canonicalItemRecipe.setVersionScope("电脑版 主机版 移动版 only");
        when(recipeMapper.selectList(any())).thenReturn(List.of(stationIdOnlyRecipe, canonicalItemRecipe));

        RecipeIngredient stationIdOnlyIngredient = new RecipeIngredient();
        stationIdOnlyIngredient.setRecipeId(92L);
        stationIdOnlyIngredient.setIngredientItemId(150L);
        stationIdOnlyIngredient.setIngredientInternalName("Cobweb");
        stationIdOnlyIngredient.setIngredientNameRaw("蛛网");
        stationIdOnlyIngredient.setIngredientGroupType("item");
        stationIdOnlyIngredient.setSortOrder(1);

        RecipeIngredient canonicalIngredient = new RecipeIngredient();
        canonicalIngredient.setRecipeId(93L);
        canonicalIngredient.setIngredientItemId(150L);
        canonicalIngredient.setIngredientInternalName("Cobweb");
        canonicalIngredient.setIngredientNameRaw("蛛网");
        canonicalIngredient.setIngredientGroupType("item");
        canonicalIngredient.setSortOrder(1);
        when(recipeIngredientMapper.selectList(any())).thenReturn(List.of(stationIdOnlyIngredient, canonicalIngredient));

        RecipeStation stationIdOnly = new RecipeStation();
        stationIdOnly.setRecipeId(92L);
        stationIdOnly.setStationId(6L);
        stationIdOnly.setStationNameRaw("工作台");
        stationIdOnly.setIsAlternative(false);

        RecipeStation canonical = new RecipeStation();
        canonical.setRecipeId(93L);
        canonical.setStationItemId(75L);
        canonical.setStationInternalName("WorkBench");
        canonical.setStationNameRaw("工作台");
        canonical.setIsAlternative(false);
        when(recipeStationMapper.selectList(any())).thenReturn(List.of(stationIdOnly, canonical));

        CraftingStation craftingStation = new CraftingStation();
        craftingStation.setId(6L);
        craftingStation.setItemId(75L);
        craftingStation.setInternalName("WorkBench");
        craftingStation.setNameZh("工作台");
        when(craftingStationMapper.selectBatchIds(any())).thenReturn(List.of(craftingStation));

        when(itemMapper.selectBatchIds(any())).thenReturn(List.of(
            resultItem(),
            item(150L, "Cobweb", "Cobweb", "蛛网", null),
            item(75L, "WorkBench", "Work Bench", "工作台", null)
        ));

        List<RecipeDTO> recipes = service.getRecipesByResultItemId(1L);

        assertEquals(1, recipes.size());
        assertEquals("wiki_zh", recipes.get(0).getSourceProvider());
    }

    @Test
    void shouldPreferScopedModernRecipeOverUnscopedAutomaticDuplicate() {
        Recipe unscoped = recipe(83L, "wiki_gg");
        Recipe scoped = recipe(84L, "wiki_zh");
        scoped.setVersionScope("电脑版 主机版 移动版 only");
        when(recipeMapper.selectList(any())).thenReturn(List.of(unscoped, scoped));

        RecipeIngredient unscopedIngredient = new RecipeIngredient();
        unscopedIngredient.setRecipeId(83L);
        unscopedIngredient.setIngredientItemId(150L);
        unscopedIngredient.setIngredientInternalName("Cobweb");
        unscopedIngredient.setIngredientNameRaw("蛛网");
        unscopedIngredient.setIngredientGroupType("item");
        unscopedIngredient.setSortOrder(1);

        RecipeIngredient scopedIngredient = new RecipeIngredient();
        scopedIngredient.setRecipeId(84L);
        scopedIngredient.setIngredientItemId(150L);
        scopedIngredient.setIngredientInternalName("Cobweb");
        scopedIngredient.setIngredientNameRaw("蛛网");
        scopedIngredient.setIngredientGroupType("item");
        scopedIngredient.setSortOrder(1);
        when(recipeIngredientMapper.selectList(any())).thenReturn(List.of(unscopedIngredient, scopedIngredient));

        RecipeStation unscopedStation = new RecipeStation();
        unscopedStation.setRecipeId(83L);
        unscopedStation.setStationItemId(75L);
        unscopedStation.setStationInternalName("WorkBench");
        unscopedStation.setStationNameRaw("工作台");

        RecipeStation scopedStation = new RecipeStation();
        scopedStation.setRecipeId(84L);
        scopedStation.setStationItemId(75L);
        scopedStation.setStationInternalName("WorkBench");
        scopedStation.setStationNameRaw("工作台");
        when(recipeStationMapper.selectList(any())).thenReturn(List.of(unscopedStation, scopedStation));

        List<RecipeDTO> recipes = service.getRecipesByResultItemId(1L);

        assertEquals(1, recipes.size());
        assertEquals("wiki_zh", recipes.get(0).getSourceProvider());
        assertEquals("电脑版 主机版 移动版 only", recipes.get(0).getVersionScope());
    }

    @Test
    void shouldDefaultAnyMaterialGroupQuantityToOneInRecipeDto() {
        Recipe recipe = recipe(85L, "wiki_gg");
        when(recipeMapper.selectList(any())).thenReturn(List.of(recipe));

        RecipeIngredient groupIngredient = new RecipeIngredient();
        groupIngredient.setRecipeId(85L);
        groupIngredient.setIngredientNameRaw("任意木材");
        groupIngredient.setIngredientGroupType("group");
        groupIngredient.setQuantityMin(0);
        groupIngredient.setQuantityMax(0);
        groupIngredient.setSortOrder(1);
        when(recipeIngredientMapper.selectList(any())).thenReturn(List.of(groupIngredient));

        List<RecipeDTO> recipes = service.getRecipesByResultItemId(1L);

        assertEquals(1, recipes.size());
        assertEquals("1", recipes.get(0).getIngredients().get(0).getQuantityText());
        assertEquals(1, recipes.get(0).getIngredients().get(0).getQuantityMin());
        assertEquals(1, recipes.get(0).getIngredients().get(0).getQuantityMax());
    }

    @Test
    void shouldRejectUnknownRecipeSourceProviderOnReplace() {
        when(itemMapper.selectById(1L)).thenReturn(resultItem());

        AdminRecipeIngredientUpsertRequestDTO ingredient = new AdminRecipeIngredientUpsertRequestDTO();
        ingredient.setIngredientNameRaw("Cobweb");
        ingredient.setQuantityText("1");

        AdminRecipeStationUpsertRequestDTO station = new AdminRecipeStationUpsertRequestDTO();
        station.setStationNameRaw("工作台");

        AdminRecipeUpsertRequestDTO request = new AdminRecipeUpsertRequestDTO();
        request.setSourceProvider("custom_provider");
        request.setIngredients(List.of(ingredient));
        request.setStations(List.of(station));

        IllegalArgumentException error = assertThrows(
            IllegalArgumentException.class,
            () -> service.replaceRecipesForResultItemId(1L, List.of(request))
        );

        assertEquals("配方 #1 的 sourceProvider 不在允许列表中", error.getMessage());
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
    private Item item(Long id, String internalName, String name, String nameZh, String image) {
        Item item = new Item();
        item.setId(id);
        item.setInternalName(internalName);
        item.setName(name);
        item.setNameZh(nameZh);
        item.setImage(image);
        return item;
    }
}

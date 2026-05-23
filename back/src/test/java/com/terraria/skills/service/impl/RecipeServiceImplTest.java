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

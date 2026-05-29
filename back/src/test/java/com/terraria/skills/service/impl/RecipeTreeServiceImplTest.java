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
import com.terraria.skills.service.ManagedImageUrlPolicy;
import com.terraria.skills.service.ManagedItemImageResolver;
import com.terraria.skills.service.RecipeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RecipeTreeServiceImplTest {

    @Mock
    private ItemService itemService;

    @Mock
    private RecipeService recipeService;

    @Mock
    private ItemMapper itemMapper;

    @Mock
    private ManagedItemImageResolver managedItemImageResolver;

    @Mock
    private ManagedImageUrlPolicy managedImageUrlPolicy;

    @TempDir
    Path tempDir;

    @BeforeEach
    void setUp() {
        lenient().when(managedItemImageResolver.resolveManagedImages(any())).thenReturn(Map.of());
        lenient().when(managedItemImageResolver.resolveManagedImage(any(), anyMap())).thenAnswer(invocation -> {
            Item item = invocation.getArgument(0);
            return item == null || item.getImage() == null || item.getImage().contains("terraria.wiki.gg")
                ? null
                : item.getImage();
        });
        lenient().when(managedImageUrlPolicy.isManagedImageUrl(any())).thenAnswer(invocation -> {
            String value = invocation.getArgument(0);
            return value != null && value.startsWith("http://localhost:9000/terrapedia-images/items/");
        });
    }

    @Test
    void shouldResolveRecipeGroupByChineseAliasAndExposeMembers() {
        RecipeTreeServiceImpl service = newService();

        ItemDTO item = recipeTreeItem(5153L, "BalloonCandelabra", "Balloon Candelabra", "Any Balloon Candelabra");
        item.setImage("http://localhost:9000/terrapedia-images/items/example.png");

        RecipeIngredientDTO groupIngredient = groupIngredient("Any Balloon", "5");
        RecipeDTO recipe = recipeWithIngredient(1274L, item, groupIngredient);

        when(itemService.getItemById(5153L)).thenReturn(item);
        when(recipeService.getRecipesByResultItemId(5153L)).thenReturn(List.of(recipe));
        when(itemMapper.selectList(any())).thenReturn(List.of(
            itemEntity(3735L, "SillyBalloonGreen", "Silly Green Balloon", "Silly Green Balloon", "https://terraria.wiki.gg/images/Silly_Green_Balloon.png"),
            itemEntity(3736L, "SillyBalloonPink", "Silly Pink Balloon", "Silly Pink Balloon", "https://terraria.wiki.gg/images/Silly_Pink_Balloon.png")
        ));

        RecipeTreeResponseDTO response = service.getRecipeTreeByItemId(5153L, 4);

        RecipeTreeNodeDTO groupNode = response.getVariants().get(0).getRoots().get(0).getChildren().get(0);
        assertEquals("任意气球", groupNode.getDisplayName());
        assertEquals("Any Balloon", groupNode.getSecondaryName());
        assertEquals("Any Balloon", groupNode.getGroupCanonicalName());
        assertFalse(groupNode.getGroupMembers().isEmpty());
        assertNull(groupNode.getGroupMembers().get(0).getImage());
    }

    @Test
    void shouldNotExposeWikiImagesForRecipeGroupMembersWithoutManagedImage() {
        RecipeTreeServiceImpl service = newService();

        ItemDTO item = recipeTreeItem(4745L, "CoffinMinecart", "Coffin Minecart", "Coffin Minecart");
        RecipeIngredientDTO groupIngredient = groupIngredient("Any Wood", "10");
        RecipeDTO recipe = recipeWithIngredient(53667L, item, groupIngredient);

        when(itemService.getItemById(4745L)).thenReturn(item);
        when(recipeService.getRecipesByResultItemId(4745L)).thenReturn(List.of(recipe));
        when(itemMapper.selectList(any())).thenReturn(List.of(
            itemEntity(9L, "Wood", "Wood", "Wood", "https://terraria.wiki.gg/images/Wood.png"),
            itemEntity(619L, "Ebonwood", "Ebonwood", "Ebonwood", "https://terraria.wiki.gg/images/Ebonwood.png")
        ));

        RecipeTreeResponseDTO response = service.getRecipeTreeByItemId(4745L, 4);

        RecipeTreeNodeDTO groupNode = response.getVariants().get(0).getRoots().get(0).getChildren().get(0);
        assertEquals(9, groupNode.getGroupMembers().size());
        assertTrue(groupNode.getGroupMembers().stream().allMatch(member -> member.getImage() == null));
    }

    @Test
    void shouldExposeAllRecipeGroupMembersInsteadOfPreviewOnly() throws IOException {
        String originalUserDir = System.getProperty("user.dir");
        Path repoRoot = tempDir.resolve("repo-all-group-members");
        Files.createDirectories(repoRoot.resolve("back"));
        Files.createDirectories(repoRoot.resolve("data/generated"));
        Files.writeString(repoRoot.resolve("data/generated/recipe-material-reference.json"), """
            {
              "groups": [
                {
                  "canonicalName": "Any Wood",
                  "displayNameEn": "Any Wood",
                  "displayNameZh": "任何木材",
                  "members": [
                    { "internalName": "Wood", "name": "Wood" },
                    { "internalName": "Ebonwood", "name": "Ebonwood" },
                    { "internalName": "RichMahogany", "name": "Rich Mahogany" },
                    { "internalName": "Pearlwood", "name": "Pearlwood" }
                  ]
                }
              ]
            }
            """);
        try {
            System.setProperty("user.dir", repoRoot.resolve("back").toString());
            RecipeTreeServiceImpl service = newService();

            ItemDTO item = recipeTreeItem(8L, "Torch", "Torch", "火把");
            RecipeIngredientDTO groupIngredient = groupIngredient("任何木材", null);
            RecipeDTO recipe = recipeWithIngredient(56363L, item, groupIngredient);

            when(itemService.getItemById(8L)).thenReturn(item);
            when(recipeService.getRecipesByResultItemId(8L)).thenReturn(List.of(recipe));
            when(itemMapper.selectList(any())).thenReturn(List.of(
                itemEntity(9L, "Wood", "Wood", "木材", "https://terraria.wiki.gg/images/Wood.png"),
                itemEntity(619L, "Ebonwood", "Ebonwood", "乌木", "https://terraria.wiki.gg/images/Ebonwood.png"),
                itemEntity(620L, "RichMahogany", "Rich Mahogany", "红木", "https://terraria.wiki.gg/images/Rich_Mahogany.png"),
                itemEntity(621L, "Pearlwood", "Pearlwood", "珍珠木", "https://terraria.wiki.gg/images/Pearlwood.png")
            ));

            RecipeTreeResponseDTO response = service.getRecipeTreeByItemId(8L, 3);

            RecipeTreeNodeDTO groupNode = response.getVariants().get(0).getRoots().get(0).getChildren().get(0);
            assertEquals(4, groupNode.getGroupMembers().size());
            assertEquals(List.of("Wood", "Ebonwood", "RichMahogany", "Pearlwood"), groupNode.getGroupMembers().stream()
                .map(member -> member.getInternalName())
                .toList());
        } finally {
            if (originalUserDir == null) {
                System.clearProperty("user.dir");
            } else {
                System.setProperty("user.dir", originalUserDir);
            }
        }
    }

    @Test
    void shouldPreferManagedImageForRecipeGroupMembers() {
        RecipeTreeServiceImpl service = newService();

        ItemDTO item = recipeTreeItem(4745L, "CoffinMinecart", "Coffin Minecart", "Coffin Minecart");
        RecipeIngredientDTO groupIngredient = groupIngredient("Any Iron Bar", "5");
        RecipeDTO recipe = recipeWithIngredient(53668L, item, groupIngredient);

        when(itemService.getItemById(4745L)).thenReturn(item);
        when(recipeService.getRecipesByResultItemId(4745L)).thenReturn(List.of(recipe));
        Item ironBar = itemEntity(22L, "IronBar", "Iron Bar", "Iron Bar", "https://terraria.wiki.gg/images/Iron_Bar.png");
        Item leadBar = itemEntity(704L, "LeadBar", "Lead Bar", "Lead Bar", "https://terraria.wiki.gg/images/Lead_Bar.png");
        when(itemMapper.selectList(any())).thenReturn(List.of(ironBar, leadBar));

        Map<Long, String> managedImages = Map.of(
            22L, "http://localhost:9000/terrapedia-images/items/iron-bar.png",
            704L, "http://localhost:9000/terrapedia-images/items/lead-bar.png"
        );
        when(managedItemImageResolver.resolveManagedImages(any())).thenReturn(managedImages);
        when(managedItemImageResolver.resolveManagedImage(any(), anyMap())).thenAnswer(invocation -> {
            Item resolved = invocation.getArgument(0);
            return resolved == null ? null : managedImages.get(resolved.getId());
        });

        RecipeTreeResponseDTO response = service.getRecipeTreeByItemId(4745L, 4);

        RecipeTreeNodeDTO groupNode = response.getVariants().get(0).getRoots().get(0).getChildren().get(0);
        assertEquals(2, groupNode.getGroupMembers().size());
        assertEquals(22L, groupNode.getGroupMembers().get(0).getItemId());
        assertEquals("http://localhost:9000/terrapedia-images/items/iron-bar.png", groupNode.getGroupMembers().get(0).getImage());
        assertEquals("http://localhost:9000/terrapedia-images/items/lead-bar.png", groupNode.getGroupMembers().get(1).getImage());
    }

    @Test
    void shouldNotExposeWikiImageForRecipeTreeRootItem() {
        RecipeTreeServiceImpl service = newService();

        ItemDTO item = recipeTreeItem(22L, "IronBar", "Iron Bar", "Iron Bar");
        item.setImage("https://terraria.wiki.gg/images/Iron_Bar.png");

        when(itemService.getItemById(22L)).thenReturn(item);
        when(recipeService.getRecipesByResultItemId(22L)).thenReturn(List.of());
        when(itemMapper.selectList(any())).thenReturn(List.of());

        RecipeTreeResponseDTO response = service.getRecipeTreeByItemId(22L, 3);

        assertNull(response.getItem().getImage());
    }

    @Test
    void shouldNotExposeUntrustedManagedLikeImageForRecipeTreeRootItem() {
        RecipeTreeServiceImpl service = newService();

        ItemDTO item = recipeTreeItem(22L, "IronBar", "Iron Bar", "Iron Bar");
        item.setImage("https://evil.example.com/terrapedia-images/items/iron-bar.png");

        when(itemService.getItemById(22L)).thenReturn(item);
        when(recipeService.getRecipesByResultItemId(22L)).thenReturn(List.of());
        when(itemMapper.selectList(any())).thenReturn(List.of());

        RecipeTreeResponseDTO response = service.getRecipeTreeByItemId(22L, 3);

        assertNull(response.getItem().getImage());
    }

    @Test
    void shouldNotExposeWikiImagesFromRecipeDtoFields() {
        RecipeTreeServiceImpl service = newService();

        ItemDTO item = recipeTreeItem(1L, "Abeemination", "Abeemination", "Abeemination");
        RecipeIngredientDTO ingredient = new RecipeIngredientDTO();
        ingredient.setIngredientItemId(2L);
        ingredient.setIngredientNameRaw("Honey Block");
        ingredient.setItemName("Honey Block");
        ingredient.setItemImage("https://terraria.wiki.gg/images/Honey_Block.png");
        ingredient.setQuantityText("5");

        RecipeStationDTO station = new RecipeStationDTO();
        station.setItemName("Water");
        station.setItemImage("https://terraria.wiki.gg/images/Water.png");

        RecipeDTO recipe = new RecipeDTO();
        recipe.setId(7001L);
        recipe.setResultItemId(1L);
        recipe.setResultItemName("Abeemination");
        recipe.setResultItemInternalName("Abeemination");
        recipe.setResultItemImage("https://terraria.wiki.gg/images/Abeemination.png");
        recipe.setResultQuantity(1);
        recipe.setIngredients(List.of(ingredient));
        recipe.setStations(List.of(station));

        when(itemService.getItemById(1L)).thenReturn(item);
        when(recipeService.getRecipesByResultItemId(1L)).thenReturn(List.of(recipe));
        when(recipeService.getRecipesByResultItemId(2L)).thenReturn(List.of());
        when(itemMapper.selectList(any())).thenReturn(List.of());

        RecipeTreeResponseDTO response = service.getRecipeTreeByItemId(1L, 3);

        RecipeTreeNodeDTO root = response.getVariants().get(0).getRoots().get(0);
        assertNull(root.getItemImage());
        assertNull(root.getChildren().get(0).getItemImage());
        assertNull(root.getStations().get(0).getStationImage());
    }

    @Test
    void shouldExposeRecipeConditionsAsIndependentTreeEntries() {
        RecipeTreeServiceImpl service = newService();

        ItemDTO item = recipeTreeItem(100L, "PumpkinPie", "Pumpkin Pie", "Pumpkin Pie");

        RecipeIngredientDTO ingredient = new RecipeIngredientDTO();
        ingredient.setIngredientItemId(200L);
        ingredient.setIngredientNameRaw("Pumpkin");
        ingredient.setQuantityText("1");

        RecipeConditionDTO condition = new RecipeConditionDTO();
        condition.setRefType("WORLD_CONTEXT");
        condition.setRefId(11L);
        condition.setRefCode("FULL_MOON");
        condition.setRefNameEn("Full Moon");
        condition.setRefNameZh("Full Moon");
        condition.setRequirementRole("required");
        condition.setNotes("Night only");

        RecipeDTO recipe = new RecipeDTO();
        recipe.setId(901L);
        recipe.setResultItemId(100L);
        recipe.setResultItemName("Pumpkin Pie");
        recipe.setResultItemNameZh("Pumpkin Pie");
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
        assertEquals("Full Moon", root.getStations().get(0).getStationName());
        assertEquals("Full Moon", root.getStations().get(0).getStationNameZh());
        assertEquals("required", root.getStations().get(0).getRequirementRole());
        assertEquals("Night only", root.getStations().get(0).getNotes());
        assertTrue(root.getChildren().isEmpty() || root.getChildren().size() == 1);
    }

    @Test
    void shouldPreferEnvironmentStationTypeWhenStationRelationIsTaggedAsEnvironment() {
        ObjectMapper objectMapper = new ObjectMapper();
        RecipeTreeServiceImpl service = new RecipeTreeServiceImpl(
            itemService,
            recipeService,
            objectMapper,
            itemMapper,
            managedItemImageResolver,
            managedImageUrlPolicy
        );

        ItemDTO item = recipeTreeItem(250L, "HoneyDispenser", "Honey Dispenser", "Honey Dispenser");

        RecipeIngredientDTO ingredient = new RecipeIngredientDTO();
        ingredient.setIngredientItemId(251L);
        ingredient.setIngredientNameRaw("Glass");
        ingredient.setQuantityText("1");

        RecipeStationDTO environmentStation = objectMapper.convertValue(Map.of(
            "stationId", 29L,
            "stationNameRaw", "Honey",
            "itemName", "Honey",
            "itemNameZh", "Honey",
            "stationType", "environment"
        ), RecipeStationDTO.class);

        RecipeDTO recipe = new RecipeDTO();
        recipe.setId(902L);
        recipe.setResultItemId(250L);
        recipe.setResultItemName("Honey Dispenser");
        recipe.setResultItemNameZh("Honey Dispenser");
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
        assertEquals("Honey", root.getStations().get(0).getStationNameRaw());
    }

    @Test
    void shouldExpandDesktopScopedChildRecipesWhenParentVariantIsBase() {
        RecipeTreeServiceImpl service = newService();

        ItemDTO parentItem = recipeTreeItem(1613L, "AnkhShield", "Ankh Shield", "Ankh Shield");
        ItemDTO childItem = recipeTreeItem(1612L, "AnkhCharm", "Ankh Charm", "Ankh Charm");
        ItemDTO armorBracingItem = recipeTreeItem(901L, "ArmorBracing", "Armor Bracing", "Armor Bracing");
        ItemDTO medicatedBandageItem = recipeTreeItem(902L, "MedicatedBandage", "Medicated Bandage", "Medicated Bandage");
        ItemDTO thePlanItem = recipeTreeItem(903L, "ThePlan", "The Plan", "The Plan");

        RecipeIngredientDTO parentIngredient = new RecipeIngredientDTO();
        parentIngredient.setIngredientItemId(1612L);
        parentIngredient.setIngredientInternalName("AnkhCharm");
        parentIngredient.setIngredientNameRaw("Ankh Charm");
        parentIngredient.setItemName("Ankh Charm");
        parentIngredient.setItemNameZh("Ankh Charm");
        parentIngredient.setIngredientGroupType("item");

        RecipeDTO parentRecipe = recipeWithIngredient(61417L, parentItem, parentIngredient);

        RecipeDTO ankhCharmRecipe = new RecipeDTO();
        ankhCharmRecipe.setId(52240L);
        ankhCharmRecipe.setResultItemId(1612L);
        ankhCharmRecipe.setResultItemName("Ankh Charm");
        ankhCharmRecipe.setResultItemNameZh("Ankh Charm");
        ankhCharmRecipe.setResultItemInternalName("AnkhCharm");
        ankhCharmRecipe.setResultQuantity(1);

        RecipeIngredientDTO armorBracingIngredient = new RecipeIngredientDTO();
        armorBracingIngredient.setIngredientItemId(901L);
        armorBracingIngredient.setIngredientInternalName("ArmorBracing");
        armorBracingIngredient.setIngredientNameRaw("Armor Bracing");
        armorBracingIngredient.setItemName("Armor Bracing");
        armorBracingIngredient.setItemNameZh("Armor Bracing");
        armorBracingIngredient.setIngredientGroupType("item");

        RecipeIngredientDTO medicatedBandageIngredient = new RecipeIngredientDTO();
        medicatedBandageIngredient.setIngredientItemId(902L);
        medicatedBandageIngredient.setIngredientInternalName("MedicatedBandage");
        medicatedBandageIngredient.setIngredientNameRaw("Medicated Bandage");
        medicatedBandageIngredient.setItemName("Medicated Bandage");
        medicatedBandageIngredient.setItemNameZh("Medicated Bandage");
        medicatedBandageIngredient.setIngredientGroupType("item");

        RecipeIngredientDTO thePlanIngredient = new RecipeIngredientDTO();
        thePlanIngredient.setIngredientItemId(903L);
        thePlanIngredient.setIngredientInternalName("ThePlan");
        thePlanIngredient.setIngredientNameRaw("The Plan");
        thePlanIngredient.setItemName("The Plan");
        thePlanIngredient.setItemNameZh("The Plan");
        thePlanIngredient.setIngredientGroupType("item");

        ankhCharmRecipe.setIngredients(List.of(
            armorBracingIngredient,
            medicatedBandageIngredient,
            thePlanIngredient
        ));

        RecipeDTO armorBracingRecipe = recipeWithIngredient(
            61485L,
            armorBracingItem,
            simpleIngredient(888L, "Blindfold", "Blindfold")
        );
        armorBracingRecipe.setVersionScope("电脑版 主机版 移动版 only");

        RecipeDTO medicatedBandageRecipe = recipeWithIngredient(
            61501L,
            medicatedBandageItem,
            simpleIngredient(889L, "Bezoar", "Bezoar")
        );
        medicatedBandageRecipe.setVersionScope("电脑版 主机版 移动版 only");

        RecipeDTO thePlanRecipe = recipeWithIngredient(
            61505L,
            thePlanItem,
            simpleIngredient(890L, "FastClock", "Fast Clock")
        );
        thePlanRecipe.setVersionScope("电脑版 主机版 移动版 only");

        when(itemService.getItemById(1613L)).thenReturn(parentItem);
        when(recipeService.getRecipesByResultItemId(1613L)).thenReturn(List.of(parentRecipe));
        when(recipeService.getRecipesByResultItemId(1612L)).thenReturn(List.of(ankhCharmRecipe));
        when(recipeService.getRecipesByResultItemId(901L)).thenReturn(List.of(armorBracingRecipe));
        when(recipeService.getRecipesByResultItemId(902L)).thenReturn(List.of(medicatedBandageRecipe));
        when(recipeService.getRecipesByResultItemId(903L)).thenReturn(List.of(thePlanRecipe));
        when(recipeService.getRecipesByResultItemId(888L)).thenReturn(List.of());
        when(recipeService.getRecipesByResultItemId(889L)).thenReturn(List.of());
        when(recipeService.getRecipesByResultItemId(890L)).thenReturn(List.of());
        when(itemMapper.selectList(any())).thenReturn(List.of());

        RecipeTreeResponseDTO response = service.getRecipeTreeByItemId(1613L, 4);

        RecipeTreeNodeDTO ankhCharmNode = response.getVariants().get(0).getRoots().get(0).getChildren().get(0);
        RecipeTreeNodeDTO ankhCharmRecipeNode = ankhCharmNode.getChildren().get(0);

        assertEquals(3, ankhCharmRecipeNode.getChildren().size());
        assertTrue(ankhCharmRecipeNode.getChildren().stream().allMatch(ingredient -> Boolean.TRUE.equals(ingredient.getExpandable())));
        assertEquals(List.of(1, 1, 1), ankhCharmRecipeNode.getChildren().stream().map(ingredient -> ingredient.getChildren().size()).toList());
    }

    @Test
    void shouldDefaultSingleItemIngredientsToOneInRecipeTree() {
        RecipeTreeServiceImpl service = newService();

        ItemDTO trueNightsEdge = recipeTreeItem(675L, "TrueNightsEdge", "True Night's Edge", "真永夜刃");
        RecipeDTO recipe = new RecipeDTO();
        recipe.setId(62640L);
        recipe.setResultItemId(675L);
        recipe.setResultItemName("True Night's Edge");
        recipe.setResultItemNameZh("真永夜刃");
        recipe.setResultItemInternalName("TrueNightsEdge");
        recipe.setResultQuantity(1);
        recipe.setVersionScope("Desktop version Console version Mobile version only");

        RecipeIngredientDTO nightsEdge = simpleIngredient(273L, "NightsEdge", "Night's Edge");
        nightsEdge.setItemNameZh("永夜刃");
        nightsEdge.setQuantityMin(0);
        nightsEdge.setQuantityMax(0);

        RecipeIngredientDTO soulOfFright = simpleIngredient(547L, "SoulofFright", "Soul of Fright");
        soulOfFright.setItemNameZh("恐惧之魂");
        soulOfFright.setQuantityText("20");
        soulOfFright.setQuantityMin(20);
        soulOfFright.setQuantityMax(20);

        RecipeIngredientDTO soulOfMight = simpleIngredient(548L, "SoulofMight", "Soul of Might");
        soulOfMight.setItemNameZh("力量之魂");
        soulOfMight.setQuantityText("20");
        soulOfMight.setQuantityMin(20);
        soulOfMight.setQuantityMax(20);

        RecipeIngredientDTO soulOfSight = simpleIngredient(549L, "SoulofSight", "Soul of Sight");
        soulOfSight.setItemNameZh("视域之魂");
        soulOfSight.setQuantityText("20");
        soulOfSight.setQuantityMin(20);
        soulOfSight.setQuantityMax(20);

        recipe.setIngredients(List.of(nightsEdge, soulOfFright, soulOfMight, soulOfSight));

        when(itemService.getItemById(675L)).thenReturn(trueNightsEdge);
        when(recipeService.getRecipesByResultItemId(675L)).thenReturn(List.of(recipe));
        when(recipeService.getRecipesByResultItemId(273L)).thenReturn(List.of());
        when(recipeService.getRecipesByResultItemId(547L)).thenReturn(List.of());
        when(recipeService.getRecipesByResultItemId(548L)).thenReturn(List.of());
        when(recipeService.getRecipesByResultItemId(549L)).thenReturn(List.of());
        when(itemMapper.selectList(any())).thenReturn(List.of());

        RecipeTreeResponseDTO response = service.getRecipeTreeByItemId(675L, 3);

        RecipeTreeNodeDTO root = response.getVariants().get(0).getRoots().get(0);

        assertEquals("desktop-console-mobile", response.getVariants().get(0).getVariantKey());
        assertEquals("1", root.getChildren().get(0).getQuantityText());
        assertEquals(1, root.getChildren().get(0).getQuantityMin());
        assertEquals(1, root.getChildren().get(0).getQuantityMax());
        assertEquals(List.of("20", "20", "20"), root.getChildren().subList(1, 4).stream().map(RecipeTreeNodeDTO::getQuantityText).toList());
    }

    @Test
    void shouldDefaultSingleGroupIngredientsToOneInRecipeTree() {
        RecipeTreeServiceImpl service = newService();

        ItemDTO torch = recipeTreeItem(8L, "Torch", "Torch", "火把");
        RecipeIngredientDTO anyWood = groupIngredient("Any Wood", null);
        anyWood.setQuantityMin(0);
        anyWood.setQuantityMax(0);
        RecipeDTO recipe = recipeWithIngredient(1008L, torch, anyWood);

        when(itemService.getItemById(8L)).thenReturn(torch);
        when(recipeService.getRecipesByResultItemId(8L)).thenReturn(List.of(recipe));
        when(itemMapper.selectList(any())).thenReturn(List.of());

        RecipeTreeResponseDTO response = service.getRecipeTreeByItemId(8L, 3);

        RecipeTreeNodeDTO groupNode = response.getVariants().get(0).getRoots().get(0).getChildren().get(0);
        assertEquals("group", groupNode.getIngredientGroupType());
        assertEquals("1", groupNode.getQuantityText());
        assertEquals(1, groupNode.getQuantityMin());
        assertEquals(1, groupNode.getQuantityMax());
    }

    @Test
    void shouldScaleNestedRecipeIngredientsByRequiredParentQuantity() {
        RecipeTreeServiceImpl service = newService();

        ItemDTO drillContainmentUnit = recipeTreeItem(2768L, "DrillContainmentUnit", "Drill Containment Unit", "钻头控制装置");
        ItemDTO chlorophyteBar = recipeTreeItem(1006L, "ChlorophyteBar", "Chlorophyte Bar", "叶绿锭");

        RecipeIngredientDTO requiredBars = simpleIngredient(1006L, "ChlorophyteBar", "Chlorophyte Bar");
        requiredBars.setItemNameZh("叶绿锭");
        requiredBars.setQuantityText("40");
        requiredBars.setQuantityMin(40);
        requiredBars.setQuantityMax(40);
        RecipeDTO drillRecipe = recipeWithIngredient(276801L, drillContainmentUnit, requiredBars);

        RecipeIngredientDTO requiredOre = simpleIngredient(947L, "ChlorophyteOre", "Chlorophyte Ore");
        requiredOre.setItemNameZh("叶绿矿");
        requiredOre.setQuantityText("5");
        requiredOre.setQuantityMin(5);
        requiredOre.setQuantityMax(5);
        RecipeDTO barRecipe = recipeWithIngredient(100601L, chlorophyteBar, requiredOre);
        barRecipe.setResultQuantity(1);

        when(itemService.getItemById(2768L)).thenReturn(drillContainmentUnit);
        when(recipeService.getRecipesByResultItemId(2768L)).thenReturn(List.of(drillRecipe));
        when(recipeService.getRecipesByResultItemId(1006L)).thenReturn(List.of(barRecipe));
        when(recipeService.getRecipesByResultItemId(947L)).thenReturn(List.of());
        when(itemMapper.selectList(any())).thenReturn(List.of());

        RecipeTreeResponseDTO response = service.getRecipeTreeByItemId(2768L, 5);

        RecipeTreeNodeDTO barIngredient = response.getVariants().get(0).getRoots().get(0).getChildren().get(0);
        RecipeTreeNodeDTO expandedBarRecipe = barIngredient.getChildren().get(0);
        RecipeTreeNodeDTO oreIngredient = expandedBarRecipe.getChildren().get(0);

        assertEquals("40", expandedBarRecipe.getQuantityText());
        assertEquals(40, expandedBarRecipe.getQuantityMin());
        assertEquals(40, expandedBarRecipe.getQuantityMax());
        assertEquals("200", oreIngredient.getQuantityText());
        assertEquals(200, oreIngredient.getQuantityMin());
        assertEquals(200, oreIngredient.getQuantityMax());
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
                  "displayNameZh": "Any Pylon",
                  "domains": ["recipe", "npc_shop"],
                  "sourceProvider": "wiki_gg",
                  "sourcePage": "https://terraria.wiki.gg/wiki/Pylons",
                  "members": [
                    {
                      "internalName": "TeleportationPylonPurity",
                      "name": "Forest Pylon",
                      "nameZh": "Forest Pylon"
                    }
                  ]
                }
              ]
            }
            """);
        try {
            System.setProperty("user.dir", repoRoot.resolve("back").toString());
            RecipeTreeServiceImpl service = newService();

            ItemDTO item = recipeTreeItem(9001L, "PylonTestItem", "Pylon Test Item", "Pylon Test Item");
            RecipeIngredientDTO groupIngredient = groupIngredient("Any Teleportation Pylon", "1");
            RecipeDTO recipe = recipeWithIngredient(9002L, item, groupIngredient);

            when(itemService.getItemById(9001L)).thenReturn(item);
            when(recipeService.getRecipesByResultItemId(9001L)).thenReturn(List.of(recipe));
            when(itemMapper.selectList(any())).thenReturn(List.of(
                itemEntity(4875L, "TeleportationPylonPurity", "Forest Pylon", "Forest Pylon", "https://terraria.wiki.gg/images/Forest_Pylon.png")
            ));

            RecipeTreeResponseDTO response = service.getRecipeTreeByItemId(9001L, 4);

            RecipeTreeNodeDTO groupNode = response.getVariants().get(0).getRoots().get(0).getChildren().get(0);
            assertEquals("Any Pylon", groupNode.getDisplayName());
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
            RecipeTreeServiceImpl service = newService();

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

    private RecipeTreeServiceImpl newService() {
        return new RecipeTreeServiceImpl(
            itemService,
            recipeService,
            new ObjectMapper(),
            itemMapper,
            managedItemImageResolver,
            managedImageUrlPolicy
        );
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

    private RecipeIngredientDTO simpleIngredient(Long itemId, String internalName, String rawName) {
        RecipeIngredientDTO ingredient = new RecipeIngredientDTO();
        ingredient.setIngredientItemId(itemId);
        ingredient.setIngredientInternalName(internalName);
        ingredient.setIngredientNameRaw(rawName);
        ingredient.setItemName(rawName);
        ingredient.setItemNameZh(rawName);
        ingredient.setIngredientGroupType("item");
        return ingredient;
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

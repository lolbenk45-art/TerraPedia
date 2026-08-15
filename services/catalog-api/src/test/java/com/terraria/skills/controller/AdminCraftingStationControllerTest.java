package com.terraria.skills.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.AdminCraftingStationDTO;
import com.terraria.skills.entity.CraftingStation;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.Recipe;
import com.terraria.skills.entity.RecipeStation;
import com.terraria.skills.mapper.CraftingStationMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.mapper.RecipeMapper;
import com.terraria.skills.mapper.RecipeStationMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminCraftingStationControllerTest {

    @Mock
    private CraftingStationMapper craftingStationMapper;

    @Mock
    private ItemMapper itemMapper;

    @Mock
    private RecipeMapper recipeMapper;

    @Mock
    private RecipeStationMapper recipeStationMapper;

    @Test
    void shouldReturnCraftingStations() {
        when(craftingStationMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(
            station(1L, 33L, "WorkBench", "Workbench", "Workbench zh", "crafting_station", "https://terraria.wiki.gg/images/Work_Bench.png")
        ));
        when(recipeStationMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(
            recipeStation(99L, 7L, 1L, 33L, "WorkBench", "Workbench")
        ));
        when(recipeMapper.selectBatchIds(any())).thenReturn(List.of(recipe(7L, 101L)));
        when(itemMapper.selectBatchIds(any())).thenReturn(List.of(
            item(33L, "WorkBench", "Work Bench", "Workbench zh", "https://terraria.wiki.gg/images/Work_Bench.png"),
            item(101L, "IronBroadsword", "Iron Broadsword", "Iron Broadsword zh", "https://terraria.wiki.gg/images/Iron_Broadsword.png")
        ));

        ResponseEntity<ApiResponse<List<AdminCraftingStationDTO>>> response = controller().getCraftingStations(1, 20, null, null, null);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals(1, response.getBody().getData().size());
        AdminCraftingStationDTO dto = response.getBody().getData().get(0);
        assertEquals("Workbench", dto.getNameEn());
        assertEquals("Work Bench", dto.getItemName());
        assertEquals(1, dto.getUsageRecipeCount());
        assertEquals(1, dto.getUsageItemCount());
        assertEquals(List.of(7L), dto.getUsageRecipeIds());
        assertEquals("Iron Broadsword", dto.getUsageItems().get(0).getResultItemName());
    }

    @Test
    void shouldRejectCreateWhenNamesMissing() {
        CraftingStation request = new CraftingStation();
        request.setStationType("crafting_station");

        ResponseEntity<ApiResponse<AdminCraftingStationDTO>> response = controller().createCraftingStation(request);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertNotNull(response.getBody());
        assertFalse(response.getBody().isSuccess());
    }

    @Test
    void shouldReturnPagedUsageItems() {
        when(craftingStationMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(
            station(12L, 33L, "WorkBench", "Workbench", "Workbench zh", "crafting_station", "https://terraria.wiki.gg/images/Work_Bench.png")
        ));
        when(recipeStationMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(
            recipeStation(201L, 301L, 12L, 33L, "WorkBench", "Workbench"),
            recipeStation(202L, 302L, 12L, 33L, "WorkBench", "Workbench")
        ));
        when(recipeMapper.selectBatchIds(any())).thenReturn(List.of(
            recipe(301L, 501L),
            recipe(302L, 502L)
        ));
        when(itemMapper.selectBatchIds(any())).thenReturn(List.of(
            item(33L, "WorkBench", "Work Bench", "Workbench zh", "https://terraria.wiki.gg/images/Work_Bench.png"),
            item(501L, "BuilderPotion", "Builder Potion", "Builder Potion zh", "https://terraria.wiki.gg/images/Builder_Potion.png"),
            item(502L, "BattlePotion", "Battle Potion", "Battle Potion zh", "https://terraria.wiki.gg/images/Battle_Potion.png")
        ));

        ResponseEntity<ApiResponse<List<com.terraria.skills.dto.AdminCraftingStationUsageItemDTO>>> response =
            controller().getCraftingStationUsageItems(12L, 1, 1, null);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals(1, response.getBody().getData().size());
        assertEquals(2L, response.getBody().getPagination().getTotal());
    }

    @Test
    void shouldRejectCreateWhenItemDoesNotExist() {
        CraftingStation request = new CraftingStation();
        request.setNameEn("Workbench");
        request.setItemId(999L);

        when(itemMapper.selectById(999L)).thenReturn(null);

        ResponseEntity<ApiResponse<AdminCraftingStationDTO>> response = controller().createCraftingStation(request);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("itemId does not reference an existing item", response.getBody().getMessage());
    }

    @Test
    void shouldCreateCraftingStation() {
        CraftingStation request = new CraftingStation();
        request.setNameEn("Workbench");
        request.setInternalName("WorkBench");

        CraftingStation saved = station(5L, null, "WorkBench", "Workbench", null, "crafting_station", null);

        when(craftingStationMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(0L);
        doAnswer(invocation -> {
            CraftingStation target = invocation.getArgument(0);
            target.setId(5L);
            return 1;
        }).when(craftingStationMapper).insert(any(CraftingStation.class));
        when(craftingStationMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(saved));

        ResponseEntity<ApiResponse<AdminCraftingStationDTO>> response = controller().createCraftingStation(request);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals(5L, response.getBody().getData().getId());
    }

    @Test
    void shouldRejectDuplicateCraftingStation() {
        CraftingStation request = new CraftingStation();
        request.setInternalName("WorkBench");

        when(craftingStationMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(1L);

        ResponseEntity<ApiResponse<AdminCraftingStationDTO>> response = controller().createCraftingStation(request);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("crafting station already exists", response.getBody().getMessage());
    }

    @Test
    void shouldUpdateCraftingStation() {
        CraftingStation existing = station(3L, null, "WorkBench", "Workbench", null, "crafting_station", null);
        CraftingStation request = new CraftingStation();
        request.setNameEn("Heavy Work Bench");
        CraftingStation updated = station(3L, null, "WorkBench", "Heavy Work Bench", null, "crafting_station", null);

        when(craftingStationMapper.selectById(3L)).thenReturn(existing);
        when(craftingStationMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(updated));

        ResponseEntity<ApiResponse<AdminCraftingStationDTO>> response = controller().updateCraftingStation(3L, request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("Heavy Work Bench", response.getBody().getData().getNameEn());
    }

    @Test
    void shouldBlockDeleteWhenReferenced() {
        CraftingStation existing = station(7L, null, "WorkBench", "Workbench", null, "crafting_station", null);

        when(craftingStationMapper.selectById(7L)).thenReturn(existing);
        when(recipeStationMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(2L);

        ResponseEntity<ApiResponse<Void>> response = controller().deleteCraftingStation(7L);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("crafting station is still referenced by recipes", response.getBody().getMessage());
    }

    @Test
    void shouldDeleteUnreferencedCraftingStation() {
        CraftingStation existing = station(8L, null, "WorkBench", "Workbench", null, "crafting_station", null);

        when(craftingStationMapper.selectById(8L)).thenReturn(existing);
        when(recipeStationMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(0L);
        when(craftingStationMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(existing));
        when(recipeStationMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());

        ResponseEntity<ApiResponse<Void>> response = controller().deleteCraftingStation(8L);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        verify(craftingStationMapper).deleteById(8L);
    }

    @Test
    void shouldBlockDeleteWhenLegacyReferenceExists() {
        CraftingStation existing = station(9L, 33L, "WorkBench", "Workbench", null, "crafting_station", null);

        when(craftingStationMapper.selectById(9L)).thenReturn(existing);
        when(recipeStationMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(0L);
        when(craftingStationMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(existing));
        when(recipeStationMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(
            recipeStation(11L, 22L, null, 33L, null, null)
        ));
        when(recipeMapper.selectBatchIds(any())).thenReturn(List.of(recipe(22L, 500L)));
        when(itemMapper.selectBatchIds(any())).thenReturn(List.of(
            item(33L, "WorkBench", "Work Bench", "Workbench zh", "https://terraria.wiki.gg/images/Work_Bench.png"),
            item(500L, "LegacyResult", "Legacy Result", "Legacy Result zh", "https://terraria.wiki.gg/images/Legacy_Result.png")
        ));

        ResponseEntity<ApiResponse<Void>> response = controller().deleteCraftingStation(9L);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("crafting station is still referenced by recipes", response.getBody().getMessage());
    }

    @Test
    void shouldAggregateComboStationUsageFromComponentStations() {
        when(craftingStationMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(
            station(6L, 36L, "WorkBench", "Work Bench", "工作台", "crafting_station", "https://terraria.wiki.gg/images/Work_Bench.png"),
            station(14L, null, null, "Ecto Mist", "灵雾", "environment", null),
            station(70L, null, "ZH_STATION_COMBO_WORKBENCH_AND_ECTO_MIST", "Work Bench + Ecto Mist", "工作台 + 灵雾", "crafting_station_combo", "https://terraria.wiki.gg/images/Work_Bench.png")
        ));
        when(recipeStationMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(
            recipeStation(101L, 501L, 6L, 36L, "WorkBench", "工作台"),
            recipeStation(102L, 501L, 14L, null, null, "灵雾"),
            recipeStation(103L, 502L, 6L, 36L, "WorkBench", "工作台")
        ));
        when(recipeMapper.selectBatchIds(any())).thenReturn(List.of(
            recipe(501L, 9001L),
            recipe(502L, 9002L)
        ));
        when(itemMapper.selectBatchIds(any())).thenReturn(List.of(
            item(36L, "WorkBench", "Work Bench", "工作台", "https://terraria.wiki.gg/images/Work_Bench.png"),
            item(9001L, "BrownMossyWall", "Brown Mossy Wall", "棕苔藓墙", "https://terraria.wiki.gg/images/Brown_Mossy_Wall.png"),
            item(9002L, "WoodenChair", "Wooden Chair", "木椅", "https://terraria.wiki.gg/images/Wooden_Chair.png")
        ));

        AdminCraftingStationController controller = new AdminCraftingStationController(
            craftingStationMapper,
            itemMapper,
            recipeMapper,
            recipeStationMapper
        );

        ResponseEntity<ApiResponse<List<AdminCraftingStationDTO>>> response = controller.getCraftingStations(1, 20, null, null, null);
        List<AdminCraftingStationDTO> stations = response.getBody().getData();

        AdminCraftingStationDTO combo = stations.stream()
            .filter(station -> Long.valueOf(70L).equals(station.getId()))
            .findFirst()
            .orElseThrow();

        assertEquals(1, combo.getUsageRecipeCount());
        assertEquals(1, combo.getUsageItemCount());
        assertEquals(List.of(501L), combo.getUsageRecipeIds());
        assertEquals("Brown Mossy Wall", combo.getUsageItems().get(0).getResultItemName());
    }

    private AdminCraftingStationController controller() {
        return new AdminCraftingStationController(
            craftingStationMapper,
            itemMapper,
            recipeMapper,
            recipeStationMapper
        );
    }

    private CraftingStation station(Long id, Long itemId, String internalName, String nameEn, String nameZh, String stationType, String imageUrl) {
        CraftingStation station = new CraftingStation();
        station.setId(id);
        station.setItemId(itemId);
        station.setInternalName(internalName);
        station.setNameEn(nameEn);
        station.setNameZh(nameZh);
        station.setStationType(stationType);
        station.setImageUrl(imageUrl);
        station.setSortOrder(id.intValue());
        station.setStatus(1);
        station.setDeleted(0);
        return station;
    }

    private RecipeStation recipeStation(Long id, Long recipeId, Long stationId, Long stationItemId, String stationInternalName, String stationNameRaw) {
        RecipeStation station = new RecipeStation();
        station.setId(id);
        station.setRecipeId(recipeId);
        station.setStationId(stationId);
        station.setStationItemId(stationItemId);
        station.setStationInternalName(stationInternalName);
        station.setStationNameRaw(stationNameRaw);
        station.setIsAlternative(false);
        station.setSortOrder(id.intValue());
        return station;
    }

    private Recipe recipe(Long id, Long resultItemId) {
        Recipe recipe = new Recipe();
        recipe.setId(id);
        recipe.setResultItemId(resultItemId);
        recipe.setResultQuantity(1);
        recipe.setStatus(1);
        recipe.setDeleted(0);
        return recipe;
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

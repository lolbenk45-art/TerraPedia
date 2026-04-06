package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.terraria.skills.entity.CraftingStation;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.Recipe;
import com.terraria.skills.entity.RecipeStation;
import com.terraria.skills.mapper.CraftingStationMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.mapper.RecipeMapper;
import com.terraria.skills.mapper.RecipeStationMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentMatchers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.Mockito.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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

    @InjectMocks
    private AdminCraftingStationController controller;

    private MockMvc mockMvc;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

        mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
            .build();
    }

    @Test
    void shouldReturnCraftingStations() throws Exception {
        CraftingStation station = new CraftingStation();
        station.setId(1L);
        station.setNameEn("Workbench");
        station.setItemId(33L);

        Item item = new Item();
        item.setId(33L);
        item.setName("Work Bench");
        item.setNameZh("工作台");

        RecipeStation recipeStation = new RecipeStation();
        recipeStation.setId(99L);
        recipeStation.setStationId(1L);
        recipeStation.setRecipeId(7L);

        Recipe recipe = new Recipe();
        recipe.setId(7L);
        recipe.setResultItemId(101L);
        recipe.setVersionScope("Desktop version");

        Item resultItem = new Item();
        resultItem.setId(101L);
        resultItem.setName("Iron Broadsword");
        resultItem.setNameZh("铁阔剑");

        Page<CraftingStation> page = new Page<>(1, 20);
        page.setRecords(List.of(station));
        page.setTotal(1);

        when(craftingStationMapper.selectPage(any(Page.class), any())).thenReturn(page);
        when(recipeStationMapper.selectList(any())).thenReturn(List.of(recipeStation));
        when(recipeMapper.selectBatchIds(any())).thenReturn(List.of(recipe));
        when(itemMapper.selectBatchIds(any())).thenReturn(List.of(item, resultItem));

        mockMvc.perform(get("/admin/crafting-stations").accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.length()").value(1))
            .andExpect(jsonPath("$.data[0].nameEn").value("Workbench"))
            .andExpect(jsonPath("$.data[0].itemName").value("Work Bench"))
            .andExpect(jsonPath("$.data[0].itemNameZh").value("工作台"))
            .andExpect(jsonPath("$.data[0].usageRecipeCount").value(1))
            .andExpect(jsonPath("$.data[0].usageItemCount").value(1))
            .andExpect(jsonPath("$.data[0].usageRecipeIds[0]").value(7))
            .andExpect(jsonPath("$.data[0].usageItems[0].resultItemNameZh").value("铁阔剑"));
    }

    @Test
    void shouldRejectCreateWhenNamesMissing() throws Exception {
        CraftingStation request = new CraftingStation();
        request.setStationType("crafting_station");

        mockMvc.perform(post("/admin/crafting-stations")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.success").value(false));
    }

    @Test
    void shouldReturnPagedUsageItems() throws Exception {
        CraftingStation station = new CraftingStation();
        station.setId(12L);
        station.setItemId(33L);

        RecipeStation first = new RecipeStation();
        first.setId(201L);
        first.setRecipeId(301L);
        first.setStationId(12L);

        RecipeStation second = new RecipeStation();
        second.setId(202L);
        second.setRecipeId(302L);
        second.setStationId(12L);

        Recipe recipeOne = new Recipe();
        recipeOne.setId(301L);
        recipeOne.setResultItemId(501L);
        recipeOne.setVersionScope("Desktop version");

        Recipe recipeTwo = new Recipe();
        recipeTwo.setId(302L);
        recipeTwo.setResultItemId(502L);
        recipeTwo.setVersionScope("Desktop version");

        Item itemOne = new Item();
        itemOne.setId(501L);
        itemOne.setName("Builder Potion");
        itemOne.setNameZh("建造药水");

        Item itemTwo = new Item();
        itemTwo.setId(502L);
        itemTwo.setName("Battle Potion");
        itemTwo.setNameZh("战斗药水");

        when(craftingStationMapper.selectById(12L)).thenReturn(station);
        when(recipeStationMapper.selectList(any())).thenReturn(List.of(first, second));
        when(recipeMapper.selectBatchIds(any())).thenReturn(List.of(recipeOne, recipeTwo));
        when(itemMapper.selectBatchIds(any())).thenReturn(List.of(itemOne, itemTwo));

        mockMvc.perform(get("/admin/crafting-stations/12/usage-items?page=1&limit=1").accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.length()").value(1))
            .andExpect(jsonPath("$.pagination.total").value(2));
    }

    @Test
    void shouldRejectCreateWhenItemDoesNotExist() throws Exception {
        CraftingStation request = new CraftingStation();
        request.setNameEn("Workbench");
        request.setItemId(999L);

        when(itemMapper.selectById(999L)).thenReturn(null);

        mockMvc.perform(post("/admin/crafting-stations")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("itemId does not reference an existing item"));
    }

    @Test
    void shouldCreateCraftingStation() throws Exception {
        CraftingStation request = new CraftingStation();
        request.setNameEn("Workbench");
        request.setInternalName("WorkBench");

        CraftingStation saved = new CraftingStation();
        saved.setId(5L);
        saved.setNameEn("Workbench");
        saved.setInternalName("WorkBench");

        when(craftingStationMapper.selectCount(any())).thenReturn(0L);
        doAnswer(invocation -> {
            CraftingStation target = invocation.getArgument(0);
            target.setId(5L);
            return 1;
        }).when(craftingStationMapper).insert(any(CraftingStation.class));
        when(craftingStationMapper.selectById(5L)).thenReturn(saved);

        mockMvc.perform(post("/admin/crafting-stations")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.id").value(5));
    }

    @Test
    void shouldRejectDuplicateCraftingStation() throws Exception {
        CraftingStation request = new CraftingStation();
        request.setInternalName("WorkBench");

        when(craftingStationMapper.selectCount(any())).thenReturn(1L);

        mockMvc.perform(post("/admin/crafting-stations")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("crafting station already exists"));
    }

    @Test
    void shouldUpdateCraftingStation() throws Exception {
        CraftingStation existing = new CraftingStation();
        existing.setId(3L);
        existing.setNameEn("Workbench");

        CraftingStation request = new CraftingStation();
        request.setNameEn("Heavy Work Bench");

        CraftingStation updated = new CraftingStation();
        updated.setId(3L);
        updated.setNameEn("Heavy Work Bench");

        when(craftingStationMapper.selectById(3L)).thenReturn(existing, updated);

        mockMvc.perform(put("/admin/crafting-stations/3")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.nameEn").value("Heavy Work Bench"));
    }

    @Test
    void shouldBlockDeleteWhenReferenced() throws Exception {
        CraftingStation existing = new CraftingStation();
        existing.setId(7L);

        when(craftingStationMapper.selectById(7L)).thenReturn(existing);
        when(recipeStationMapper.selectCount(any())).thenReturn(2L);

        mockMvc.perform(delete("/admin/crafting-stations/7"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("crafting station is still referenced by recipes"));
    }

    @Test
    void shouldDeleteUnreferencedCraftingStation() throws Exception {
        CraftingStation existing = new CraftingStation();
        existing.setId(8L);

        when(craftingStationMapper.selectById(8L)).thenReturn(existing);
        when(recipeStationMapper.selectCount(any())).thenReturn(0L);

        mockMvc.perform(delete("/admin/crafting-stations/8"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));

        verify(craftingStationMapper).deleteById(8L);
    }

    @Test
    void shouldBlockDeleteWhenLegacyReferenceExists() throws Exception {
        CraftingStation existing = new CraftingStation();
        existing.setId(9L);
        existing.setItemId(33L);

        RecipeStation legacyReference = new RecipeStation();
        legacyReference.setId(11L);
        legacyReference.setRecipeId(22L);
        legacyReference.setStationItemId(33L);

        when(craftingStationMapper.selectById(9L)).thenReturn(existing);
        when(recipeStationMapper.selectCount(any())).thenReturn(0L);
        when(recipeStationMapper.selectList(any())).thenReturn(List.of(), List.of(legacyReference), List.of(), List.of(), List.of());

        mockMvc.perform(delete("/admin/crafting-stations/9"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("crafting station is still referenced by recipes"));
    }
}

package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.entity.Category;
import com.terraria.skills.entity.Npc;
import com.terraria.skills.mapper.BossGroupMapper;
import com.terraria.skills.mapper.CategoryMapper;
import com.terraria.skills.mapper.NpcMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.hamcrest.Matchers.hasSize;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AdminNpcControllerTest {

    @Mock
    private NpcMapper npcMapper;

    @Mock
    private CategoryMapper categoryMapper;

    @Mock
    private BossGroupMapper bossGroupMapper;

    @Mock
    private JdbcTemplate jdbcTemplate;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        AdminNpcController adminNpcController = new AdminNpcController(
            npcMapper,
            categoryMapper,
            bossGroupMapper,
            jdbcTemplate,
            new ObjectMapper()
        );
        mockMvc = MockMvcBuilders.standaloneSetup(adminNpcController)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldPreferNpcChineseNameInListPayload() throws Exception {
        Npc npc = new Npc();
        npc.setId(1L);
        npc.setGameId(-65L);
        npc.setInternalName("BigHornetStingy");
        npc.setName("Hornet");
        npc.setNameZh("黄蜂");
        npc.setSubName("Hornet");
        npc.setSubNameZh("大毒刺黄蜂");
        npc.setCategoryId(69L);
        npc.setStatus(1);

        Category category = new Category();
        category.setId(69L);
        category.setCode("CATEGORY_NPC_ENEMY");
        category.setName("敌方NPC");

        Page<Npc> page = new Page<>(1, 20);
        page.setTotal(1);
        page.setRecords(List.of(npc));

        when(npcMapper.selectPage(any(Page.class), any())).thenReturn(page);
        when(categoryMapper.selectBatchIds(any())).thenReturn(List.of(category));

        mockMvc.perform(get("/admin/npcs").param("page", "1").param("limit", "20"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].name").value("Hornet"))
            .andExpect(jsonPath("$.data[0].nameZh").value("黄蜂"))
            .andExpect(jsonPath("$.data[0].subNameZh").value("大毒刺黄蜂"))
            .andExpect(jsonPath("$.data[0].categoryName").value("敌方NPC"))
            .andExpect(jsonPath("$.data[0].categoryCode").value("CATEGORY_NPC_ENEMY"));

        ArgumentCaptor<Page<Npc>> pageCaptor = ArgumentCaptor.forClass(Page.class);
        verify(npcMapper).selectPage(pageCaptor.capture(), any());
        assertTrue(pageCaptor.getValue().getSize() == 20);
    }

    @Test
    void shouldAcceptNpcCategoryFilter() throws Exception {
        Page<Npc> page = new Page<>(1, 20);
        page.setTotal(0);
        page.setRecords(List.of());

        when(npcMapper.selectPage(any(Page.class), any())).thenReturn(page);

        mockMvc.perform(get("/admin/npcs").param("categoryId", "69"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    void shouldFallbackDerivedLootLookupToNpcNameWhenSourceRefIdMissing() throws Exception {
        Npc npc = new Npc();
        npc.setId(67L);
        npc.setGameId(1L);
        npc.setInternalName("BlueSlime");
        npc.setName("Blue Slime");
        npc.setNameZh("蓝史莱姆");
        npc.setStatus(1);

        when(npcMapper.selectById(67L)).thenReturn(npc);
        when(jdbcTemplate.queryForObject(
            contains("FROM npc_loot_entries"),
            eq(Integer.class),
            eq(67L)
        )).thenReturn(0);
        when(jdbcTemplate.queryForObject(
            contains("FROM npc_buff_relations"),
            eq(Integer.class),
            eq(67L)
        )).thenReturn(0);
        when(jdbcTemplate.queryForObject(
            contains("FROM npc_shop_entries"),
            eq(Integer.class),
            eq(67L)
        )).thenReturn(0);
        when(jdbcTemplate.queryForObject(
            contains("source_ref_id = ?"),
            eq(Integer.class),
            eq(1L)
        )).thenReturn(0);
        when(jdbcTemplate.queryForObject(
            contains("LOWER(TRIM(source_ref_name)) = LOWER(TRIM(?))"),
            eq(Integer.class),
            eq("Blue Slime")
        )).thenReturn(2);
        when(jdbcTemplate.queryForList(
            contains("FROM npc_loot_entries nle"),
            eq(67L)
        )).thenReturn(List.of());
        when(jdbcTemplate.queryForList(
            contains("source_ref_id IS NULL"),
            eq("Blue Slime")
        )).thenReturn(List.of(
            Map.of(
                "itemId", 12L,
                "sourceRefName", "Blue Slime",
                "itemName", "Gel",
                "itemNameZh", "凝胶"
            ),
            Map.of(
                "itemId", 535L,
                "sourceRefName", "Blue Slime",
                "itemName", "Slime Staff",
                "itemNameZh", "史莱姆法杖"
            )
        ));
        when(jdbcTemplate.queryForList(
            contains("FROM npc_buff_relations"),
            eq(67L)
        )).thenReturn(List.of());
        when(jdbcTemplate.queryForList(
            contains("FROM npc_shop_entries"),
            eq(67L)
        )).thenReturn(List.of());

        mockMvc.perform(get("/admin/npcs/67"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.derivedLootEntryCount").value(2))
            .andExpect(jsonPath("$.data.derivedLootEntries", hasSize(2)))
            .andExpect(jsonPath("$.data.derivedLootEntries[0].sourceRefName").value("Blue Slime"));
    }

    @Test
    void shouldReturnTownNpcEditorDetailWithFrozenMaintenanceFields() throws Exception {
        Npc npc = new Npc();
        npc.setId(7L);
        npc.setGameId(22L);
        npc.setInternalName("Guide");
        npc.setName("Guide");
        npc.setNameZh("Guide Zh");
        npc.setGamePeriodId(3L);
        npc.setBehaviorNotes("Offers advice to new players.");
        npc.setIsTownNpc(true);
        npc.setStatus(1);

        when(npcMapper.selectById(7L)).thenReturn(npc);
        when(jdbcTemplate.queryForObject(contains("FROM npc_loot_entries"), eq(Integer.class), eq(7L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM npc_buff_relations"), eq(Integer.class), eq(7L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM npc_shop_entries"), eq(Integer.class), eq(7L))).thenReturn(1);
        when(jdbcTemplate.queryForObject(contains("source_ref_id = ?"), eq(Integer.class), eq(22L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(
            contains("LOWER(TRIM(source_ref_name)) = LOWER(TRIM(?))"),
            eq(Integer.class),
            eq("Guide")
        )).thenReturn(0);
        when(jdbcTemplate.queryForList(contains("FROM npc_loot_entries nle"), eq(7L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("source_ref_id IS NULL"), eq("Guide"))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_buff_relations"), eq(7L))).thenReturn(List.of());
        Map<String, Object> shopEntry = new LinkedHashMap<>();
        shopEntry.put("id", 21L);
        shopEntry.put("itemId", 8L);
        shopEntry.put("itemName", "Torch");
        shopEntry.put("priceText", "50 copper");
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_entries nse"), eq(7L))).thenReturn(List.of(shopEntry));
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_conditions"), eq(21L))).thenReturn(List.of());

        mockMvc.perform(get("/admin/npcs/7").accept(APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.gamePeriodId").value(3))
            .andExpect(jsonPath("$.data.behaviorNotes").value("Offers advice to new players."))
            .andExpect(jsonPath("$.data.shopEntries", hasSize(1)))
            .andExpect(jsonPath("$.data.shopEntries[0].itemName").value("Torch"));
    }

    @Test
    void shouldRoundTripTownNpcMaintenanceFieldsOnUpdate() throws Exception {
        Npc existing = new Npc();
        existing.setId(7L);
        existing.setGameId(22L);
        existing.setInternalName("Guide");
        existing.setName("Guide");
        existing.setNameZh("Guide Zh");
        existing.setGamePeriodId(1L);
        existing.setBehaviorNotes("Old behavior notes.");
        existing.setIsTownNpc(true);
        existing.setStatus(1);

        Npc updated = new Npc();
        updated.setId(7L);
        updated.setGameId(22L);
        updated.setInternalName("Guide");
        updated.setName("Guide");
        updated.setNameZh("Guide Zh");
        updated.setGamePeriodId(3L);
        updated.setBehaviorNotes("Updated maintenance notes.");
        updated.setIsTownNpc(true);
        updated.setStatus(1);

        when(npcMapper.selectById(7L)).thenReturn(existing, updated);
        when(npcMapper.selectCount(any())).thenReturn(0L);
        when(jdbcTemplate.queryForList("SELECT id FROM npc_shop_entries WHERE npc_id = ?", 7L)).thenReturn(List.of());
        when(jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class)).thenReturn(99L);

        when(jdbcTemplate.queryForObject(contains("FROM npc_loot_entries"), eq(Integer.class), eq(7L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM npc_buff_relations"), eq(Integer.class), eq(7L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM npc_shop_entries"), eq(Integer.class), eq(7L))).thenReturn(1);
        when(jdbcTemplate.queryForObject(contains("source_ref_id = ?"), eq(Integer.class), eq(22L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(
            contains("LOWER(TRIM(source_ref_name)) = LOWER(TRIM(?))"),
            eq(Integer.class),
            eq("Guide")
        )).thenReturn(0);
        when(jdbcTemplate.queryForList(contains("FROM npc_loot_entries nle"), eq(7L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("source_ref_id IS NULL"), eq("Guide"))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_buff_relations"), eq(7L))).thenReturn(List.of());
        Map<String, Object> updatedShopEntry = new LinkedHashMap<>();
        updatedShopEntry.put("id", 99L);
        updatedShopEntry.put("itemId", 8L);
        updatedShopEntry.put("itemName", "Torch");
        updatedShopEntry.put("priceText", "50 copper");
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_entries nse"), eq(7L))).thenReturn(List.of(updatedShopEntry));
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_conditions"), eq(99L))).thenReturn(List.of());

        mockMvc.perform(put("/admin/npcs/7")
                .contentType(APPLICATION_JSON)
                .content("""
                    {
                      "gamePeriodId": 3,
                      "behaviorNotes": "Updated maintenance notes.",
                      "shopEntries": [
                        {
                          "itemId": 8,
                          "priceText": "50 copper",
                          "notes": "starter"
                        }
                      ]
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.gamePeriodId").value(3))
            .andExpect(jsonPath("$.data.behaviorNotes").value("Updated maintenance notes."))
            .andExpect(jsonPath("$.data.shopEntries", hasSize(1)))
            .andExpect(jsonPath("$.data.shopEntries[0].itemName").value("Torch"));
    }

    @Test
    void shouldReportTownNpcShopMutationSummaryOnUpdate() throws Exception {
        Npc existing = new Npc();
        existing.setId(7L);
        existing.setGameId(22L);
        existing.setInternalName("Guide");
        existing.setName("Guide");
        existing.setNameZh("Guide Zh");
        existing.setGamePeriodId(1L);
        existing.setBehaviorNotes("Old behavior notes.");
        existing.setIsTownNpc(true);
        existing.setStatus(1);

        Npc updated = new Npc();
        updated.setId(7L);
        updated.setGameId(22L);
        updated.setInternalName("Guide");
        updated.setName("Guide");
        updated.setNameZh("Guide Zh");
        updated.setGamePeriodId(3L);
        updated.setBehaviorNotes("Updated maintenance notes.");
        updated.setIsTownNpc(true);
        updated.setStatus(1);

        when(npcMapper.selectById(7L)).thenReturn(existing, updated);
        when(npcMapper.selectCount(any())).thenReturn(0L);
        when(jdbcTemplate.queryForList("SELECT id FROM npc_shop_entries WHERE npc_id = ?", 7L)).thenReturn(List.of(
            Map.of("id", 21L),
            Map.of("id", 22L)
        ));
        when(jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class)).thenReturn(121L, 122L);

        when(jdbcTemplate.queryForObject(contains("FROM npc_loot_entries"), eq(Integer.class), eq(7L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM npc_buff_relations"), eq(Integer.class), eq(7L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM npc_shop_entries"), eq(Integer.class), eq(7L))).thenReturn(2);
        when(jdbcTemplate.queryForObject(contains("source_ref_id = ?"), eq(Integer.class), eq(22L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(
            contains("LOWER(TRIM(source_ref_name)) = LOWER(TRIM(?))"),
            eq(Integer.class),
            eq("Guide")
        )).thenReturn(0);
        when(jdbcTemplate.queryForList(contains("FROM npc_loot_entries nle"), eq(7L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("source_ref_id IS NULL"), eq("Guide"))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_buff_relations"), eq(7L))).thenReturn(List.of());

        Map<String, Object> persistedEntry = new LinkedHashMap<>();
        persistedEntry.put("id", 121L);
        persistedEntry.put("itemId", 8L);
        persistedEntry.put("itemName", "Torch");
        persistedEntry.put("priceText", "50 copper");

        Map<String, Object> insertedEntry = new LinkedHashMap<>();
        insertedEntry.put("id", 122L);
        insertedEntry.put("itemId", 9L);
        insertedEntry.put("itemName", "Rope");
        insertedEntry.put("priceText", "25 copper");

        when(jdbcTemplate.queryForList(contains("FROM npc_shop_entries nse"), eq(7L))).thenReturn(List.of(persistedEntry, insertedEntry));
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_conditions"), eq(121L), eq(122L))).thenReturn(List.of());

        mockMvc.perform(put("/admin/npcs/7")
                .contentType(APPLICATION_JSON)
                .content("""
                    {
                      "gamePeriodId": 3,
                      "behaviorNotes": "Updated maintenance notes.",
                      "shopEntries": [
                        {
                          "id": 21,
                          "itemId": 8,
                          "priceText": "50 copper",
                          "notes": "starter"
                        },
                        {
                          "itemId": 9,
                          "priceText": "25 copper"
                        },
                        {
                          "notes": "missing item binding"
                        }
                      ]
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.shopMutationSummary.submittedCount").value(3))
            .andExpect(jsonPath("$.data.shopMutationSummary.persistedCount").value(2))
            .andExpect(jsonPath("$.data.shopMutationSummary.replacedCount").value(1))
            .andExpect(jsonPath("$.data.shopMutationSummary.insertedCount").value(1))
            .andExpect(jsonPath("$.data.shopMutationSummary.skippedCount").value(1))
            .andExpect(jsonPath("$.data.shopMutationSummary.removedCount").value(1));
    }
}

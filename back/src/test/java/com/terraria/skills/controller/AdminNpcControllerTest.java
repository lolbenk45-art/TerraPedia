package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.entity.Category;
import com.terraria.skills.entity.Npc;
import com.terraria.skills.mapper.BossGroupMapper;
import com.terraria.skills.mapper.CategoryMapper;
import com.terraria.skills.mapper.NpcMapper;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.hamcrest.Matchers.hasSize;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AdminNpcControllerTest {

    private static final String CDN_BUFF_IMAGE_URL = "https://cdn.example.com/terrapedia-images/buffs/wiki/ab/sharpened.png";

    private static final ManagedImageUrlPolicy MANAGED_IMAGE_URL_POLICY = new ManagedImageUrlPolicy() {
        @Override
        public boolean isManagedImageUrl(String value) {
            return value != null && (
                value.startsWith("http://localhost:9000/terrapedia-images/")
                    || value.startsWith("https://cdn.example.com/terrapedia-images/")
            );
        }

        @Override
        public List<String> trustedManagedImageUrlPrefixes() {
            return List.of(
                "http://localhost:9000/terrapedia-images/items/",
                "http://localhost:9000/terrapedia-images/npcs/",
                "http://localhost:9000/terrapedia-images/buffs/",
                "https://cdn.example.com/terrapedia-images/buffs/"
            );
        }
    };

    @Mock
    private NpcMapper npcMapper;

    @Mock
    private CategoryMapper categoryMapper;

    @Mock
    private BossGroupMapper bossGroupMapper;

    @Mock
    private JdbcTemplate jdbcTemplate;

    private AdminNpcController adminNpcController;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        adminNpcController = new AdminNpcController(
            npcMapper,
            categoryMapper,
            bossGroupMapper,
            jdbcTemplate,
            new ObjectMapper(),
            MANAGED_IMAGE_URL_POLICY
        );
        mockMvc = MockMvcBuilders.standaloneSetup(adminNpcController)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
        lenient().when(jdbcTemplate.queryForList(contains("canonical_npc.name"), any(Object[].class))).thenReturn(List.of());
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
    void shouldFallbackToGeneratedNpcZhMapWhenDatabaseChineseNameIsMissing() throws Exception {
        Npc npc = new Npc();
        npc.setId(222L);
        npc.setGameId(222L);
        npc.setInternalName("QueenBee");
        npc.setName("Queen Bee");
        npc.setStatus(1);

        Page<Npc> page = new Page<>(1, 20);
        page.setTotal(1);
        page.setRecords(List.of(npc));

        when(npcMapper.selectPage(any(Page.class), any())).thenReturn(page);

        mockMvc.perform(get("/admin/npcs").param("page", "1").param("limit", "20"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].name").value("Queen Bee"))
            .andExpect(jsonPath("$.data[0].nameZh").value("蜂王"));
    }

    @Test
    void shouldSearchNpcByGeneratedChineseNameFallback() throws Exception {
        Page<Npc> page = new Page<>(1, 20);
        page.setTotal(0);
        page.setRecords(List.of());

        when(npcMapper.selectPage(any(Page.class), any())).thenReturn(page);

        mockMvc.perform(get("/admin/npcs").param("search", "蜂王"))
            .andExpect(status().isOk());

        @SuppressWarnings("unchecked")
        List<String> matches = ReflectionTestUtils.invokeMethod(adminNpcController, "findNpcZhInternalNameMatches", "蜂王");
        assertTrue(matches != null && matches.contains("QueenBee"),
            "Chinese search should resolve generated zh map matches to NPC internal names");
    }

    @Test
    void shouldSearchNpcByNpcIdRowImagesGeneratedSource() throws Exception {
        Path tempRoot = Files.createTempDirectory("npc-id-row-images-source");
        Path generatedDir = tempRoot.resolve("data").resolve("generated");
        Files.createDirectories(generatedDir);
        Files.writeString(generatedDir.resolve("npc-id-row-images.json"), """
            {
              "records": [
                {
                  "id": 4,
                  "gameId": 4,
                  "internalName": "EyeofCthulhu",
                  "nameZh": "克苏鲁之眼",
                  "subNameZh": "第一阶段"
                }
              ]
            }
            """);

        String previousUserDir = System.getProperty("user.dir");
        try {
            System.setProperty("user.dir", tempRoot.toString());
            ReflectionTestUtils.setField(adminNpcController, "npcZhNameCache", null);

            @SuppressWarnings("unchecked")
            List<String> matches = ReflectionTestUtils.invokeMethod(adminNpcController, "findNpcZhInternalNameMatches", "克苏鲁");

            assertTrue(matches != null && matches.contains("EyeofCthulhu"),
                "Chinese search should load NPC_ID generated rows when DB zh fields are empty");
        } finally {
            System.setProperty("user.dir", previousUserDir);
            ReflectionTestUtils.setField(adminNpcController, "npcZhNameCache", null);
        }
    }

    @Test
    void shouldFallbackToStrippedVariantChineseNameWhenDirectInternalNameIsMissing() throws Exception {
        Npc npc = new Npc();
        npc.setId(650L);
        npc.setGameId(-65L);
        npc.setInternalName("BigHornetStingy");
        npc.setName("Hornet");
        npc.setStatus(1);

        Page<Npc> page = new Page<>(1, 20);
        page.setTotal(1);
        page.setRecords(List.of(npc));

        ReflectionTestUtils.setField(
            adminNpcController,
            "npcZhNameCache",
            timedNpcZhNameCache(Map.of("Hornet", List.of("Hornet", "黄蜂", "毒刺黄蜂")))
        );
        when(npcMapper.selectPage(any(Page.class), any())).thenReturn(page);

        mockMvc.perform(get("/admin/npcs").param("page", "1").param("limit", "20"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].nameZh").value("黄蜂"))
            .andExpect(jsonPath("$.data[0].subNameZh").value("毒刺黄蜂"));
    }

    @Test
    void shouldSearchVariantNpcByStrippedGeneratedChineseName() throws Exception {
        Path tempRoot = Files.createTempDirectory("npc-variant-zh-search");
        Path generatedDir = tempRoot.resolve("data").resolve("generated");
        Path standardizedDir = tempRoot.resolve("data").resolve("standardized");
        Files.createDirectories(generatedDir);
        Files.createDirectories(standardizedDir);
        Files.writeString(generatedDir.resolve("npc-id-row-images.json"), """
            {
              "records": [
                {
                  "id": 235,
                  "gameId": 235,
                  "internalName": "Hornet",
                  "nameZh": "黄蜂",
                  "subNameZh": "毒刺黄蜂"
                }
              ]
            }
            """);
        Files.writeString(standardizedDir.resolve("npcs.standardized.json"), """
            {
              "records": [
                { "id": -65, "internalName": "BigHornetStingy", "name": "Hornet" }
              ]
            }
            """);

        String previousUserDir = System.getProperty("user.dir");
        try {
            System.setProperty("user.dir", tempRoot.toString());
            ReflectionTestUtils.setField(adminNpcController, "npcZhNameCache", null);

            @SuppressWarnings("unchecked")
            List<String> matches = ReflectionTestUtils.invokeMethod(adminNpcController, "findNpcZhInternalNameMatches", "黄蜂");

            assertTrue(matches != null && matches.contains("BigHornetStingy"),
                "Chinese search should include variant NPCs that display a stripped generated zh name");
        } finally {
            System.setProperty("user.dir", previousUserDir);
            ReflectionTestUtils.setField(adminNpcController, "npcZhNameCache", null);
        }
    }

    @Test
    void shouldSearchVariantNpcWhenBaseChineseNameComesFromGeneratedMap() throws Exception {
        Path tempRoot = Files.createTempDirectory("npc-variant-zh-map-search");
        Path generatedDir = tempRoot.resolve("data").resolve("generated");
        Path standardizedDir = tempRoot.resolve("data").resolve("standardized");
        Files.createDirectories(generatedDir);
        Files.createDirectories(standardizedDir);
        Files.writeString(generatedDir.resolve("npc-zh-map.json"), """
            {
              "records": {
                "Hornet": {
                  "internalName": "Hornet",
                  "nameZh": "黄蜂",
                  "subNameZh": "毒刺黄蜂"
                }
              }
            }
            """);
        Files.writeString(standardizedDir.resolve("npcs.standardized.json"), """
            {
              "records": [
                { "id": -65, "internalName": "BigHornetStingy", "name": "Hornet" }
              ]
            }
            """);

        String previousUserDir = System.getProperty("user.dir");
        try {
            System.setProperty("user.dir", tempRoot.toString());
            ReflectionTestUtils.setField(adminNpcController, "npcZhNameCache", null);

            @SuppressWarnings("unchecked")
            List<String> matches = ReflectionTestUtils.invokeMethod(adminNpcController, "findNpcZhInternalNameMatches", "黄蜂");

            assertTrue(matches != null && matches.contains("BigHornetStingy"),
                "Chinese search should include variant NPCs after all generated zh sources are merged");
        } finally {
            System.setProperty("user.dir", previousUserDir);
            ReflectionTestUtils.setField(adminNpcController, "npcZhNameCache", null);
        }
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
    void shouldSuppressNpcWikiImageUrlColumnInDisplayPayload() throws Exception {
        Npc npc = new Npc();
        npc.setId(1L);
        npc.setGameId(-650999L);
        npc.setInternalName("BigHornetStingy");
        npc.setName("Hornet");
        npc.setImageUrl("https://terraria.wiki.gg/images/Stingy%20Hornet.gif");
        npc.setStatus(1);

        when(npcMapper.selectById(1L)).thenReturn(npc);
        when(jdbcTemplate.queryForObject(
            contains("FROM npc_loot_entries"),
            eq(Integer.class),
            eq(1L)
        )).thenReturn(0);
        when(jdbcTemplate.queryForObject(
            contains("FROM npc_buff_relations"),
            eq(Integer.class),
            eq(1L)
        )).thenReturn(0);
        when(jdbcTemplate.queryForObject(
            contains("FROM npc_shop_entries"),
            eq(Integer.class),
            eq(1L)
        )).thenReturn(0);
        when(jdbcTemplate.queryForObject(
            contains("source_ref_id = ?"),
            eq(Integer.class),
            eq(-650999L)
        )).thenReturn(0);
        when(jdbcTemplate.queryForObject(
            contains("LOWER(TRIM(source_ref_name)) = LOWER(TRIM(?))"),
            eq(Integer.class),
            eq("Hornet")
        )).thenReturn(0);
        when(jdbcTemplate.queryForList(contains("FROM npc_loot_entries nle"), eq(1L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("source_ref_id IS NULL"), eq("Hornet"))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_buff_relations"), eq(1L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_entries nse"), eq(1L))).thenReturn(List.of());

        mockMvc.perform(get("/admin/npcs/1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.imageUrl").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void shouldReturnManagedNpcImageUrlInDisplayPayload() throws Exception {
        Npc npc = new Npc();
        npc.setId(2L);
        npc.setGameId(-66L);
        npc.setInternalName("ManagedHornet");
        npc.setName("Managed Hornet");
        npc.setImageUrl("http://localhost:9000/terrapedia-images/npcs/managed-hornet.gif");
        npc.setStatus(1);

        when(npcMapper.selectById(2L)).thenReturn(npc);
        when(jdbcTemplate.queryForObject(contains("FROM npc_loot_entries"), eq(Integer.class), eq(2L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM npc_buff_relations"), eq(Integer.class), eq(2L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM npc_shop_entries"), eq(Integer.class), eq(2L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("source_ref_id = ?"), eq(Integer.class), eq(-66L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(
            contains("LOWER(TRIM(source_ref_name)) = LOWER(TRIM(?))"),
            eq(Integer.class),
            eq("Managed Hornet")
        )).thenReturn(0);
        when(jdbcTemplate.queryForList(contains("FROM npc_loot_entries nle"), eq(2L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("source_ref_id IS NULL"), eq("Managed Hornet"))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_buff_relations"), eq(2L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_entries nse"), eq(2L))).thenReturn(List.of());

        mockMvc.perform(get("/admin/npcs/2"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.imageUrl").value("http://localhost:9000/terrapedia-images/npcs/managed-hornet.gif"));
    }

    @Test
    void shouldReturnManagedLootItemImagesFromItemImageCacheInDetailPayload() throws Exception {
        Npc npc = new Npc();
        npc.setId(253L);
        npc.setGameId(253L);
        npc.setInternalName("Reaper");
        npc.setName("Reaper");
        npc.setStatus(1);

        String managedImage = "http://localhost:9000/terrapedia-images/items/wiki/items/de/death-sickle.png";
        Map<String, Object> lootEntry = new LinkedHashMap<>();
        lootEntry.put("id", 91L);
        lootEntry.put("itemId", 1327L);
        lootEntry.put("dropSourceKind", "npc_drop");
        lootEntry.put("itemName", "Death Sickle");
        lootEntry.put("itemInternalName", "DeathSickle");
        lootEntry.put("itemImage", managedImage);

        when(npcMapper.selectById(253L)).thenReturn(npc);
        when(jdbcTemplate.queryForObject(contains("FROM npc_loot_entries"), eq(Integer.class), eq(253L))).thenReturn(1);
        when(jdbcTemplate.queryForObject(contains("FROM npc_buff_relations"), eq(Integer.class), eq(253L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM npc_shop_entries"), eq(Integer.class), eq(253L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("source_ref_id = ?"), eq(Integer.class), eq(253L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(
            contains("LOWER(TRIM(source_ref_name)) = LOWER(TRIM(?))"),
            eq(Integer.class),
            eq("Reaper")
        )).thenReturn(0);
        when(jdbcTemplate.queryForList(contains("FROM npc_loot_entries nle"), eq(253L))).thenReturn(List.of(lootEntry));
        when(jdbcTemplate.queryForList(contains("source_ref_id IS NULL"), eq("Reaper"))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_buff_relations"), eq(253L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_entries nse"), eq(253L))).thenReturn(List.of());

        mockMvc.perform(get("/admin/npcs/253"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.lootEntries[0].itemName").value("Death Sickle"))
            .andExpect(jsonPath("$.data.lootEntries[0].itemImage").value(managedImage));

        ArgumentCaptor<String> queryCaptor = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate, atLeastOnce()).queryForList(queryCaptor.capture(), eq(253L));
        assertTrue(queryCaptor.getAllValues().stream().anyMatch(sql ->
            sql.contains("FROM npc_loot_entries nle")
                && sql.contains("item_images ii")
                && sql.contains("ii.cached_url")
                && sql.contains("AS itemImage")
        ));
    }

    @Test
    void shouldReturnManagedNpcImageUrlFromSupplementTopLevelSnakeCaseInDetailPayload() throws Exception {
        Npc npc = new Npc();
        npc.setId(3L);
        npc.setGameId(-67L);
        npc.setInternalName("SnakeCaseHornet");
        npc.setName("Snake Case Hornet");
        npc.setImageUrl("https://terraria.wiki.gg/images/Snake%20Case%20Hornet.gif");
        npc.setStatus(1);

        Map<String, Object> supplement = new LinkedHashMap<>();
        supplement.put("image_url", "http://localhost:9000/terrapedia-images/npcs/snake-case-hornet.gif");
        ReflectionTestUtils.setField(
            adminNpcController,
            "npcSupplementCache",
            timedNpcSupplementCache(Map.of(-67L, npcSupplementFromGeneratedRecord(supplement)))
        );

        when(npcMapper.selectById(3L)).thenReturn(npc);
        when(jdbcTemplate.queryForObject(contains("FROM npc_loot_entries"), eq(Integer.class), eq(3L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM npc_buff_relations"), eq(Integer.class), eq(3L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM npc_shop_entries"), eq(Integer.class), eq(3L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("source_ref_id = ?"), eq(Integer.class), eq(-67L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(
            contains("LOWER(TRIM(source_ref_name)) = LOWER(TRIM(?))"),
            eq(Integer.class),
            eq("Snake Case Hornet")
        )).thenReturn(0);
        when(jdbcTemplate.queryForList(contains("FROM npc_loot_entries nle"), eq(3L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("source_ref_id IS NULL"), eq("Snake Case Hornet"))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_buff_relations"), eq(3L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_entries nse"), eq(3L))).thenReturn(List.of());

        mockMvc.perform(get("/admin/npcs/3"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.imageUrl").value("http://localhost:9000/terrapedia-images/npcs/snake-case-hornet.gif"));
    }

    @Test
    void shouldFallbackToManagedRawJsonImageWhenEarlierSupplementImagesAreWikiUrls() throws Exception {
        Npc npc = new Npc();
        npc.setId(4L);
        npc.setGameId(-68L);
        npc.setInternalName("MixedHornet");
        npc.setName("Mixed Hornet");
        npc.setImageUrl("https://terraria.wiki.gg/images/Mixed%20Hornet.gif");
        npc.setStatus(1);

        Map<String, Object> supplement = new LinkedHashMap<>();
        supplement.put("imageUrl", "https://terraria.wiki.gg/images/Mixed%20Hornet%20Supplement.gif");
        supplement.put("rawJson", """
            {
              "image_url": "http://localhost:9000/terrapedia-images/npcs/mixed-hornet.gif"
            }
            """);
        ReflectionTestUtils.setField(
            adminNpcController,
            "npcSupplementCache",
            timedNpcSupplementCache(Map.of(-68L, npcSupplementFromGeneratedRecord(supplement)))
        );

        when(npcMapper.selectById(4L)).thenReturn(npc);
        when(jdbcTemplate.queryForObject(contains("FROM npc_loot_entries"), eq(Integer.class), eq(4L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM npc_buff_relations"), eq(Integer.class), eq(4L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM npc_shop_entries"), eq(Integer.class), eq(4L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("source_ref_id = ?"), eq(Integer.class), eq(-68L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(
            contains("LOWER(TRIM(source_ref_name)) = LOWER(TRIM(?))"),
            eq(Integer.class),
            eq("Mixed Hornet")
        )).thenReturn(0);
        when(jdbcTemplate.queryForList(contains("FROM npc_loot_entries nle"), eq(4L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("source_ref_id IS NULL"), eq("Mixed Hornet"))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_buff_relations"), eq(4L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_entries nse"), eq(4L))).thenReturn(List.of());

        mockMvc.perform(get("/admin/npcs/4"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.imageUrl").value("http://localhost:9000/terrapedia-images/npcs/mixed-hornet.gif"));
    }

    @Test
    void shouldSuppressWikiRawJsonImageUrlFromSupplementInDetailPayload() throws Exception {
        Npc npc = new Npc();
        npc.setId(5L);
        npc.setGameId(-69L);
        npc.setInternalName("WikiOnlyHornet");
        npc.setName("Wiki Only Hornet");
        npc.setStatus(1);

        Map<String, Object> supplement = new LinkedHashMap<>();
        supplement.put("rawJson", "{\"image_url\":\"https://terraria.wiki.gg/images/Wiki%20Only%20Hornet.gif\"}");
        ReflectionTestUtils.setField(
            adminNpcController,
            "npcSupplementCache",
            timedNpcSupplementCache(Map.of(-69L, npcSupplementFromGeneratedRecord(supplement)))
        );

        when(npcMapper.selectById(5L)).thenReturn(npc);
        when(jdbcTemplate.queryForObject(contains("FROM npc_loot_entries"), eq(Integer.class), eq(5L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM npc_buff_relations"), eq(Integer.class), eq(5L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM npc_shop_entries"), eq(Integer.class), eq(5L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("source_ref_id = ?"), eq(Integer.class), eq(-69L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(
            contains("LOWER(TRIM(source_ref_name)) = LOWER(TRIM(?))"),
            eq(Integer.class),
            eq("Wiki Only Hornet")
        )).thenReturn(0);
        when(jdbcTemplate.queryForList(contains("FROM npc_loot_entries nle"), eq(5L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("source_ref_id IS NULL"), eq("Wiki Only Hornet"))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_buff_relations"), eq(5L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_entries nse"), eq(5L))).thenReturn(List.of());

        mockMvc.perform(get("/admin/npcs/5"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.imageUrl").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void shouldReturnBuffTypeInNpcBuffRelations() throws Exception {
        Npc npc = new Npc();
        npc.setId(480L);
        npc.setGameId(480L);
        npc.setInternalName("Medusa");
        npc.setName("Medusa");
        npc.setStatus(1);

        when(npcMapper.selectById(480L)).thenReturn(npc);
        when(jdbcTemplate.queryForObject(contains("FROM npc_loot_entries"), eq(Integer.class), eq(480L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM npc_buff_relations"), eq(Integer.class), eq(480L))).thenReturn(1);
        when(jdbcTemplate.queryForObject(contains("FROM npc_shop_entries"), eq(Integer.class), eq(480L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("source_ref_id = ?"), eq(Integer.class), eq(480L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(
            contains("LOWER(TRIM(source_ref_name)) = LOWER(TRIM(?))"),
            eq(Integer.class),
            eq("Medusa")
        )).thenReturn(0);
        when(jdbcTemplate.queryForList(contains("FROM npc_loot_entries nle"), eq(480L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("source_ref_id IS NULL"), eq("Medusa"))).thenReturn(List.of());
        Map<String, Object> buffRelation = new LinkedHashMap<>();
        buffRelation.put("id", 201L);
        buffRelation.put("buffId", 156L);
        buffRelation.put("buffSourceId", 156);
        buffRelation.put("relationType", "inflicts");
        buffRelation.put("notes", "[auto:wiki-crawler-npc-infobox] page=Medusa; duration={{duration|rawseconds=1-4}}");
        buffRelation.put("buffInternalName", "Stoned");
        buffRelation.put("buffNameEn", "Stoned");
        buffRelation.put("buffNameZh", "Stoned");
        buffRelation.put("buffType", "debuff");
        buffRelation.put("buffImage", "https://terraria.wiki.gg/images/Stoned.png");
        when(jdbcTemplate.queryForList(contains("FROM npc_buff_relations"), eq(480L))).thenReturn(List.of(buffRelation));
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_entries nse"), eq(480L))).thenReturn(List.of());

        mockMvc.perform(get("/admin/npcs/480"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.buffRelations[0].buffType").value("debuff"))
            .andExpect(jsonPath("$.data.buffRelations[0].buffNameEn").value("Stoned"));

        ArgumentCaptor<String> queryCaptor = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate, atLeastOnce()).queryForList(queryCaptor.capture(), eq(480L));
        assertTrue(queryCaptor.getAllValues().stream()
            .filter(sql -> sql.contains("FROM npc_buff_relations"))
            .anyMatch(sql -> sql.contains("b.buff_type AS buffType")));
        assertTrue(queryCaptor.getAllValues().stream()
            .filter(sql -> sql.contains("FROM npc_buff_relations"))
            .anyMatch(sql -> sql.contains("b.image_cached_url") && sql.contains("AS buffImage")));
    }

    @Test
    void shouldAllowConfiguredCdnBuffImagesInNpcDetailPayload() throws Exception {
        Npc npc = new Npc();
        npc.setId(481L);
        npc.setGameId(481L);
        npc.setInternalName("Merchant");
        npc.setName("Merchant");
        npc.setStatus(1);

        when(npcMapper.selectById(481L)).thenReturn(npc);
        when(jdbcTemplate.queryForObject(contains("FROM npc_loot_entries"), eq(Integer.class), eq(481L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM npc_buff_relations"), eq(Integer.class), eq(481L))).thenReturn(1);
        when(jdbcTemplate.queryForObject(contains("FROM npc_shop_entries"), eq(Integer.class), eq(481L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("source_ref_id = ?"), eq(Integer.class), eq(481L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(
            contains("LOWER(TRIM(source_ref_name)) = LOWER(TRIM(?))"),
            eq(Integer.class),
            eq("Merchant")
        )).thenReturn(0);
        when(jdbcTemplate.queryForList(contains("FROM npc_loot_entries nle"), eq(481L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("source_ref_id IS NULL"), eq("Merchant"))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_buff_relations"), eq(481L))).thenReturn(List.of(Map.of(
            "id", 202L,
            "buffId", 156L,
            "buffSourceId", 156,
            "buffInternalName", "Sharpened",
            "buffNameEn", "Sharpened",
            "buffNameZh", "Sharpened",
            "buffType", "buff",
            "buffImage", CDN_BUFF_IMAGE_URL
        )));
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_entries nse"), eq(481L))).thenReturn(List.of());

        mockMvc.perform(get("/admin/npcs/481"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.buffRelations[0].buffImage").value(CDN_BUFF_IMAGE_URL));
    }

    @Test
    void shouldPreserveProjectionJsonStringsInAdminListPayload() throws Exception {
        String lootItemsJson = "[{\"itemId\":8,\"internalName\":\"Torch\"}]";
        String shopItemsJson = "[{\"itemId\":9,\"internalName\":\"Rope\"}]";
        String sourceItemsJson = "[{\"itemId\":930,\"internalName\":\"FlareGun\"}]";

        Npc npc = new Npc();
        npc.setId(7L);
        npc.setGameId(22L);
        npc.setInternalName("Guide");
        npc.setName("Guide");
        npc.setStatus(1);
        ReflectionTestUtils.setField(npc, "lootItemsJson", lootItemsJson);
        ReflectionTestUtils.setField(npc, "shopItemsJson", shopItemsJson);
        ReflectionTestUtils.setField(npc, "sourceItemsJson", sourceItemsJson);

        Page<Npc> page = new Page<>(1, 20);
        page.setTotal(1);
        page.setRecords(List.of(npc));

        when(npcMapper.selectPage(any(Page.class), any())).thenReturn(page);
        when(jdbcTemplate.queryForList(any(String.class), any(Object[].class))).thenReturn(List.of());

        mockMvc.perform(get("/admin/npcs"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].lootItemsJson").value(lootItemsJson))
            .andExpect(jsonPath("$.data[0].shopItemsJson").value(shopItemsJson))
            .andExpect(jsonPath("$.data[0].sourceItemsJson").value(sourceItemsJson));
    }

    @Test
    void shouldExposePrototypeLootCountsForNpcVariantRows() throws Exception {
        Npc npc = new Npc();
        npc.setId(-55L);
        npc.setGameId(-55L);
        npc.setInternalName("BigRainZombie");
        npc.setName("Zombie");
        npc.setNameZh("僵尸");
        npc.setStatus(1);
        ReflectionTestUtils.setField(npc, "npcType", 223);

        Page<Npc> page = new Page<>(1, 20);
        page.setTotal(1);
        page.setRecords(List.of(npc));

        when(npcMapper.selectPage(any(Page.class), any())).thenReturn(page);
        when(jdbcTemplate.queryForList(contains("FROM npc_loot_entries WHERE"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_buff_relations WHERE"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_entries WHERE"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM item_acquisition_sources"), any(Object[].class))).thenReturn(List.of());
        lenient().when(jdbcTemplate.queryForList(contains("variantSourceId"), any(Object[].class))).thenReturn(List.of(Map.of(
            "variantSourceId", 223L,
            "sourceNpcId", 223L,
            "sourceInternalName", "ZombieRaincoat",
            "sourceName", "Raincoat Zombie",
            "sourceNameZh", "雨衣僵尸",
            "total", 4
        )));

        mockMvc.perform(get("/admin/npcs"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].lootEntryCount").value(0))
            .andExpect(jsonPath("$.data[0].inheritedLootEntryCount").value(4))
            .andExpect(jsonPath("$.data[0].lootInheritanceSourceId").value(223))
            .andExpect(jsonPath("$.data[0].lootInheritanceInternalName").value("ZombieRaincoat"))
            .andExpect(jsonPath("$.data[0].lootInheritanceName").value("Raincoat Zombie"));
    }

    @Test
    void shouldExposeSameNameCanonicalLootForNpcSubtypeRows() throws Exception {
        Npc npc = new Npc();
        npc.setId(-65L);
        npc.setGameId(-65L);
        npc.setInternalName("BigHornetStingy");
        npc.setName("Hornet");
        npc.setNameZh("黄蜂");
        npc.setStatus(1);
        ReflectionTestUtils.setField(npc, "npcType", 235);

        when(npcMapper.selectById(-65L)).thenReturn(npc);
        when(jdbcTemplate.queryForObject(contains("FROM npc_loot_entries"), eq(Integer.class), eq(-65L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM npc_buff_relations"), eq(Integer.class), eq(-65L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM npc_shop_entries"), eq(Integer.class), eq(-65L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("source_ref_id = ?"), eq(Integer.class), eq(-65L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(
            contains("LOWER(TRIM(source_ref_name)) = LOWER(TRIM(?))"),
            eq(Integer.class),
            eq("Hornet")
        )).thenReturn(0);
        when(jdbcTemplate.queryForList(contains("FROM npc_loot_entries nle"), eq(-65L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("source_ref_id IS NULL"), eq("Hornet"))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_buff_relations"), eq(-65L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_entries nse"), eq(-65L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("n.game_id IN"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("canonical_npc.name"), any(Object[].class))).thenReturn(List.of(Map.of(
            "variantNpcId", -65L,
            "sourceNpcId", 42L,
            "sourceId", 42L,
            "sourceInternalName", "Hornet",
            "sourceName", "Hornet",
            "sourceNameZh", "黄蜂",
            "total", 2
        )));
        when(jdbcTemplate.queryForList(contains("FROM npc_loot_entries nle"), eq(42L))).thenReturn(List.of(
            Map.of(
                "itemId", 887L,
                "itemName", "Bezoar",
                "itemInternalName", "Bezoar"
            ),
            Map.of(
                "itemId", 100L,
                "itemName", "Stinger",
                "itemInternalName", "Stinger"
            )
        ));

        mockMvc.perform(get("/admin/npcs/-65"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.lootEntryCount").value(0))
            .andExpect(jsonPath("$.data.inheritedLootEntryCount").value(2))
            .andExpect(jsonPath("$.data.lootInheritanceInternalName").value("Hornet"))
            .andExpect(jsonPath("$.data.inheritedLootEntries", hasSize(2)))
            .andExpect(jsonPath("$.data.inheritedLootEntries[0].itemInternalName").value("Bezoar"))
            .andExpect(jsonPath("$.data.inheritedLootEntries[0].lootSourceMode").value("same_name"))
            .andExpect(jsonPath("$.data.inheritedLootEntries[0].trustedStructured").value(false))
            .andExpect(jsonPath("$.data.inheritedLootEntries[0].sourceNpcId").value(42))
            .andExpect(jsonPath("$.data.inheritedLootEntries[0].sourceNpcInternalName").value("Hornet"));
    }

    @Test
    void shouldExposeSameNameLootInheritanceModeInAdminDetailPayload() throws Exception {
        Npc npc = new Npc();
        npc.setId(-65L);
        npc.setGameId(-65L);
        npc.setInternalName("BigHornetStingy");
        npc.setName("Hornet");
        npc.setStatus(1);

        when(npcMapper.selectById(-65L)).thenReturn(npc);
        when(jdbcTemplate.queryForObject(contains("FROM npc_loot_entries"), eq(Integer.class), eq(-65L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM npc_buff_relations"), eq(Integer.class), eq(-65L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM npc_shop_entries"), eq(Integer.class), eq(-65L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("source_ref_id = ?"), eq(Integer.class), eq(-65L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(
            contains("LOWER(TRIM(source_ref_name)) = LOWER(TRIM(?))"),
            eq(Integer.class),
            eq("Hornet")
        )).thenReturn(0);
        when(jdbcTemplate.queryForList(contains("FROM npc_loot_entries nle"), eq(-65L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("source_ref_id IS NULL"), eq("Hornet"))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_buff_relations"), eq(-65L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_entries nse"), eq(-65L))).thenReturn(List.of());
        lenient().when(jdbcTemplate.queryForList(contains("n.game_id IN"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("canonical_npc.name"), any(Object[].class))).thenReturn(List.of(Map.of(
            "variantNpcId", -65L,
            "sourceNpcId", 42L,
            "sourceId", 42L,
            "sourceInternalName", "Hornet",
            "sourceName", "Hornet",
            "sourceNameZh", "黄蜂",
            "total", 1
        )));
        when(jdbcTemplate.queryForList(contains("FROM npc_loot_entries nle"), eq(42L))).thenReturn(List.of(Map.of(
            "itemId", 887L,
            "itemName", "Bezoar",
            "itemInternalName", "Bezoar"
        )));

        mockMvc.perform(get("/admin/npcs/-65"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.inheritedLootEntries[0].lootSourceMode").value("same_name"));
    }

    @Test
    void shouldPreserveProjectionJsonStringsInAdminDetailPayload() throws Exception {
        String lootItemsJson = "[{\"itemId\":8,\"internalName\":\"Torch\"}]";
        String shopItemsJson = "[{\"itemId\":9,\"internalName\":\"Rope\"}]";
        String sourceItemsJson = "[{\"itemId\":930,\"internalName\":\"FlareGun\"}]";

        Npc npc = new Npc();
        npc.setId(7L);
        npc.setGameId(22L);
        npc.setInternalName("Guide");
        npc.setName("Guide");
        npc.setStatus(1);
        ReflectionTestUtils.setField(npc, "lootItemsJson", lootItemsJson);
        ReflectionTestUtils.setField(npc, "shopItemsJson", shopItemsJson);
        ReflectionTestUtils.setField(npc, "sourceItemsJson", sourceItemsJson);

        when(npcMapper.selectById(7L)).thenReturn(npc);
        when(jdbcTemplate.queryForObject(contains("FROM npc_loot_entries"), eq(Integer.class), eq(7L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM npc_buff_relations"), eq(Integer.class), eq(7L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM npc_shop_entries"), eq(Integer.class), eq(7L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("source_ref_id = ?"), eq(Integer.class), eq(22L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(
            contains("LOWER(TRIM(source_ref_name)) = LOWER(TRIM(?))"),
            eq(Integer.class),
            eq("Guide")
        )).thenReturn(0);
        when(jdbcTemplate.queryForList(contains("FROM npc_loot_entries nle"), eq(7L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("source_ref_id IS NULL"), eq("Guide"))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_buff_relations"), eq(7L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_entries nse"), eq(7L))).thenReturn(List.of());

        mockMvc.perform(get("/admin/npcs/7"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.lootItemsJson").value(lootItemsJson))
            .andExpect(jsonPath("$.data.shopItemsJson").value(shopItemsJson))
            .andExpect(jsonPath("$.data.sourceItemsJson").value(sourceItemsJson));
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
            .andExpect(jsonPath("$.data.derivedLootEntries[0].sourceRefName").value("Blue Slime"))
            .andExpect(jsonPath("$.data.derivedLootEntries[0].lootSourceMode").value("derived"))
            .andExpect(jsonPath("$.data.derivedLootEntries[0].trustedStructured").value(false))
            .andExpect(jsonPath("$.data.derivedLootEntries[0].sourceNpcId").doesNotExist())
            .andExpect(jsonPath("$.data.derivedLootEntries[0].sourceNpcInternalName").doesNotExist());
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
        Map<String, Object> shopCondition = new LinkedHashMap<>();
        shopCondition.put("id", 91L);
        shopCondition.put("shopEntryId", 21L);
        shopCondition.put("refType", "GAME_PERIOD");
        shopCondition.put("refId", 2L);
        shopCondition.put("conditionRole", "required");
        shopCondition.put("gamePeriodCode", "hardmode");
        shopCondition.put("gamePeriodNameZh", "困难模式");
        shopCondition.put("gamePeriodNameEn", "Hardmode");
        Map<String, Object> itemCondition = new LinkedHashMap<>();
        itemCondition.put("id", 92L);
        itemCondition.put("shopEntryId", 21L);
        itemCondition.put("refType", "ITEM");
        itemCondition.put("refId", 930L);
        itemCondition.put("conditionRole", "required");
        itemCondition.put("refItemName", "Flare Gun");
        itemCondition.put("refItemNameZh", "信号枪");
        itemCondition.put("refItemInternalName", "FlareGun");
        Map<String, Object> conditionTerm = new LinkedHashMap<>();
        conditionTerm.put("id", 93L);
        conditionTerm.put("shopEntryId", 21L);
        conditionTerm.put("refType", "CONDITION_TERM");
        conditionTerm.put("refId", 30L);
        conditionTerm.put("conditionRole", "required");
        conditionTerm.put("conditionTermCode", "MOON_PHASE_1_4");
        conditionTerm.put("conditionTermNameZh", "月相 1–4");
        conditionTerm.put("conditionTermNameEn", "Moon Phase 1-4");
        conditionTerm.put("conditionTermType", "MOON_PHASE_RANGE");
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_conditions"), eq(21L))).thenReturn(List.of(shopCondition, itemCondition, conditionTerm));

        mockMvc.perform(get("/admin/npcs/7").accept(APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.gamePeriodId").value(3))
            .andExpect(jsonPath("$.data.behaviorNotes").value("Offers advice to new players."))
            .andExpect(jsonPath("$.data.shopEntries", hasSize(1)))
            .andExpect(jsonPath("$.data.shopEntries[0].itemName").value("Torch"))
            .andExpect(jsonPath("$.data.shopEntries[0].conditions", hasSize(3)))
            .andExpect(jsonPath("$.data.shopEntries[0].conditions[0].refType").value("GAME_PERIOD"))
            .andExpect(jsonPath("$.data.shopEntries[0].conditions[0].gamePeriodCode").value("hardmode"))
            .andExpect(jsonPath("$.data.shopEntries[0].conditions[0].gamePeriodNameZh").value("困难模式"))
            .andExpect(jsonPath("$.data.shopEntries[0].conditions[1].refType").value("ITEM"))
            .andExpect(jsonPath("$.data.shopEntries[0].conditions[1].refItemNameZh").value("信号枪"))
            .andExpect(jsonPath("$.data.shopEntries[0].conditions[1].refItemInternalName").value("FlareGun"))
            .andExpect(jsonPath("$.data.shopEntries[0].conditions[2].refType").value("CONDITION_TERM"))
            .andExpect(jsonPath("$.data.shopEntries[0].conditions[2].conditionTermCode").value("MOON_PHASE_1_4"))
            .andExpect(jsonPath("$.data.shopEntries[0].conditions[2].conditionTermNameZh").value("月相 1–4"))
            .andExpect(jsonPath("$.data.shopEntries[0].conditions[2].conditionTermType").value("MOON_PHASE_RANGE"));
    }

    @Test
    void shouldLoadShopEntryImagesFromTrustedItemImageFallback() throws Exception {
        Npc npc = new Npc();
        npc.setId(7L);
        npc.setGameId(22L);
        npc.setInternalName("Guide");
        npc.setName("Guide");
        npc.setNameZh("Guide Zh");
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
        shopEntry.put("itemName", "Rope");
        shopEntry.put("itemImage", "https://terraria.wiki.gg/images/Rope.png");
        when(jdbcTemplate.queryForList(
            argThat(sql -> sql != null
                && sql.contains("FROM npc_shop_entries nse")
                && sql.contains("item_images ii")),
            eq(7L)
        )).thenReturn(List.of(shopEntry));
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_conditions nsc"), eq(21L))).thenReturn(List.of());

        mockMvc.perform(get("/admin/npcs/7").accept(APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.shopEntries[0].itemImage").value(org.hamcrest.Matchers.nullValue()));
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

    @Test
    void shouldReplaceOnlyNpcDropLootRowsWhenUpdatingNpcLootEntries() throws Exception {
        Npc existing = new Npc();
        existing.setId(7L);
        existing.setGameId(22L);
        existing.setInternalName("Guide");
        existing.setName("Guide");
        existing.setStatus(1);

        Npc updated = new Npc();
        updated.setId(7L);
        updated.setGameId(22L);
        updated.setInternalName("Guide");
        updated.setName("Guide");
        updated.setStatus(1);

        when(npcMapper.selectById(7L)).thenReturn(existing, updated);
        when(npcMapper.selectCount(any())).thenReturn(0L);
        when(jdbcTemplate.queryForObject(contains("FROM npc_loot_entries"), eq(Integer.class), eq(7L))).thenReturn(1);
        when(jdbcTemplate.queryForObject(contains("FROM npc_buff_relations"), eq(Integer.class), eq(7L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM npc_shop_entries"), eq(Integer.class), eq(7L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("source_ref_id = ?"), eq(Integer.class), eq(22L))).thenReturn(0);
        when(jdbcTemplate.queryForObject(
            contains("LOWER(TRIM(source_ref_name)) = LOWER(TRIM(?))"),
            eq(Integer.class),
            eq("Guide")
        )).thenReturn(0);
        when(jdbcTemplate.queryForList(contains("FROM npc_loot_entries nle"), eq(7L))).thenReturn(List.of(Map.of(
            "itemId", 12L,
            "dropSourceKind", "npc_drop",
            "itemName", "Gel"
        )));
        when(jdbcTemplate.queryForList(contains("source_ref_id IS NULL"), eq("Guide"))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_buff_relations"), eq(7L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_entries nse"), eq(7L))).thenReturn(List.of());

        mockMvc.perform(put("/admin/npcs/7")
                .contentType(APPLICATION_JSON)
                .content("""
                    {
                      "lootEntries": [
                        {
                          "itemId": 12
                        }
                      ]
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.lootEntries", hasSize(1)))
            .andExpect(jsonPath("$.data.lootEntries[0].dropSourceKind").value("npc_drop"));

        verify(jdbcTemplate).update(
            contains("drop_source_kind IS NULL OR drop_source_kind = 'npc_drop'"),
            eq(7L)
        );
        verify(jdbcTemplate, never()).update("DELETE FROM npc_loot_entries WHERE npc_id = ?", 7L);
        verify(jdbcTemplate).update(
            contains("INSERT INTO npc_loot_entries"),
            eq(7L),
            eq(12L),
            isNull(),
            eq("npc_drop"),
            isNull(),
            isNull(),
            isNull(),
            isNull(),
            isNull(),
            isNull(),
            isNull(),
            eq(1)
        );
    }

    private Object timedNpcSupplementCache(Map<Long, Map<String, Object>> value) throws Exception {
        Class<?> timedValueClass = Class.forName("com.terraria.skills.controller.AdminNpcController$TimedValue");
        Constructor<?> constructor = timedValueClass.getDeclaredConstructor(Object.class, long.class);
        constructor.setAccessible(true);
        return constructor.newInstance(value, System.currentTimeMillis() + 60_000L);
    }

    private Object timedNpcZhNameCache(Map<String, List<String>> entries) throws Exception {
        Class<?> npcZhNameClass = Class.forName("com.terraria.skills.controller.AdminNpcController$NpcZhName");
        Constructor<?> npcZhNameConstructor = npcZhNameClass.getDeclaredConstructor(String.class, String.class, String.class);
        npcZhNameConstructor.setAccessible(true);
        Map<String, Object> value = new LinkedHashMap<>();
        for (Map.Entry<String, List<String>> entry : entries.entrySet()) {
            List<String> fields = entry.getValue();
            value.put(entry.getKey(), npcZhNameConstructor.newInstance(fields.get(0), fields.get(1), fields.get(2)));
        }

        Class<?> timedValueClass = Class.forName("com.terraria.skills.controller.AdminNpcController$TimedValue");
        Constructor<?> constructor = timedValueClass.getDeclaredConstructor(Object.class, long.class);
        constructor.setAccessible(true);
        return constructor.newInstance(value, System.currentTimeMillis() + 60_000L);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> npcSupplementFromGeneratedRecord(Map<String, Object> record) throws Exception {
        Method method = AdminNpcController.class.getDeclaredMethod("toNpcSupplement", Map.class);
        method.setAccessible(true);
        return (Map<String, Object>) method.invoke(adminNpcController, record);
    }
}

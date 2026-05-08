package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.entity.Npc;
import com.terraria.skills.entity.NpcLootEntry;
import com.terraria.skills.mapper.NpcBuffRelationMapper;
import com.terraria.skills.mapper.NpcLootEntryMapper;
import com.terraria.skills.mapper.NpcMapper;
import com.terraria.skills.mapper.NpcShopConditionMapper;
import com.terraria.skills.mapper.NpcShopEntryMapper;
import com.terraria.skills.service.ManagedImageUrlPolicy;
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
import java.util.Map;

import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AdminNpcRelationControllerTest {

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
                "http://localhost:9000/terrapedia-images/buffs/",
                "https://cdn.example.com/terrapedia-images/buffs/"
            );
        }
    };

    @Mock
    private NpcMapper npcMapper;

    @Mock
    private NpcLootEntryMapper npcLootEntryMapper;

    @Mock
    private NpcBuffRelationMapper npcBuffRelationMapper;

    @Mock
    private NpcShopEntryMapper npcShopEntryMapper;

    @Mock
    private NpcShopConditionMapper npcShopConditionMapper;

    @Mock
    private JdbcTemplate jdbcTemplate;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        AdminNpcRelationController controller = new AdminNpcRelationController(
            npcMapper,
            npcLootEntryMapper,
            npcBuffRelationMapper,
            npcShopEntryMapper,
            npcShopConditionMapper,
            jdbcTemplate,
            new ObjectMapper(),
            MANAGED_IMAGE_URL_POLICY
        );
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldPreferCachedBuffImageForNpcBuffRelations() throws Exception {
        Npc npc = new Npc();
        npc.setId(7L);
        npc.setGameId(22L);
        npc.setInternalName("Guide");
        npc.setName("Guide");
        npc.setStatus(1);

        when(npcMapper.selectById(7L)).thenReturn(npc);
        when(jdbcTemplate.queryForList(contains("FROM npc_buff_relations"), eq(7L))).thenReturn(List.of(Map.of(
            "id", 31L,
            "buffId", 401L,
            "buffSourceId", 401,
            "buffInternalName", "Sharpened",
            "buffImage", "http://localhost:9000/terrapedia-images/buffs/wiki/ab/sharpened.png"
        )));

        mockMvc.perform(get("/admin/npcs/7/buff-relations"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].buffImage").value("http://localhost:9000/terrapedia-images/buffs/wiki/ab/sharpened.png"));

        ArgumentCaptor<String> queryCaptor = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).queryForList(queryCaptor.capture(), eq(7L));
        assertTrue(queryCaptor.getValue().contains("b.image_cached_url"));
        assertTrue(queryCaptor.getValue().contains("AS buffImage"));
    }

    @Test
    void shouldAllowConfiguredCdnBuffImagesForNpcBuffRelations() throws Exception {
        Npc npc = new Npc();
        npc.setId(8L);
        npc.setGameId(23L);
        npc.setInternalName("Merchant");
        npc.setName("Merchant");
        npc.setStatus(1);

        when(npcMapper.selectById(8L)).thenReturn(npc);
        when(jdbcTemplate.queryForList(contains("FROM npc_buff_relations"), eq(8L))).thenReturn(List.of(Map.of(
            "id", 32L,
            "buffId", 402L,
            "buffSourceId", 402,
            "buffInternalName", "Sharpened",
            "buffImage", CDN_BUFF_IMAGE_URL
        )));

        mockMvc.perform(get("/admin/npcs/8/buff-relations"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].buffImage").value(CDN_BUFF_IMAGE_URL));
    }

    @Test
    void shouldSuppressWikiDisplayImagesForNpcRelationResponses() throws Exception {
        Npc npc = new Npc();
        npc.setId(7L);
        npc.setGameId(22L);
        npc.setInternalName("Guide");
        npc.setName("Guide");
        npc.setStatus(1);

        when(npcMapper.selectById(7L)).thenReturn(npc);
        when(jdbcTemplate.queryForList(contains("FROM npc_loot_entries"), eq(7L))).thenReturn(List.of(Map.of(
            "id", 11L,
            "itemId", 12L,
            "itemName", "Gel",
            "itemImage", "https://terraria.wiki.gg/images/Gel.png"
        )));
        when(jdbcTemplate.queryForList(contains("FROM npc_buff_relations"), eq(7L))).thenReturn(List.of(Map.of(
            "id", 31L,
            "buffId", 401L,
            "buffInternalName", "Sharpened",
            "buffImage", "https://terraria.wiki.gg/images/Sharpened.png"
        )));
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_entries"), eq(7L))).thenReturn(List.of(Map.of(
            "id", 41L,
            "itemId", 12L,
            "itemName", "Torch",
            "itemImage", "https://static.wikia.nocookie.net/terraria_gamepedia/images/Torch.png"
        )));
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_conditions"), any(Object[].class))).thenReturn(List.of());

        mockMvc.perform(get("/admin/npcs/7/loot"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].itemImage").doesNotExist());

        mockMvc.perform(get("/admin/npcs/7/buff-relations"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].buffImage").doesNotExist());

        mockMvc.perform(get("/admin/npcs/7/shop-entries"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].itemImage").doesNotExist());
    }

    @Test
    void shouldReplaceOnlyNpcDropRowsWhenReplacingLootEntries() throws Exception {
        Npc npc = new Npc();
        npc.setId(7L);
        npc.setGameId(22L);
        npc.setInternalName("Guide");
        npc.setName("Guide");
        npc.setStatus(1);

        when(npcMapper.selectById(7L)).thenReturn(npc);
        when(jdbcTemplate.queryForList(contains("FROM npc_loot_entries nle"), eq(7L))).thenReturn(List.of(Map.of(
            "itemId", 12L,
            "dropSourceKind", "npc_drop",
            "itemName", "Gel"
        )));

        mockMvc.perform(put("/admin/npcs/7/loot")
                .contentType(APPLICATION_JSON)
                .content("""
                    [
                      {
                        "itemId": 12
                      }
                    ]
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data", hasSize(1)))
            .andExpect(jsonPath("$.data[0].dropSourceKind").value("npc_drop"));

        verify(jdbcTemplate).update(
            contains("drop_source_kind IS NULL OR drop_source_kind = 'npc_drop'"),
            eq(7L)
        );
        verify(npcLootEntryMapper, never()).delete(any());

        ArgumentCaptor<NpcLootEntry> entryCaptor = ArgumentCaptor.forClass(NpcLootEntry.class);
        verify(npcLootEntryMapper).insert(entryCaptor.capture());
        assertEquals("npc_drop", entryCaptor.getValue().getDropSourceKind());
    }
}

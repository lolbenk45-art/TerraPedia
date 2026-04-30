package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.entity.Npc;
import com.terraria.skills.entity.NpcLootEntry;
import com.terraria.skills.mapper.NpcBuffRelationMapper;
import com.terraria.skills.mapper.NpcLootEntryMapper;
import com.terraria.skills.mapper.NpcMapper;
import com.terraria.skills.mapper.NpcShopConditionMapper;
import com.terraria.skills.mapper.NpcShopEntryMapper;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AdminNpcRelationControllerTest {

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
            new ObjectMapper()
        );
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
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

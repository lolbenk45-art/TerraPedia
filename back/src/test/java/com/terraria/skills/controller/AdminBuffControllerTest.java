package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.entity.Buff;
import com.terraria.skills.mapper.BuffMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AdminBuffControllerTest {

    @Mock
    private BuffMapper buffMapper;

    @Mock
    private JdbcTemplate jdbcTemplate;

    @InjectMocks
    private AdminBuffController adminBuffController;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        adminBuffController = new AdminBuffController(buffMapper, new ObjectMapper(), jdbcTemplate);
        mockMvc = MockMvcBuilders.standaloneSetup(adminBuffController)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldReturnImmuneNpcSamplesWithNpcSpriteImage() throws Exception {
        Buff buff = new Buff();
        buff.setId(30L);
        buff.setInternalName("Poisoned");
        buff.setEnglishName("Poisoned");
        buff.setImmuneNpcCount(1);
        buff.setImmuneNpcSampleJson("[{\"internalName\":\"TestHornetStingy\",\"name\":\"Hornet\",\"npcId\":-650001}]");

        when(buffMapper.selectById(30L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(
            contains("FROM npcs"),
            eq("TestHornetStingy")
        )).thenReturn(List.of(Map.of(
            "npcId", -650001,
            "internalName", "TestHornetStingy",
            "name", "Hornet",
            "nameZh", "Hornet ZH",
            "subNameZh", "Large Stingy Hornet",
            "rawJson", "{\"imageUrl\":\"https://cdn.example.com/npcs/Stingy_Hornet.png\"}"
        )));

        mockMvc.perform(get("/admin/buffs/30"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.immuneNpcSampleJson").value("[{\"internalName\":\"TestHornetStingy\",\"name\":\"Hornet\",\"npcId\":-650001}]"))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].npcId").value(-650001))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].nameZh").value("Hornet ZH"))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].subNameZh").value("Large Stingy Hornet"))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].image").value(containsString("Stingy_Hornet")));
    }

    @Test
    void shouldFallbackToItemsImageWhenNpcSpriteMissing() throws Exception {
        Buff buff = new Buff();
        buff.setId(31L);
        buff.setInternalName("CustomDebuff");
        buff.setEnglishName("Custom Debuff");
        buff.setImmuneNpcCount(1);
        buff.setImmuneNpcSampleJson("[{\"npcId\":1001,\"name\":\"Fallback NPC\"}]");

        when(buffMapper.selectById(31L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(
            contains("FROM npcs"),
            eq(1001)
        )).thenReturn(List.of(Map.of(
            "npcId", 1001,
            "internalName", "FallbackNpc",
            "name", "Fallback NPC",
            "nameZh", "Fallback NPC ZH",
            "subNameZh", "Fallback Variant",
            "bannerItemId", 88L,
            "rawJson", "{}"
        )));
        when(jdbcTemplate.queryForList(
            contains("FROM items"),
            eq(88L)
        )).thenReturn(List.of(Map.of(
            "id", 88L,
            "image", "http://localhost:9000/terrapedia-images/items/fallback-banner.png"
        )));

        mockMvc.perform(get("/admin/buffs/31"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].npcId").value(1001))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].image").value("http://localhost:9000/terrapedia-images/items/fallback-banner.png"))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].imageUrl").value("http://localhost:9000/terrapedia-images/items/fallback-banner.png"));
    }

    @Test
    void shouldKeepRawJsonUntouchedAndAllowMissingNpcImage() throws Exception {
        Buff buff = new Buff();
        buff.setId(32L);
        buff.setInternalName("NoImageDebuff");
        buff.setEnglishName("No Image Debuff");
        buff.setImmuneNpcCount(1);
        buff.setImmuneNpcSampleJson("[{\"npcId\":1002,\"name\":\"Unknown NPC\"}]");

        when(buffMapper.selectById(32L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(
            contains("FROM npcs"),
            eq(1002)
        )).thenReturn(List.of());

        mockMvc.perform(get("/admin/buffs/32"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.immuneNpcSampleJson").value("[{\"npcId\":1002,\"name\":\"Unknown NPC\"}]"))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].name").value("Unknown NPC"))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].image").value(nullValue()))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].imageUrl").value(nullValue()));
    }

    @Test
    void shouldReturnNpcsThatInflictBuffFromNpcBuffRelations() throws Exception {
        Buff buff = new Buff();
        buff.setId(156L);
        buff.setSourceId(156);
        buff.setInternalName("Stoned");
        buff.setEnglishName("Stoned");
        buff.setBuffType("debuff");

        when(buffMapper.selectById(156L)).thenReturn(buff);
        when(jdbcTemplate.queryForObject(
            contains("FROM npc_buff_relations"),
            eq(Integer.class),
            eq(156L)
        )).thenReturn(1);
        Map<String, Object> medusaRelation = new java.util.LinkedHashMap<>();
        medusaRelation.put("relationId", 204L);
        medusaRelation.put("npcDbId", 9001L);
        medusaRelation.put("npcId", 480);
        medusaRelation.put("internalName", "Medusa");
        medusaRelation.put("name", "Medusa");
        medusaRelation.put("nameZh", "美杜莎");
        medusaRelation.put("subNameZh", "美杜莎");
        medusaRelation.put("relationType", "inflicts");
        medusaRelation.put("durationTicks", 240);
        medusaRelation.put("durationText", "1-4 seconds");
        medusaRelation.put("notes", "[auto:wiki-crawler-npc-infobox] page=Medusa");
        medusaRelation.put("sortOrder", 0);
        medusaRelation.put("bannerItemId", 164);
        medusaRelation.put("rawJson", "{\"imageUrl\":\"https://cdn.example.com/npcs/Medusa.png\"}");
        when(jdbcTemplate.queryForList(
            contains("FROM npc_buff_relations nbr"),
            eq(156L)
        )).thenReturn(List.of(medusaRelation));

        mockMvc.perform(get("/admin/buffs/156"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.inflictingNpcCount").value(1))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].npcId").value(480))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].internalName").value("Medusa"))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].nameZh").value("美杜莎"))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].relationType").value("inflicts"))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].durationText").value("1-4 seconds"))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].image").value("https://cdn.example.com/npcs/Medusa.png"));
    }

    @Test
    void shouldFormatInflictingNpcWikiDurationTemplateFromNotes() throws Exception {
        Buff buff = new Buff();
        buff.setId(157L);
        buff.setSourceId(157);
        buff.setInternalName("Stoned");
        buff.setEnglishName("Stoned");
        buff.setBuffType("debuff");

        when(buffMapper.selectById(157L)).thenReturn(buff);
        when(jdbcTemplate.queryForObject(
            contains("FROM npc_buff_relations"),
            eq(Integer.class),
            eq(157L)
        )).thenReturn(1);
        Map<String, Object> medusaRelation = new java.util.LinkedHashMap<>();
        medusaRelation.put("relationId", 205L);
        medusaRelation.put("npcDbId", 9001L);
        medusaRelation.put("npcId", 480);
        medusaRelation.put("internalName", "Medusa");
        medusaRelation.put("name", "Medusa");
        medusaRelation.put("relationType", "inflicts");
        medusaRelation.put("notes", "[auto:wiki-crawler-npc-infobox] page=Medusa; duration={{duration|rawseconds=1–4}}");
        medusaRelation.put("sortOrder", 0);
        medusaRelation.put("rawJson", "{}");
        when(jdbcTemplate.queryForList(
            contains("FROM npc_buff_relations nbr"),
            eq(157L)
        )).thenReturn(List.of(medusaRelation));

        mockMvc.perform(get("/admin/buffs/157"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].durationText").value("1-4 秒"))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].rawDurationText").value("{{duration|rawseconds=1–4}}"));
    }
}

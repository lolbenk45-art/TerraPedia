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
        buff.setImmuneNpcSampleJson("[{\"internalName\":\"BigHornetStingy\",\"name\":\"Hornet\",\"npcId\":-65}]");

        when(buffMapper.selectById(30L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(
            contains("FROM npcs"),
            eq("BigHornetStingy")
        )).thenReturn(List.of(Map.of(
            "npcId", -65,
            "internalName", "BigHornetStingy",
            "name", "Hornet",
            "nameZh", "Hornet ZH",
            "subNameZh", "Large Stingy Hornet",
            "rawJson", "{\"imageUrl\":\"https://example.invalid/stale.png\"}"
        )));

        mockMvc.perform(get("/admin/buffs/30"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.immuneNpcSampleJson").value("[{\"internalName\":\"BigHornetStingy\",\"name\":\"Hornet\",\"npcId\":-65}]"))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].npcId").value(-65))
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
}

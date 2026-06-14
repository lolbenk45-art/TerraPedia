package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.BiomeDTO;
import com.terraria.skills.dto.BiomeItemRelationDTO;
import com.terraria.skills.dto.BiomeItemSourceDTO;
import com.terraria.skills.dto.BiomeNpcRelationDTO;
import com.terraria.skills.service.BiomeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class PublicBiomeControllerTest {

    @Mock
    private BiomeService biomeService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders
            .standaloneSetup(new PublicBiomeController(biomeService))
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldExposePublicBiomeDetailRelationArrays() throws Exception {
        BiomeDTO detail = new BiomeDTO();
        detail.setId(10L);
        detail.setCode("forest");
        detail.setNameZh("森林");

        BiomeItemRelationDTO itemBiome = new BiomeItemRelationDTO();
        itemBiome.setId(60L);
        itemBiome.setItemNameZh("木材");
        itemBiome.setMissingItem(false);

        BiomeNpcRelationDTO npcBiome = new BiomeNpcRelationDTO();
        npcBiome.setId(80L);
        npcBiome.setNpcNameZh("绿史莱姆");
        npcBiome.setMissingNpc(false);

        BiomeItemSourceDTO itemSource = new BiomeItemSourceDTO();
        itemSource.setId(90L);
        itemSource.setSourceRefType("biome_wikitext");
        itemSource.setSourceRefName("From Goblin Scouts");

        detail.setItemBiomes(List.of(itemBiome));
        detail.setNpcBiomes(List.of(npcBiome));
        detail.setItemSources(List.of(itemSource));

        when(biomeService.getBiomeById(10L)).thenReturn(detail);

        mockMvc.perform(get("/public/biomes/10"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.itemBiomes[0].itemNameZh").value("木材"))
            .andExpect(jsonPath("$.data.npcBiomes[0].npcNameZh").value("绿史莱姆"))
            .andExpect(jsonPath("$.data.itemSources[0].sourceRefType").value("biome_wikitext"))
            .andExpect(jsonPath("$.data.itemSources[0].sourceRefName").value("From Goblin Scouts"));
    }
}

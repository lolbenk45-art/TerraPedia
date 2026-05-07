package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.PublicArmorSetListDTO;
import com.terraria.skills.dto.PublicArmorSetQuery;
import com.terraria.skills.service.PublicArmorSetService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class PublicArmorSetControllerTest {

    @Mock
    private PublicArmorSetService publicArmorSetService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        PublicArmorSetController controller = new PublicArmorSetController(publicArmorSetService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldExposePublicArmorSetListWithPaginationAndSearch() throws Exception {
        PublicArmorSetListDTO armorSet = new PublicArmorSetListDTO();
        armorSet.setId(10L);
        armorSet.setTextKey("ArmorSet.Hallowed");
        armorSet.setSourceKey("ArmorSet.Hallowed");
        armorSet.setName("Hallowed armor CN");
        armorSet.setNameZh("Hallowed armor CN");
        armorSet.setNameEn("Hallowed armor");
        armorSet.setPrimaryPart("head");
        armorSet.setSetCount(3);
        armorSet.setUniqueItemCount(3);
        armorSet.setMaleImages(List.of("http://localhost:9000/terrapedia-images/wiki/armor-sets/hallowed-male.png"));
        armorSet.setFemaleImages(List.of("http://localhost:9000/terrapedia-images/wiki/armor-sets/hallowed-female.png"));
        armorSet.setSpecialImages(List.of());

        Page<PublicArmorSetListDTO> page = new Page<>(2, 24);
        page.setTotal(25);
        page.setRecords(List.of(armorSet));

        when(publicArmorSetService.getPublicArmorSets(any(PublicArmorSetQuery.class))).thenReturn(page);

        mockMvc.perform(get("/public/armor-sets")
                .param("page", "2")
                .param("limit", "24")
                .param("search", "hallowed"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.pagination.total").value(25))
            .andExpect(jsonPath("$.pagination.page").value(2))
            .andExpect(jsonPath("$.pagination.limit").value(24))
            .andExpect(jsonPath("$.data[0].id").value(10))
            .andExpect(jsonPath("$.data[0].textKey").value("ArmorSet.Hallowed"))
            .andExpect(jsonPath("$.data[0].sourceKey").value("ArmorSet.Hallowed"))
            .andExpect(jsonPath("$.data[0].nameZh").value("Hallowed armor CN"))
            .andExpect(jsonPath("$.data[0].nameEn").value("Hallowed armor"))
            .andExpect(jsonPath("$.data[0].primaryPart").value("head"))
            .andExpect(jsonPath("$.data[0].setCount").value(3))
            .andExpect(jsonPath("$.data[0].uniqueItemCount").value(3))
            .andExpect(jsonPath("$.data[0].maleImages[0]").value("http://localhost:9000/terrapedia-images/wiki/armor-sets/hallowed-male.png"))
            .andExpect(jsonPath("$.data[0].femaleImages[0]").value("http://localhost:9000/terrapedia-images/wiki/armor-sets/hallowed-female.png"))
            .andExpect(jsonPath("$.data[0].status").doesNotExist())
            .andExpect(jsonPath("$.data[0].createdAt").doesNotExist())
            .andExpect(jsonPath("$.data[0].updatedAt").doesNotExist());

        ArgumentCaptor<PublicArmorSetQuery> queryCaptor = ArgumentCaptor.forClass(PublicArmorSetQuery.class);
        verify(publicArmorSetService).getPublicArmorSets(queryCaptor.capture());
        PublicArmorSetQuery query = queryCaptor.getValue();
        assertEquals(2, query.getPage());
        assertEquals(24, query.getLimit());
        assertEquals("hallowed", query.getSearch());
    }

    @Test
    void shouldKeepManagedImageArraysWhenEmpty() throws Exception {
        PublicArmorSetListDTO armorSet = new PublicArmorSetListDTO();
        armorSet.setId(11L);
        armorSet.setTextKey("ArmorSet.Empty");
        armorSet.setSourceKey("ArmorSet.Empty");
        armorSet.setName("Empty CN");
        armorSet.setNameZh("Empty CN");
        armorSet.setNameEn("Empty");
        armorSet.setPrimaryPart("body");
        armorSet.setSetCount(1);
        armorSet.setUniqueItemCount(1);
        armorSet.setMaleImages(List.of());
        armorSet.setFemaleImages(List.of());
        armorSet.setSpecialImages(List.of());

        Page<PublicArmorSetListDTO> page = new Page<>(1, 20);
        page.setTotal(1);
        page.setRecords(List.of(armorSet));

        when(publicArmorSetService.getPublicArmorSets(any(PublicArmorSetQuery.class))).thenReturn(page);

        mockMvc.perform(get("/public/armor-sets"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].id").value(11))
            .andExpect(jsonPath("$.data[0].maleImages").isArray())
            .andExpect(jsonPath("$.data[0].femaleImages").isArray())
            .andExpect(jsonPath("$.data[0].specialImages").isArray());
    }
}

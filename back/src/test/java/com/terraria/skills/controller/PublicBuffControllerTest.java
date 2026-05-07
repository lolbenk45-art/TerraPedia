package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.PublicBuffListDTO;
import com.terraria.skills.dto.PublicBuffQuery;
import com.terraria.skills.service.PublicBuffService;
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
class PublicBuffControllerTest {

    @Mock
    private PublicBuffService publicBuffService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        PublicBuffController controller = new PublicBuffController(publicBuffService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldExposePublicBuffListWithPaginationAndSearch() throws Exception {
        PublicBuffListDTO buff = new PublicBuffListDTO();
        buff.setId(159L);
        buff.setSourceId(159);
        buff.setInternalName("Sharpened");
        buff.setName("Sharpened CN");
        buff.setNameZh("Sharpened CN");
        buff.setImageUrl("http://localhost:9000/terrapedia-images/items/wiki/buffs/ab/sharpened.png");
        buff.setBuffType("station");
        buff.setTooltipZh("Buff tooltip");
        buff.setSourceItemCount(1);
        buff.setImmuneNpcCount(0);

        Page<PublicBuffListDTO> page = new Page<>(2, 24);
        page.setTotal(25);
        page.setRecords(List.of(buff));

        when(publicBuffService.getPublicBuffs(any(PublicBuffQuery.class))).thenReturn(page);

        mockMvc.perform(get("/public/buffs")
                .param("page", "2")
                .param("limit", "24")
                .param("search", "sharp")
                .param("sortBy", "name")
                .param("sortDirection", "desc"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.pagination.total").value(25))
            .andExpect(jsonPath("$.pagination.page").value(2))
            .andExpect(jsonPath("$.pagination.limit").value(24))
            .andExpect(jsonPath("$.data[0].id").value(159))
            .andExpect(jsonPath("$.data[0].sourceId").value(159))
            .andExpect(jsonPath("$.data[0].internalName").value("Sharpened"))
            .andExpect(jsonPath("$.data[0].nameZh").value("Sharpened CN"))
            .andExpect(jsonPath("$.data[0].imageUrl").value("http://localhost:9000/terrapedia-images/items/wiki/buffs/ab/sharpened.png"))
            .andExpect(jsonPath("$.data[0].buffType").value("station"))
            .andExpect(jsonPath("$.data[0].tooltipZh").value("Buff tooltip"))
            .andExpect(jsonPath("$.data[0].sourceItemCount").value(1))
            .andExpect(jsonPath("$.data[0].immuneNpcCount").value(0))
            .andExpect(jsonPath("$.data[0].status").doesNotExist())
            .andExpect(jsonPath("$.data[0].createdAt").doesNotExist())
            .andExpect(jsonPath("$.data[0].updatedAt").doesNotExist());

        ArgumentCaptor<PublicBuffQuery> queryCaptor = ArgumentCaptor.forClass(PublicBuffQuery.class);
        verify(publicBuffService).getPublicBuffs(queryCaptor.capture());
        PublicBuffQuery query = queryCaptor.getValue();
        assertEquals(2, query.getPage());
        assertEquals(24, query.getLimit());
        assertEquals("sharp", query.getSearch());
        assertEquals("name", query.getSortBy());
        assertEquals("desc", query.getSortDirection());
    }

    @Test
    void shouldKeepImageUrlFieldAndAllowNullWhenFilteredByManagedPolicy() throws Exception {
        PublicBuffListDTO buff = new PublicBuffListDTO();
        buff.setId(160L);
        buff.setSourceId(160);
        buff.setInternalName("Tipsy");
        buff.setName("Tipsy CN");
        buff.setNameZh("Tipsy CN");
        buff.setImageUrl(null);
        buff.setBuffType("potion");
        buff.setTooltipZh("Tooltip");
        buff.setSourceItemCount(0);
        buff.setImmuneNpcCount(1);

        Page<PublicBuffListDTO> page = new Page<>(1, 20);
        page.setTotal(1);
        page.setRecords(List.of(buff));

        when(publicBuffService.getPublicBuffs(any(PublicBuffQuery.class))).thenReturn(page);

        mockMvc.perform(get("/public/buffs"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].id").value(160))
            .andExpect(jsonPath("$.data[0].imageUrl").isEmpty());
    }
}

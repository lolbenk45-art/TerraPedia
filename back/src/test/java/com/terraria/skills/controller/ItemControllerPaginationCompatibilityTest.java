package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.common.PageQuery;
import com.terraria.skills.dto.ItemDTO;
import com.terraria.skills.service.ItemService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
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
class ItemControllerPaginationCompatibilityTest {

    @Mock
    private ItemService itemService;

    @InjectMocks
    private ItemController itemController;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(itemController)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldAcceptSizeAliasAndExposeSizeInPagination() throws Exception {
        ItemDTO item = new ItemDTO();
        item.setId(1L);
        item.setName("Iron Pickaxe");
        item.setImage("http://localhost:9000/terrapedia-images/items/iron-pickaxe.png");
        item.setGamePeriod("前期");

        Page<ItemDTO> page = new Page<>(2, 5);
        page.setTotal(11);
        page.setRecords(List.of(item));

        when(itemService.getItems(any(PageQuery.class))).thenReturn(page);

        mockMvc.perform(get("/items")
                .param("page", "2")
                .param("size", "5"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.pagination.page").value(2))
            .andExpect(jsonPath("$.pagination.limit").value(5))
            .andExpect(jsonPath("$.pagination.size").value(5))
            .andExpect(jsonPath("$.pagination.total").value(11))
            .andExpect(jsonPath("$.data[0].id").value(1))
            .andExpect(jsonPath("$.data[0].imageUrl").value("http://localhost:9000/terrapedia-images/items/iron-pickaxe.png"))
            .andExpect(jsonPath("$.data[0].gamePeriod").value("前期"));

        ArgumentCaptor<PageQuery> pageQueryCaptor = ArgumentCaptor.forClass(PageQuery.class);
        verify(itemService).getItems(pageQueryCaptor.capture());
        assertEquals(2, pageQueryCaptor.getValue().getPage());
        assertEquals(5, pageQueryCaptor.getValue().getLimit());
    }

    @Test
    void shouldPreferLimitWhenLimitAndSizeAreBothProvided() throws Exception {
        Page<ItemDTO> page = new Page<>(1, 3);
        page.setTotal(3);
        page.setRecords(List.of());

        when(itemService.getItems(any(PageQuery.class))).thenReturn(page);

        mockMvc.perform(get("/items")
                .param("page", "1")
                .param("limit", "3")
                .param("size", "9"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.pagination.limit").value(3))
            .andExpect(jsonPath("$.pagination.size").value(3));

        ArgumentCaptor<PageQuery> pageQueryCaptor = ArgumentCaptor.forClass(PageQuery.class);
        verify(itemService).getItems(pageQueryCaptor.capture());
        assertEquals(3, pageQueryCaptor.getValue().getLimit());
    }

    @Test
    void shouldForwardGamePeriodFilter() throws Exception {
        Page<ItemDTO> page = new Page<>(1, 10);
        page.setTotal(1);
        page.setRecords(List.of());

        when(itemService.getItems(any(PageQuery.class))).thenReturn(page);

        mockMvc.perform(get("/items")
                .param("gamePeriodId", "2")
                .param("rarity", "蓝色"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));

        ArgumentCaptor<PageQuery> pageQueryCaptor = ArgumentCaptor.forClass(PageQuery.class);
        verify(itemService).getItems(pageQueryCaptor.capture());
        assertEquals(2L, pageQueryCaptor.getValue().getGamePeriodId());
        assertEquals("蓝色", pageQueryCaptor.getValue().getRarity());
    }
}

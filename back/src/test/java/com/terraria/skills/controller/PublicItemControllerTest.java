package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.common.PageQuery;
import com.terraria.skills.dto.PublicItemDetailDTO;
import com.terraria.skills.dto.PublicItemListDTO;
import com.terraria.skills.dto.PublicItemSuggestionDTO;
import com.terraria.skills.service.PublicItemService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class PublicItemControllerTest {

    @Mock
    private PublicItemService publicItemService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        PublicItemController controller = new PublicItemController(publicItemService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldExposeOnlyLightweightFieldsForPublicItemList() throws Exception {
        PublicItemListDTO item = new PublicItemListDTO();
        item.setId(1L);
        item.setName("Iron Pickaxe");
        item.setNameZh("Iron Pickaxe");
        item.setInternalName("IronPickaxe");
        item.setImage("http://localhost:9000/terrapedia-images/items/iron-pickaxe.png");
        item.setCategoryId(313L);
        item.setCategoryName("Pickaxes");
        item.setRarityId(1L);
        item.setRarity("Blue");
        item.setGamePeriodId(1L);
        item.setGamePeriod("Pre-Hardmode");
        item.setStackSize(1);
        item.setIsStackable(false);
        item.setUpdatedAt(LocalDateTime.of(2026, 5, 4, 13, 0));

        Page<PublicItemListDTO> page = new Page<>(1, 36);
        page.setTotal(1);
        page.setRecords(List.of(item));

        when(publicItemService.getPublicItems(any(PageQuery.class))).thenReturn(page);

        mockMvc.perform(get("/public/items")
                .param("page", "1")
                .param("limit", "36")
                .param("search", "iron")
                .param("categoryId", "313")
                .param("rarity", "Blue")
                .param("sortBy", "name")
                .param("sortDirection", "asc"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.pagination.total").value(1))
            .andExpect(jsonPath("$.pagination.page").value(1))
            .andExpect(jsonPath("$.pagination.limit").value(36))
            .andExpect(jsonPath("$.data[0].id").value(1))
            .andExpect(jsonPath("$.data[0].name").value("Iron Pickaxe"))
            .andExpect(jsonPath("$.data[0].image").value("http://localhost:9000/terrapedia-images/items/iron-pickaxe.png"))
            .andExpect(jsonPath("$.data[0].imageUrl").doesNotExist())
            .andExpect(jsonPath("$.data[0].category").doesNotExist())
            .andExpect(jsonPath("$.data[0].categoryName").value("Pickaxes"))
            .andExpect(jsonPath("$.data[0].rare").doesNotExist())
            .andExpect(jsonPath("$.data[0].rarity").value("Blue"))
            .andExpect(jsonPath("$.data[0].sourceNpcs").doesNotExist())
            .andExpect(jsonPath("$.data[0].sourceNpcsJson").doesNotExist())
            .andExpect(jsonPath("$.data[0].categoryPaths").doesNotExist())
            .andExpect(jsonPath("$.data[0].description").doesNotExist())
            .andExpect(jsonPath("$.data[0].descriptionZh").doesNotExist())
            .andExpect(jsonPath("$.data[0].tooltip").doesNotExist())
            .andExpect(jsonPath("$.data[0].tooltipZh").doesNotExist())
            .andExpect(jsonPath("$.data[0].damage").doesNotExist())
            .andExpect(jsonPath("$.data[0].defense").doesNotExist())
            .andExpect(jsonPath("$.data[0].createdAt").doesNotExist())
            .andExpect(jsonPath("$.data[0].updatedAt").doesNotExist());

        ArgumentCaptor<PageQuery> queryCaptor = ArgumentCaptor.forClass(PageQuery.class);
        verify(publicItemService).getPublicItems(queryCaptor.capture());
        PageQuery query = queryCaptor.getValue();
        assertEquals(1, query.getPage());
        assertEquals(36, query.getLimit());
        assertEquals("iron", query.getSearch());
        assertEquals(313L, query.getCategoryId());
        assertEquals("Blue", query.getRarity());
        assertEquals("name", query.getSortBy());
        assertEquals("asc", query.getSortDirection());
    }

    @Test
    void shouldDefaultPublicItemListLimitToOneHundred() throws Exception {
        Page<PublicItemListDTO> page = new Page<>(1, 100);
        page.setTotal(0);
        page.setRecords(List.of());

        when(publicItemService.getPublicItems(any(PageQuery.class))).thenReturn(page);

        mockMvc.perform(get("/public/items"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.pagination.limit").value(100));

        ArgumentCaptor<PageQuery> queryCaptor = ArgumentCaptor.forClass(PageQuery.class);
        verify(publicItemService).getPublicItems(queryCaptor.capture());
        PageQuery query = queryCaptor.getValue();
        assertEquals(1, query.getPage());
        assertEquals(100, query.getLimit());
    }

    @Test
    void shouldExposeOnlyLightweightFieldsForPublicItemSuggestions() throws Exception {
        PublicItemSuggestionDTO item = new PublicItemSuggestionDTO();
        item.setId(12L);
        item.setName("Wooden Arrow");
        item.setNameZh("Wooden Arrow");
        item.setInternalName("WoodenArrow");
        item.setImage("http://localhost:9000/terrapedia-images/items/wooden-arrow.png");
        item.setCategoryId(31L);
        item.setCategoryName("Ammo");
        item.setRarityId(0L);
        item.setRarity("White");

        when(publicItemService.searchSuggestions("wood", 5)).thenReturn(List.of(item));

        mockMvc.perform(get("/public/items/suggestions")
                .param("keyword", "  wood  ")
                .param("limit", "5"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].id").value(12))
            .andExpect(jsonPath("$.data[0].name").value("Wooden Arrow"))
            .andExpect(jsonPath("$.data[0].image").value("http://localhost:9000/terrapedia-images/items/wooden-arrow.png"))
            .andExpect(jsonPath("$.data[0].imageUrl").doesNotExist())
            .andExpect(jsonPath("$.data[0].category").doesNotExist())
            .andExpect(jsonPath("$.data[0].categoryName").value("Ammo"))
            .andExpect(jsonPath("$.data[0].rare").doesNotExist())
            .andExpect(jsonPath("$.data[0].rarity").value("White"))
            .andExpect(jsonPath("$.data[0].sourceNpcs").doesNotExist())
            .andExpect(jsonPath("$.data[0].sourceNpcsJson").doesNotExist())
            .andExpect(jsonPath("$.data[0].originalUrl").doesNotExist())
            .andExpect(jsonPath("$.data[0].description").doesNotExist())
            .andExpect(jsonPath("$.data[0].tooltip").doesNotExist())
            .andExpect(jsonPath("$.data[0].createdAt").doesNotExist())
            .andExpect(jsonPath("$.data[0].updatedAt").doesNotExist());

        verify(publicItemService).searchSuggestions("wood", 5);
    }

    @Test
    void shouldExposeOnlyPublicFieldsForPublicItemDetailShell() throws Exception {
        PublicItemDetailDTO item = new PublicItemDetailDTO();
        item.setId(77L);
        item.setName("Night Edge");
        item.setNameZh("Night Edge");
        item.setInternalName("NightEdge");
        item.setImage("http://localhost:9000/terrapedia-images/items/night-edge.png");
        item.setCategoryId(9L);
        item.setCategoryName("Weapons");
        item.setRarityId(3L);
        item.setRarity("Orange");
        item.setGamePeriodId(1L);
        item.setGamePeriod("Pre-Hardmode");
        item.setDescription("A strong pre-hardmode sword");
        item.setTooltip("Forged from darkness");
        item.setDamage(42);
        item.setStackSize(1);
        item.setIsStackable(false);

        when(publicItemService.getPublicItemById(77L)).thenReturn(item);

        mockMvc.perform(get("/public/items/77"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.id").value(77))
            .andExpect(jsonPath("$.data.name").value("Night Edge"))
            .andExpect(jsonPath("$.data.image").value("http://localhost:9000/terrapedia-images/items/night-edge.png"))
            .andExpect(jsonPath("$.data.categoryName").value("Weapons"))
            .andExpect(jsonPath("$.data.rarity").value("Orange"))
            .andExpect(jsonPath("$.data.description").value("A strong pre-hardmode sword"))
            .andExpect(jsonPath("$.data.tooltip").value("Forged from darkness"))
            .andExpect(jsonPath("$.data.sourceNpcs").doesNotExist())
            .andExpect(jsonPath("$.data.sourceNpcsJson").doesNotExist())
            .andExpect(jsonPath("$.data.imageUrl").doesNotExist())
            .andExpect(jsonPath("$.data.originalUrl").doesNotExist())
            .andExpect(jsonPath("$.data.categoryPaths").doesNotExist())
            .andExpect(jsonPath("$.data.createdAt").doesNotExist())
            .andExpect(jsonPath("$.data.updatedAt").doesNotExist());

        verify(publicItemService).getPublicItemById(77L);
    }
}

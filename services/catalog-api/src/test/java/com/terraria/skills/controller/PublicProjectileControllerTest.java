package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.PublicProjectileListDTO;
import com.terraria.skills.dto.PublicProjectileQuery;
import com.terraria.skills.service.PublicProjectileService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class PublicProjectileControllerTest {

    @Mock
    private PublicProjectileService publicProjectileService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        PublicProjectileController controller = new PublicProjectileController(publicProjectileService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldExposePublicProjectileListWithPaginationAndSearch() throws Exception {
        PublicProjectileListDTO projectile = new PublicProjectileListDTO();
        projectile.setId(1L);
        projectile.setSourceId(101);
        projectile.setInternalName("WoodenArrowFriendly");
        projectile.setName("Wooden Arrow");
        projectile.setNameZh("木箭");
        projectile.setImageUrl("http://localhost:9000/terrapedia-images/items/wiki/projectiles/wooden-arrow.png");
        projectile.setAiStyle(1);
        projectile.setDamage(5);
        projectile.setKnockBack(BigDecimal.valueOf(1.5));
        projectile.setHostile(false);
        projectile.setFriendly(true);

        Page<PublicProjectileListDTO> page = new Page<>(2, 24);
        page.setTotal(25);
        page.setRecords(List.of(projectile));

        when(publicProjectileService.getPublicProjectiles(any(PublicProjectileQuery.class))).thenReturn(page);

        mockMvc.perform(get("/public/projectiles")
                .param("page", "2")
                .param("limit", "24")
                .param("search", "arrow")
                .param("sortBy", "damage")
                .param("sortDirection", "desc"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.pagination.total").value(25))
            .andExpect(jsonPath("$.pagination.page").value(2))
            .andExpect(jsonPath("$.pagination.limit").value(24))
            .andExpect(jsonPath("$.data[0].id").value(1))
            .andExpect(jsonPath("$.data[0].sourceId").value(101))
            .andExpect(jsonPath("$.data[0].internalName").value("WoodenArrowFriendly"))
            .andExpect(jsonPath("$.data[0].name").value("Wooden Arrow"))
            .andExpect(jsonPath("$.data[0].nameZh").value("木箭"))
            .andExpect(jsonPath("$.data[0].imageUrl").value("http://localhost:9000/terrapedia-images/items/wiki/projectiles/wooden-arrow.png"))
            .andExpect(jsonPath("$.data[0].aiStyle").value(1))
            .andExpect(jsonPath("$.data[0].damage").value(5))
            .andExpect(jsonPath("$.data[0].knockBack").value(1.5))
            .andExpect(jsonPath("$.data[0].hostile").value(false))
            .andExpect(jsonPath("$.data[0].friendly").value(true))
            .andExpect(jsonPath("$.data[0].rawJson").doesNotExist())
            .andExpect(jsonPath("$.data[0].sourceItemsJson").doesNotExist())
            .andExpect(jsonPath("$.data[0].sourceNpcsJson").doesNotExist())
            .andExpect(jsonPath("$.data[0].status").doesNotExist())
            .andExpect(jsonPath("$.data[0].createdAt").doesNotExist())
            .andExpect(jsonPath("$.data[0].updatedAt").doesNotExist());

        ArgumentCaptor<PublicProjectileQuery> queryCaptor = ArgumentCaptor.forClass(PublicProjectileQuery.class);
        verify(publicProjectileService).getPublicProjectiles(queryCaptor.capture());
        PublicProjectileQuery query = queryCaptor.getValue();
        assertEquals(2, query.getPage());
        assertEquals(24, query.getLimit());
        assertEquals("arrow", query.getSearch());
        assertEquals("damage", query.getSortBy());
        assertEquals("desc", query.getSortDirection());
    }

    @Test
    void shouldKeepImageUrlFieldAndAllowNullWhenFilteredByManagedPolicy() throws Exception {
        PublicProjectileListDTO projectile = new PublicProjectileListDTO();
        projectile.setId(2L);
        projectile.setSourceId(102);
        projectile.setInternalName("BoneArrowFriendly");
        projectile.setName("Bone Arrow");
        projectile.setNameZh("骨箭");
        projectile.setImageUrl(null);
        projectile.setAiStyle(2);
        projectile.setDamage(8);
        projectile.setKnockBack(BigDecimal.valueOf(2.75));
        projectile.setHostile(false);
        projectile.setFriendly(true);

        Page<PublicProjectileListDTO> page = new Page<>(1, 20);
        page.setTotal(1);
        page.setRecords(List.of(projectile));

        when(publicProjectileService.getPublicProjectiles(any(PublicProjectileQuery.class))).thenReturn(page);

        mockMvc.perform(get("/public/projectiles"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].id").value(2))
            .andExpect(jsonPath("$.data[0].imageUrl").isEmpty());
    }
}

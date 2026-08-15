package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.CategoryDTO;
import com.terraria.skills.service.CategoryManagementService;
import com.terraria.skills.service.CategoryNavigationService;
import com.terraria.skills.service.CategoryNavigationUnavailableException;
import com.terraria.skills.vo.CategoryNavigationVO;
import com.terraria.skills.vo.CategoryNavigationChildVO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.hamcrest.Matchers.nullValue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class CategoryControllerTest {

    @Mock
    private CategoryManagementService categoryManagementService;

    @Mock
    private CategoryNavigationService categoryNavigationService;

    @InjectMocks
    private CategoryController categoryController;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(categoryController)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldReturnItemOnlyCategoryTree() throws Exception {
        CategoryDTO weapon = new CategoryDTO();
        weapon.setId(1L);
        weapon.setName("Weapon");
        weapon.setCode("WEAPON");

        when(categoryManagementService.buildItemCategoryTree()).thenReturn(List.of(weapon));

        mockMvc.perform(get("/categories/items"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].code").value("WEAPON"))
            .andExpect(jsonPath("$.data.length()").value(1));

        verify(categoryManagementService).buildItemCategoryTree();
    }

    @Test
    void shouldReturnPublicCategoryNavigation() throws Exception {
        CategoryNavigationChildVO melee = new CategoryNavigationChildVO();
        melee.setId(11L);
        melee.setCode("WEAPON_MELEE");
        melee.setName("近战武器");
        melee.setCategoryIds(List.of(11L, 12L));
        melee.setItemPath("/items?category=WEAPON_MELEE");
        melee.setItemCount(36L);
        melee.setImage("/terrapedia-images/items/weapon-melee.png");
        CategoryNavigationChildVO armorOther = new CategoryNavigationChildVO();
        armorOther.setId(21L);
        armorOther.setCode("ARMOR_OTHER");
        armorOther.setName("其他盔甲");
        armorOther.setCategoryIds(List.of(21L));
        armorOther.setItemPath("/items?category=ARMOR_OTHER");
        armorOther.setItemCount(0L);
        armorOther.setImage(null);
        CategoryNavigationVO weapon = new CategoryNavigationVO();
        weapon.setSlug("weapons");
        weapon.setFilterKey("weapon");
        weapon.setName("武器");
        weapon.setCategoryPath("/categories/weapons");
        weapon.setItemPath("/items?filter=weapon");
        weapon.setCategoryCodes(List.of("WEAPON"));
        weapon.setCategoryIds(List.of(1L, 11L));
        weapon.setItemCount(37L);
        weapon.setChildren(List.of(melee, armorOther));
        when(categoryNavigationService.getNavigation()).thenReturn(List.of(weapon));

        mockMvc.perform(get("/categories/navigation"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.statusCode").value(200))
            .andExpect(jsonPath("$.data[0].slug").value("weapons"))
            .andExpect(jsonPath("$.data[0].filterKey").value("weapon"))
            .andExpect(jsonPath("$.data[0].categoryIds[1]").value(11))
            .andExpect(jsonPath("$.data[0].itemCount").value(37))
            .andExpect(jsonPath("$.data[0].children[0].categoryIds[1]").value(12))
            .andExpect(jsonPath("$.data[0].children[0].itemPath").value("/items?category=WEAPON_MELEE"))
            .andExpect(jsonPath("$.data[0].children[0].itemCount").value(36))
            .andExpect(jsonPath("$.data[0].children[0].image").value("/terrapedia-images/items/weapon-melee.png"))
            .andExpect(jsonPath("$.data[0].children[1].image").value(nullValue()));
    }

    @Test
    void shouldReturnServiceUnavailableWithoutPartialNavigation() throws Exception {
        when(categoryNavigationService.getNavigation())
            .thenThrow(new CategoryNavigationUnavailableException("Missing category codes: TOOL"));

        mockMvc.perform(get("/categories/navigation"))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.statusCode").value(503))
            .andExpect(jsonPath("$.data").doesNotExist());
    }
}

package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.terraria.skills.dto.RecipeDTO;
import com.terraria.skills.dto.RecipeTreeItemDTO;
import com.terraria.skills.dto.RecipeTreeMetaDTO;
import com.terraria.skills.dto.RecipeTreeResponseDTO;
import com.terraria.skills.dto.RecipeTreeVariantDTO;
import com.terraria.skills.service.RecipeService;
import com.terraria.skills.service.RecipeTreeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AdminItemRecipeControllerTest {

    @Mock
    private RecipeService recipeService;

    @Mock
    private RecipeTreeService recipeTreeService;

    @InjectMocks
    private AdminItemRecipeController controller;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        ObjectMapper objectMapper = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

        mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
            .build();
    }

    @Test
    void shouldReturnRecipeList() throws Exception {
        RecipeDTO recipe = new RecipeDTO();
        recipe.setId(31L);
        recipe.setResultItemId(1L);

        when(recipeService.getRecipesByResultItemId(1L)).thenReturn(List.of(recipe));

        mockMvc.perform(get("/admin/items/1/recipes").accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.length()").value(1))
            .andExpect(jsonPath("$.data[0].id").value(31));

        verify(recipeService).getRecipesByResultItemId(1L);
    }

    @Test
    void shouldReturnRecipeTree() throws Exception {
        RecipeTreeItemDTO item = new RecipeTreeItemDTO();
        item.setId(1L);
        item.setName("Abeemination");

        RecipeTreeVariantDTO variant = new RecipeTreeVariantDTO();
        variant.setVariantKey("modern");
        variant.setVariantLabel("Desktop / Console / Mobile");
        variant.setRecipeCount(1);

        RecipeTreeResponseDTO response = new RecipeTreeResponseDTO();
        response.setItem(item);
        RecipeTreeMetaDTO meta = new RecipeTreeMetaDTO();
        meta.setMaxDepth(4);
        meta.setMode("grouped");
        response.setTreeMeta(meta);
        response.setVariants(List.of(variant));

        when(recipeTreeService.getRecipeTreeByItemId(1L, 4)).thenReturn(response);

        mockMvc.perform(get("/admin/items/1/recipe-tree")
                .param("maxDepth", "4")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.item.id").value(1))
            .andExpect(jsonPath("$.data.treeMeta.maxDepth").value(4))
            .andExpect(jsonPath("$.data.variants.length()").value(1))
            .andExpect(jsonPath("$.data.variants[0].variantKey").value("modern"));

        verify(recipeTreeService).getRecipeTreeByItemId(1L, 4);
    }

    @Test
    void shouldReplaceDesktopRecipesWithScopeMode() throws Exception {
        RecipeDTO recipe = new RecipeDTO();
        recipe.setId(51L);
        recipe.setResultItemId(1L);

        when(recipeService.replaceRecipesForResultItemId(1L, List.of(), "desktop")).thenReturn(List.of(recipe));

        mockMvc.perform(put("/admin/items/1/recipes")
                .param("scopeMode", "desktop")
                .contentType(MediaType.APPLICATION_JSON)
                .content("[]"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].id").value(51));

        verify(recipeService).replaceRecipesForResultItemId(1L, List.of(), "desktop");
    }
}

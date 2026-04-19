package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.terraria.skills.dto.RecipeConditionDTO;
import com.terraria.skills.dto.RecipeDTO;
import com.terraria.skills.dto.RecipeStationDTO;
import com.terraria.skills.dto.RecipeTreeItemDTO;
import com.terraria.skills.dto.RecipeTreeMetaDTO;
import com.terraria.skills.dto.RecipeTreeNodeDTO;
import com.terraria.skills.dto.RecipeTreeResponseDTO;
import com.terraria.skills.dto.RecipeTreeStationDTO;
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

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class ItemRecipeControllerTest {

    @Mock
    private RecipeService recipeService;

    @Mock
    private RecipeTreeService recipeTreeService;

    @InjectMocks
    private ItemRecipeController controller;

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
        recipe.setVersionScope("Desktop version only");
        recipe.setSourceProvider("wiki_zh");
        recipe.setSourcePage("配方/水");
        recipe.setSourceRevisionTimestamp(LocalDateTime.of(2026, 4, 20, 6, 0));

        RecipeStationDTO station = new RecipeStationDTO();
        station.setStationId(30L);
        station.setStationNameRaw("水");
        station.setItemName("Water");
        station.setItemNameZh("水");
        station.setStationType("environment");
        recipe.setStations(List.of(station));

        RecipeConditionDTO condition = new RecipeConditionDTO();
        condition.setRefType("WORLD_CONTEXT");
        condition.setRefId(7L);
        condition.setRefCode("FULL_MOON");
        condition.setRefNameEn("Full Moon");
        condition.setRefNameZh("满月");
        recipe.setConditions(List.of(condition));

        when(recipeService.getRecipesByResultItemId(1L)).thenReturn(List.of(recipe));

        mockMvc.perform(get("/items/1/recipes").accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.length()").value(1))
            .andExpect(jsonPath("$.data[0].id").value(31))
            .andExpect(jsonPath("$.data[0].versionScope").value("Desktop version only"))
            .andExpect(jsonPath("$.data[0].sourceProvider").value("wiki_zh"))
            .andExpect(jsonPath("$.data[0].stations[0].stationType").value("environment"))
            .andExpect(jsonPath("$.data[0].conditions[0].refCode").value("FULL_MOON"));

        verify(recipeService).getRecipesByResultItemId(1L);
    }

    @Test
    void shouldReturnRecipeTree() throws Exception {
        RecipeTreeItemDTO item = new RecipeTreeItemDTO();
        item.setId(1L);
        item.setName("Abeemination");

        RecipeTreeVariantDTO variant = new RecipeTreeVariantDTO();
        variant.setVariantKey("desktop");
        variant.setVariantLabel("Desktop");
        variant.setRecipeCount(1);
        variant.setVersionScope("Desktop version only");

        RecipeTreeStationDTO treeStation = new RecipeTreeStationDTO();
        treeStation.setStationName("Water");
        treeStation.setStationNameZh("水");
        treeStation.setStationType("environment");

        RecipeTreeNodeDTO root = new RecipeTreeNodeDTO();
        root.setRecipeId(901L);
        root.setItemId(1L);
        root.setItemName("Abeemination");
        root.setItemNameZh("憎恶之蜂");
        root.setStations(List.of(treeStation));
        variant.setRoots(List.of(root));

        RecipeTreeResponseDTO response = new RecipeTreeResponseDTO();
        response.setItem(item);
        RecipeTreeMetaDTO meta = new RecipeTreeMetaDTO();
        meta.setMaxDepth(4);
        meta.setMode("grouped");
        response.setTreeMeta(meta);
        response.setVariants(List.of(variant));

        when(recipeTreeService.getRecipeTreeByItemId(1L, 4)).thenReturn(response);

        mockMvc.perform(get("/items/1/recipe-tree")
                .param("maxDepth", "4")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.item.id").value(1))
            .andExpect(jsonPath("$.data.treeMeta.maxDepth").value(4))
            .andExpect(jsonPath("$.data.variants.length()").value(1))
            .andExpect(jsonPath("$.data.variants[0].variantKey").value("desktop"))
            .andExpect(jsonPath("$.data.variants[0].versionScope").value("Desktop version only"))
            .andExpect(jsonPath("$.data.variants[0].roots[0].recipeId").value(901))
            .andExpect(jsonPath("$.data.variants[0].roots[0].stations[0].stationType").value("environment"));

        verify(recipeTreeService).getRecipeTreeByItemId(1L, 4);
    }
}

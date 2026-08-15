package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.terraria.skills.dto.RecipeDTO;
import com.terraria.skills.dto.RecipeGroupMemberDTO;
import com.terraria.skills.dto.RecipeTreeItemDTO;
import com.terraria.skills.dto.RecipeTreeNodeDTO;
import com.terraria.skills.dto.RecipeTreeResponseDTO;
import com.terraria.skills.dto.RecipeTreeStationDTO;
import com.terraria.skills.dto.RecipeTreeVariantDTO;
import com.terraria.skills.service.PublicRecipeTreeFacade;
import com.terraria.skills.service.RecipeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class PublicItemRecipeControllerTest {

    @Mock
    private PublicRecipeTreeFacade publicRecipeTreeFacade;

    @Mock
    private RecipeService recipeService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        ObjectMapper objectMapper = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

        mockMvc = MockMvcBuilders.standaloneSetup(new PublicItemRecipeController(publicRecipeTreeFacade, recipeService))
            .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
            .build();
    }

    @Test
    void shouldReturnPublicRecipeTreeWithoutWikiImages() throws Exception {
        RecipeTreeItemDTO item = new RecipeTreeItemDTO();
        item.setId(1L);
        item.setName("Abeemination");
        item.setImage(null);

        RecipeGroupMemberDTO groupMember = new RecipeGroupMemberDTO();
        groupMember.setName("Honey Block");
        groupMember.setImage(null);

        RecipeTreeStationDTO treeStation = new RecipeTreeStationDTO();
        treeStation.setStationName("Water");
        treeStation.setStationImage(null);

        RecipeTreeNodeDTO root = new RecipeTreeNodeDTO();
        root.setRecipeId(901L);
        root.setItemId(1L);
        root.setItemName("Abeemination");
        root.setItemImage(null);
        root.setGroupMembers(List.of(groupMember));
        root.setStations(List.of(treeStation));

        RecipeTreeNodeDTO managedChild = new RecipeTreeNodeDTO();
        managedChild.setItemId(2L);
        managedChild.setItemName("Stinger");
        managedChild.setItemImage("/terrapedia-images/items/stinger.png");

        RecipeTreeNodeDTO fakeManagedPathChild = new RecipeTreeNodeDTO();
        fakeManagedPathChild.setItemId(3L);
        fakeManagedPathChild.setItemName("Fake");
        fakeManagedPathChild.setItemImage(null);
        root.setChildren(List.of(managedChild, fakeManagedPathChild));

        RecipeTreeVariantDTO variant = new RecipeTreeVariantDTO();
        variant.setVariantKey("desktop");
        variant.setRoots(List.of(root));

        RecipeTreeResponseDTO response = new RecipeTreeResponseDTO();
        response.setItem(item);
        response.setVariants(List.of(variant));

        when(publicRecipeTreeFacade.getPublicRecipeTree(1L, 4)).thenReturn(response);

        mockMvc.perform(get("/public/items/1/recipe-tree")
                .param("maxDepth", "4")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.item.id").value(1))
            .andExpect(jsonPath("$.data.item.image").doesNotExist())
            .andExpect(jsonPath("$.data.variants[0].roots[0].itemImage").doesNotExist())
            .andExpect(jsonPath("$.data.variants[0].roots[0].groupMembers[0].image").doesNotExist())
            .andExpect(jsonPath("$.data.variants[0].roots[0].stations[0].stationImage").doesNotExist())
            .andExpect(jsonPath("$.data.variants[0].roots[0].children[0].itemImage").value("/terrapedia-images/items/stinger.png"))
            .andExpect(jsonPath("$.data.variants[0].roots[0].children[1].itemImage").doesNotExist());

        verify(publicRecipeTreeFacade).getPublicRecipeTree(1L, 4);
    }

    @Test
    void shouldReturnPublicRecipeUsagesForIngredientItem() throws Exception {
        RecipeDTO ironBarRecipe = new RecipeDTO();
        ironBarRecipe.setId(101L);
        ironBarRecipe.setResultItemId(68L);
        ironBarRecipe.setResultItemNameZh("铁锭");

        when(recipeService.getRecipesByIngredientItemId(11L)).thenReturn(List.of(ironBarRecipe));

        mockMvc.perform(get("/public/items/11/recipe-usages")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].id").value(101))
            .andExpect(jsonPath("$.data[0].resultItemId").value(68))
            .andExpect(jsonPath("$.data[0].resultItemNameZh").value("铁锭"));

        verify(recipeService).getRecipesByIngredientItemId(11L);
    }
}

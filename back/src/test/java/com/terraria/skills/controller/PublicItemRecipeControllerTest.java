package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.terraria.skills.dto.RecipeGroupMemberDTO;
import com.terraria.skills.dto.RecipeTreeItemDTO;
import com.terraria.skills.dto.RecipeTreeNodeDTO;
import com.terraria.skills.dto.RecipeTreeResponseDTO;
import com.terraria.skills.dto.RecipeTreeStationDTO;
import com.terraria.skills.dto.RecipeTreeVariantDTO;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import com.terraria.skills.service.RecipeTreeService;
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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class PublicItemRecipeControllerTest {

    private static final ManagedImageUrlPolicy MANAGED_IMAGE_URL_POLICY = new ManagedImageUrlPolicy() {
        @Override
        public boolean isManagedImageUrl(String value) {
            return value != null && value.startsWith("http://localhost:9000/terrapedia-images/items/");
        }

        @Override
        public List<String> trustedManagedImageUrlPrefixes() {
            return List.of("http://localhost:9000/terrapedia-images/items/");
        }
    };

    @Mock
    private RecipeTreeService recipeTreeService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        ObjectMapper objectMapper = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

        mockMvc = MockMvcBuilders.standaloneSetup(new PublicItemRecipeController(recipeTreeService, MANAGED_IMAGE_URL_POLICY))
            .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
            .build();
    }

    @Test
    void shouldReturnPublicRecipeTreeWithoutWikiImages() throws Exception {
        RecipeTreeItemDTO item = new RecipeTreeItemDTO();
        item.setId(1L);
        item.setName("Abeemination");
        item.setImage("https://terraria.wiki.gg/wiki/File:Abeemination.png");

        RecipeGroupMemberDTO groupMember = new RecipeGroupMemberDTO();
        groupMember.setName("Honey Block");
        groupMember.setImage("https://terraria.wiki.gg/images/Honey_Block.png");

        RecipeTreeStationDTO treeStation = new RecipeTreeStationDTO();
        treeStation.setStationName("Water");
        treeStation.setStationImage("https://static.wikia.nocookie.net/terraria_gamepedia/images/Water.png");

        RecipeTreeNodeDTO root = new RecipeTreeNodeDTO();
        root.setRecipeId(901L);
        root.setItemId(1L);
        root.setItemName("Abeemination");
        root.setItemImage("https://static.wikia.nocookie.net/terraria_gamepedia/images/Abeemination.png");
        root.setGroupMembers(List.of(groupMember));
        root.setStations(List.of(treeStation));

        RecipeTreeNodeDTO managedChild = new RecipeTreeNodeDTO();
        managedChild.setItemId(2L);
        managedChild.setItemName("Stinger");
        managedChild.setItemImage("http://localhost:9000/terrapedia-images/items/stinger.png");

        RecipeTreeNodeDTO fakeManagedPathChild = new RecipeTreeNodeDTO();
        fakeManagedPathChild.setItemId(3L);
        fakeManagedPathChild.setItemName("Fake");
        fakeManagedPathChild.setItemImage("https://example.com/terrapedia-images/items/fake.png");
        root.setChildren(List.of(managedChild, fakeManagedPathChild));

        RecipeTreeVariantDTO variant = new RecipeTreeVariantDTO();
        variant.setVariantKey("desktop");
        variant.setRoots(List.of(root));

        RecipeTreeResponseDTO response = new RecipeTreeResponseDTO();
        response.setItem(item);
        response.setVariants(List.of(variant));

        when(recipeTreeService.getRecipeTreeByItemId(1L, 4)).thenReturn(response);

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
            .andExpect(jsonPath("$.data.variants[0].roots[0].children[0].itemImage").value("http://localhost:9000/terrapedia-images/items/stinger.png"))
            .andExpect(jsonPath("$.data.variants[0].roots[0].children[1].itemImage").doesNotExist());

        assertEquals("https://terraria.wiki.gg/wiki/File:Abeemination.png", response.getItem().getImage());
        assertEquals("https://static.wikia.nocookie.net/terraria_gamepedia/images/Abeemination.png", root.getItemImage());
        assertEquals("https://terraria.wiki.gg/images/Honey_Block.png", groupMember.getImage());
        assertEquals("https://static.wikia.nocookie.net/terraria_gamepedia/images/Water.png", treeStation.getStationImage());
        verify(recipeTreeService).getRecipeTreeByItemId(1L, 4);
    }
}

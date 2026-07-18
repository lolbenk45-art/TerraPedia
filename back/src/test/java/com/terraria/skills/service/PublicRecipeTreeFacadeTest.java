package com.terraria.skills.service;

import com.terraria.skills.dto.RecipeGroupMemberDTO;
import com.terraria.skills.dto.RecipeTreeItemDTO;
import com.terraria.skills.dto.RecipeTreeNodeDTO;
import com.terraria.skills.dto.RecipeTreeResponseDTO;
import com.terraria.skills.dto.RecipeTreeStationDTO;
import com.terraria.skills.dto.RecipeTreeVariantDTO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PublicRecipeTreeFacadeTest {

    private static final ManagedImageUrlPolicy POLICY = new ManagedImageUrlPolicy() {
        @Override
        public boolean isManagedImageUrl(String value) {
            return value != null && value.startsWith("/terrapedia-images/items/");
        }

        @Override
        public List<String> trustedManagedImageUrlPrefixes() {
            return List.of("/terrapedia-images/items/");
        }
    };

    @Mock
    private RecipeTreeService recipeTreeService;

    @Test
    void shouldCopyAndRecursivelyStripNonManagedImagesWithoutMutatingSource() {
        RecipeTreeItemDTO item = new RecipeTreeItemDTO();
        item.setId(1327L);
        item.setImage("https://terraria.wiki.gg/Solar_Helmet.png");

        RecipeGroupMemberDTO member = new RecipeGroupMemberDTO();
        member.setImage("https://terraria.wiki.gg/Fragment.png");
        RecipeTreeStationDTO station = new RecipeTreeStationDTO();
        station.setStationImage("https://static.wikia.nocookie.net/Ancient-Manipulator.png");

        RecipeTreeNodeDTO child = new RecipeTreeNodeDTO();
        child.setItemId(3458L);
        child.setItemImage("/terrapedia-images/items/solar-fragment.png");
        RecipeTreeNodeDTO root = new RecipeTreeNodeDTO();
        root.setItemId(1327L);
        root.setItemImage("https://terraria.wiki.gg/Solar_Helmet.png");
        root.setGroupMemberNames(new ArrayList<>(List.of("Any Iron Bar")));
        root.setGroupMembers(List.of(member));
        root.setStations(List.of(station));
        root.setChildren(List.of(child));

        RecipeTreeVariantDTO variant = new RecipeTreeVariantDTO();
        variant.setRoots(List.of(root));
        RecipeTreeResponseDTO source = new RecipeTreeResponseDTO();
        source.setItem(item);
        source.setVariants(List.of(variant));
        when(recipeTreeService.getRecipeTreeByItemId(1327L, 1)).thenReturn(source);

        PublicRecipeTreeFacade facade = new PublicRecipeTreeFacade(recipeTreeService, POLICY);
        RecipeTreeResponseDTO result = facade.getPublicRecipeTree(1327L, 1);

        assertNull(result.getItem().getImage());
        assertNull(result.getVariants().get(0).getRoots().get(0).getItemImage());
        assertNull(result.getVariants().get(0).getRoots().get(0).getGroupMembers().get(0).getImage());
        assertNull(result.getVariants().get(0).getRoots().get(0).getStations().get(0).getStationImage());
        assertEquals("/terrapedia-images/items/solar-fragment.png",
            result.getVariants().get(0).getRoots().get(0).getChildren().get(0).getItemImage());
        result.getVariants().get(0).getRoots().get(0).getGroupMemberNames().add("Any Lead Bar");
        assertEquals(List.of("Any Iron Bar"), root.getGroupMemberNames());
        assertEquals("https://terraria.wiki.gg/Solar_Helmet.png", source.getItem().getImage());
        assertEquals("https://terraria.wiki.gg/Solar_Helmet.png", root.getItemImage());
        assertEquals("https://terraria.wiki.gg/Fragment.png", member.getImage());
        assertEquals("https://static.wikia.nocookie.net/Ancient-Manipulator.png", station.getStationImage());
        verify(recipeTreeService).getRecipeTreeByItemId(1327L, 1);
    }

    @Test
    void shouldReturnNullWhenInternalTreeIsNull() {
        when(recipeTreeService.getRecipeTreeByItemId(99L, 1)).thenReturn(null);

        PublicRecipeTreeFacade facade = new PublicRecipeTreeFacade(recipeTreeService, POLICY);

        assertNull(facade.getPublicRecipeTree(99L, 1));
        verify(recipeTreeService).getRecipeTreeByItemId(99L, 1);
    }
}

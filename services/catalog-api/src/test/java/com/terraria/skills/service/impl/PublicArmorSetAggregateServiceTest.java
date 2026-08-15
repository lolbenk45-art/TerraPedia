package com.terraria.skills.service.impl;

import com.terraria.skills.dto.PublicArmorSetDetailDTO;
import com.terraria.skills.dto.PublicArmorSetListDTO;
import com.terraria.skills.dto.PublicArmorSetRelatedItemDTO;
import com.terraria.skills.dto.PublicItemEquipmentEffectDTO;
import com.terraria.skills.dto.RecipeTreeResponseDTO;
import com.terraria.skills.service.PublicArmorSetService;
import com.terraria.skills.service.PublicItemService;
import com.terraria.skills.service.PublicRecipeTreeFacade;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PublicArmorSetAggregateServiceTest {

    @Mock
    private PublicArmorSetService armorSetService;

    @Mock
    private PublicItemService itemService;

    @Mock
    private PublicRecipeTreeFacade recipeTreeFacade;

    @Test
    void shouldReturnOriginalBaseDtoWhenNoKnownModuleIsRequested() {
        PublicArmorSetListDTO base = armorSet(20L, 22L);
        when(armorSetService.getPublicArmorSetById(20L)).thenReturn(base);

        PublicArmorSetListDTO result = service().getPublicArmorSetById(20L, "unknown,all");

        assertSame(base, result);
        verify(itemService, never()).getPublicItemEquipmentEffects(anyLong());
        verify(recipeTreeFacade, never()).getPublicRecipeTree(anyLong(), anyInt());
    }

    @Test
    void shouldReturnNullWithoutCallingPieceServicesWhenArmorSetIsMissing() {
        when(armorSetService.getPublicArmorSetById(404L)).thenReturn(null);

        PublicArmorSetListDTO result = service().getPublicArmorSetById(404L, "piece-effects,recipes");

        assertNull(result);
        verify(itemService, never()).getPublicItemEquipmentEffects(anyLong());
        verify(recipeTreeFacade, never()).getPublicRecipeTree(anyLong(), anyInt());
    }

    @Test
    void shouldDeduplicateIdsPreserveOrderAndIsolatePieceFailures() {
        PublicArmorSetListDTO base = armorSet(20L, 22L, 11L, 22L, null, -1L);
        PublicItemEquipmentEffectDTO effect = new PublicItemEquipmentEffectDTO();
        effect.setItemId(22L);
        RecipeTreeResponseDTO recipe = new RecipeTreeResponseDTO();
        when(armorSetService.getPublicArmorSetById(20L)).thenReturn(base);
        when(itemService.getPublicItemEquipmentEffects(22L)).thenReturn(List.of(effect));
        when(itemService.getPublicItemEquipmentEffects(11L))
            .thenThrow(new IllegalStateException("effect unavailable"));
        when(recipeTreeFacade.getPublicRecipeTree(22L, 1))
            .thenThrow(new IllegalArgumentException("item missing"));
        when(recipeTreeFacade.getPublicRecipeTree(11L, 1)).thenReturn(recipe);

        PublicArmorSetDetailDTO result = (PublicArmorSetDetailDTO) service()
            .getPublicArmorSetById(20L, " recipes,PIECE-EFFECTS,recipes ");

        assertEquals(base.getName(), result.getName());
        assertEquals(List.of(22L, 11L), List.copyOf(result.getPieceEffects().keySet()));
        assertEquals(List.of(effect), result.getPieceEffects().get(22L));
        assertEquals(List.of(), result.getPieceEffects().get(11L));
        assertEquals(List.of(11L), List.copyOf(result.getPieceRecipes().keySet()));
        assertSame(recipe, result.getPieceRecipes().get(11L));
        verify(itemService).getPublicItemEquipmentEffects(22L);
        verify(itemService).getPublicItemEquipmentEffects(11L);
        verify(recipeTreeFacade).getPublicRecipeTree(22L, 1);
        verify(recipeTreeFacade).getPublicRecipeTree(11L, 1);
    }

    @Test
    void shouldExposeRequestedEmptyMapAndSkipUnrequestedModule() {
        PublicArmorSetListDTO base = armorSet(20L);
        when(armorSetService.getPublicArmorSetById(20L)).thenReturn(base);

        PublicArmorSetDetailDTO result = (PublicArmorSetDetailDTO) service()
            .getPublicArmorSetById(20L, "piece-effects");

        assertTrue(result.getPieceEffects().isEmpty());
        assertNull(result.getPieceRecipes());
        verify(recipeTreeFacade, never()).getPublicRecipeTree(anyLong(), anyInt());
    }

    @Test
    void shouldNormalizeNullPieceEffectsToEmptyList() {
        PublicArmorSetListDTO base = armorSet(20L, 22L);
        when(armorSetService.getPublicArmorSetById(20L)).thenReturn(base);
        when(itemService.getPublicItemEquipmentEffects(22L)).thenReturn(null);

        PublicArmorSetDetailDTO result = (PublicArmorSetDetailDTO) service()
            .getPublicArmorSetById(20L, "piece-effects");

        assertEquals(List.of(), result.getPieceEffects().get(22L));
        verify(itemService).getPublicItemEquipmentEffects(22L);
    }

    private PublicArmorSetAggregateService service() {
        return new PublicArmorSetAggregateService(armorSetService, itemService, recipeTreeFacade);
    }

    private PublicArmorSetListDTO armorSet(Long id, Long... itemIds) {
        PublicArmorSetListDTO dto = new PublicArmorSetListDTO();
        dto.setId(id);
        dto.setName("Solar Flare armor");
        dto.setRelatedItems(Arrays.stream(itemIds).map(itemId -> {
            PublicArmorSetRelatedItemDTO item = new PublicArmorSetRelatedItemDTO();
            item.setItemId(itemId);
            return item;
        }).toList());
        return dto;
    }
}

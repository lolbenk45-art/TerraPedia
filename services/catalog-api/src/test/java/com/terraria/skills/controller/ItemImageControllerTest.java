package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.ItemImageDTO;
import com.terraria.skills.service.ItemImageService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ItemImageControllerTest {

    @Mock
    private ItemImageService itemImageService;

    @InjectMocks
    private ItemImageController itemImageController;

    @Test
    void shouldReturnImagesWrappedInApiResponse() {
        ItemImageDTO dto = new ItemImageDTO();
        dto.setItemId(7L);
        dto.setRole("icon");
        dto.setCachedUrl("https://cdn.example.com/items/7.png");
        dto.setIsPrimary(Boolean.TRUE);
        dto.setSortOrder(0);

        when(itemImageService.getImagesByItemId(7L)).thenReturn(List.of(dto));

        ResponseEntity<ApiResponse<List<ItemImageDTO>>> response = itemImageController.getItemImages(7L);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().isSuccess());
        assertEquals(1, response.getBody().getData().size());
        assertEquals("https://cdn.example.com/items/7.png", response.getBody().getData().get(0).getCachedUrl());
    }

    @Test
    void shouldDelegateItemIdToService() {
        when(itemImageService.getImagesByItemId(42L)).thenReturn(List.of());

        itemImageController.getItemImages(42L);

        verify(itemImageService).getImagesByItemId(42L);
    }
}

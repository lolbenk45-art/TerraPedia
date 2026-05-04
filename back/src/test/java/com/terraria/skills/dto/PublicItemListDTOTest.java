package com.terraria.skills.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

class PublicItemListDTOTest {

    @Test
    void shouldRoundTripThroughJsonCacheWithoutAliasPropertyErrors() {
        ObjectMapper objectMapper = new ObjectMapper();

        PublicItemListDTO dto = new PublicItemListDTO();
        dto.setId(1L);
        dto.setName("Iron Pickaxe");
        dto.setImage("https://cdn.example.com/items/iron-pickaxe.png");
        dto.setCategoryName("Pickaxes");
        dto.setRarity("Blue");

        String json = assertDoesNotThrow(() -> objectMapper.writeValueAsString(dto));
        PublicItemListDTO restored = assertDoesNotThrow(() -> objectMapper.readValue(json, PublicItemListDTO.class));

        assertFalse(json.contains("imageUrl"));
        assertFalse(json.contains("category\""));
        assertFalse(json.contains("rare\""));
        assertEquals(dto.getImage(), restored.getImage());
        assertEquals(dto.getCategoryName(), restored.getCategoryName());
        assertEquals(dto.getRarity(), restored.getRarity());
    }
}

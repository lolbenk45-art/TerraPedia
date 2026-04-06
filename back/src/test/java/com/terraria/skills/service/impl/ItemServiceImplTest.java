package com.terraria.skills.service.impl;

import com.terraria.skills.dto.ItemDTO;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.CategoryManagementService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ItemServiceImplTest {

    @Mock
    private ItemMapper itemMapper;

    @Mock
    private CategoryManagementService categoryManagementService;

    @InjectMocks
    private ItemServiceImpl itemService;

    @Test
    void shouldReturnEmptySuggestionListForBlankKeyword() {
        List<ItemDTO> suggestions = itemService.searchSuggestions("   ", 8);

        assertTrue(suggestions.isEmpty());
        verifyNoInteractions(itemMapper);
    }

    @Test
    void shouldTrimKeywordClampLimitAndNormalizeRarityForSuggestions() {
        ItemDTO suggestion = new ItemDTO();
        suggestion.setId(100L);
        suggestion.setName("魔光剑");
        suggestion.setRarityId(4L);

        when(itemMapper.selectItemSuggestions("魔", 10)).thenReturn(List.of(suggestion));

        List<ItemDTO> suggestions = itemService.searchSuggestions("  魔  ", 99);

        verify(itemMapper).selectItemSuggestions("魔", 10);
        assertEquals(1, suggestions.size());
        assertEquals("浅红色", suggestions.get(0).getRarity());
    }
}

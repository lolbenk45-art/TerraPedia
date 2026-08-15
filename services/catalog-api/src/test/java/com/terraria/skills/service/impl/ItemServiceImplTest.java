package com.terraria.skills.service.impl;

import com.terraria.skills.common.PageQuery;
import com.terraria.skills.dto.ItemDTO;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.CategoryManagementService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
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
    @Test
    void shouldTrimSearchBeforeCountingAndSelectingItems() {
        PageQuery query = new PageQuery();
        query.setPage(1);
        query.setLimit(5);
        query.setSearch("  magic  ");

        when(itemMapper.countItemsWithSearch(eq("magic"), isNull(), isNull(), isNull(), isNull())).thenReturn(0L);
        when(itemMapper.selectItemsWithSearch(eq("magic"), isNull(), isNull(), isNull(), isNull(), eq("id"), eq("asc"), eq(5L), eq(0L)))
            .thenReturn(List.of());

        itemService.getItems(query);

        verify(itemMapper).countItemsWithSearch(eq("magic"), isNull(), isNull(), isNull(), isNull());
        verify(itemMapper).selectItemsWithSearch(eq("magic"), isNull(), isNull(), isNull(), isNull(), eq("id"), eq("asc"), eq(5L), eq(0L));
    }

    @Test
    void shouldExposeSanitizedSourceNpcsForDetailWithoutWikiImageUrls() {
        ItemDTO detail = new ItemDTO();
        detail.setId(1L);
        detail.setName("Guide Voodoo Doll");
        detail.setSourceNpcsJson("[{\"npcId\":22,\"npcName\":\"Guide\",\"npcImageUrl\":\"https://terraria.wiki.gg/images/Guide.png\",\"sourcePage\":\"https://terraria.wiki.gg/wiki/Guide\"}]");

        when(itemMapper.selectItemDetailById(1L)).thenReturn(detail);
        when(categoryManagementService.getCategoryPathMap()).thenReturn(Map.of());

        ItemDTO result = itemService.getItemById(1L);

        assertEquals(1, result.getSourceNpcs().size());
        assertEquals(22, result.getSourceNpcs().get(0).get("npcId"));
        assertEquals("Guide", result.getSourceNpcs().get(0).get("npcName"));
        assertEquals("https://terraria.wiki.gg/wiki/Guide", result.getSourceNpcs().get(0).get("sourcePage"));
        assertFalse(result.getSourceNpcs().get(0).containsKey("npcImageUrl"));
    }
}

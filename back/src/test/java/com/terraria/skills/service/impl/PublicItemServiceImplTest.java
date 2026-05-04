package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.common.PageQuery;
import com.terraria.skills.dto.CategoryDTO;
import com.terraria.skills.dto.PublicItemDetailDTO;
import com.terraria.skills.dto.PublicItemListDTO;
import com.terraria.skills.dto.PublicItemSuggestionDTO;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.CategoryManagementService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PublicItemServiceImplTest {

    @Mock
    private ItemMapper itemMapper;

    @Mock
    private CategoryManagementService categoryManagementService;

    @InjectMocks
    private PublicItemServiceImpl publicItemService;

    @Test
    void shouldUsePublicLightweightMapperForPublicItemList() {
        PageQuery query = new PageQuery();
        query.setPage(2);
        query.setLimit(15);
        query.setSearch("  copper  ");
        query.setRarity("white");
        query.setSortBy("name");
        query.setSortDirection("desc");

        PublicItemListDTO item = new PublicItemListDTO();
        item.setId(42L);
        item.setName("Copper Shortsword");

        when(itemMapper.countItemsWithSearch(eq("copper"), isNull(), isNull(), eq(0L), isNull())).thenReturn(1L);
        when(itemMapper.selectPublicItemsWithSearch(eq("copper"), isNull(), isNull(), eq(0L), isNull(), eq("name"), eq("desc"), eq(15L), eq(15L)))
            .thenReturn(List.of(item));

        Page<PublicItemListDTO> result = publicItemService.getPublicItems(query);

        assertEquals(1L, result.getTotal());
        assertEquals(2L, result.getCurrent());
        assertEquals(15L, result.getSize());
        assertEquals(List.of(item), result.getRecords());
        verify(itemMapper).selectPublicItemsWithSearch(eq("copper"), isNull(), isNull(), eq(0L), isNull(), eq("name"), eq("desc"), eq(15L), eq(15L));
        verify(itemMapper, never()).selectItemsWithSearch(
            eq("copper"), isNull(), isNull(), eq(0L), isNull(), eq("name"), eq("desc"), eq(15L), eq(15L)
        );
    }

    @Test
    void shouldResolveCategoryDescendantsForPublicListFilters() {
        PageQuery query = new PageQuery();
        query.setPage(1);
        query.setLimit(20);
        query.setCategoryId(10L);

        CategoryDTO child = new CategoryDTO();
        child.setId(11L);

        when(categoryManagementService.getAllDescendants(10L)).thenReturn(List.of(child));
        when(itemMapper.countItemsWithSearch(eq(""), eq(10L), eq(List.of(10L, 11L)), isNull(), isNull())).thenReturn(0L);
        when(itemMapper.selectPublicItemsWithSearch(eq(""), eq(10L), eq(List.of(10L, 11L)), isNull(), isNull(), eq("id"), eq("asc"), eq(20L), eq(0L)))
            .thenReturn(List.of());

        publicItemService.getPublicItems(query);

        verify(categoryManagementService).getAllDescendants(10L);
        verify(itemMapper).selectPublicItemsWithSearch(eq(""), eq(10L), eq(List.of(10L, 11L)), isNull(), isNull(), eq("id"), eq("asc"), eq(20L), eq(0L));
        verify(itemMapper, never()).selectItemsWithSearch(
            eq(""), eq(10L), eq(List.of(10L, 11L)), isNull(), isNull(), eq("id"), eq("asc"), eq(20L), eq(0L)
        );
    }

    @Test
    void shouldUsePublicLightweightMapperForSuggestions() {
        PublicItemSuggestionDTO item = new PublicItemSuggestionDTO();
        item.setId(12L);
        item.setName("Wooden Arrow");

        when(itemMapper.selectPublicItemSuggestions(eq("wood"), eq(5))).thenReturn(List.of(item));

        List<PublicItemSuggestionDTO> result = publicItemService.searchSuggestions("  wood  ", 5);

        assertEquals(List.of(item), result);
        verify(itemMapper).selectPublicItemSuggestions(eq("wood"), eq(5));
        verify(itemMapper, never()).selectItemSuggestions(eq("wood"), eq(5));
    }

    @Test
    void shouldUsePublicLightweightMapperForDetailShell() {
        PublicItemDetailDTO item = new PublicItemDetailDTO();
        item.setId(77L);
        item.setName("Night Edge");

        when(itemMapper.selectPublicItemDetailById(eq(77L))).thenReturn(item);

        PublicItemDetailDTO result = publicItemService.getPublicItemById(77L);

        assertEquals(item, result);
        verify(itemMapper).selectPublicItemDetailById(eq(77L));
        verify(itemMapper, never()).selectItemDetailById(eq(77L));
    }
}

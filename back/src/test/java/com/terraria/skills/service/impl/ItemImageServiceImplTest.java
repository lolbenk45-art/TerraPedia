package com.terraria.skills.service.impl;

import com.terraria.skills.dto.ItemImageDTO;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.ItemImage;
import com.terraria.skills.mapper.ItemImageMapper;
import com.terraria.skills.mapper.ItemMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ItemImageServiceImplTest {

    @Mock
    private ItemImageMapper itemImageMapper;

    @Mock
    private ItemMapper itemMapper;

    @InjectMocks
    private ItemImageServiceImpl itemImageService;

    @Test
    void shouldPreferManagedImagesFromNewTable() {
        ItemImage wikiPrimary = new ItemImage();
        wikiPrimary.setId(11L);
        wikiPrimary.setItemId(7L);
        wikiPrimary.setRole("icon");
        wikiPrimary.setCachedUrl("https://terraria.wiki.gg/images/primary.png");
        wikiPrimary.setIsPrimary(Boolean.TRUE);
        wikiPrimary.setSortOrder(0);

        ItemImage managedSecondary = new ItemImage();
        managedSecondary.setId(12L);
        managedSecondary.setItemId(7L);
        managedSecondary.setRole("detail");
        managedSecondary.setCachedUrl("http://localhost:9000/terrapedia-images/items/detail.png");
        managedSecondary.setIsPrimary(Boolean.FALSE);
        managedSecondary.setSortOrder(1);

        when(itemImageMapper.selectList(any())).thenReturn(List.of(wikiPrimary, managedSecondary));

        List<ItemImageDTO> images = itemImageService.getImagesByItemId(7L);

        assertEquals(2, images.size());
        assertEquals("http://localhost:9000/terrapedia-images/items/detail.png", images.get(0).getCachedUrl());
        assertEquals("https://terraria.wiki.gg/images/primary.png", images.get(1).getCachedUrl());
        verify(itemMapper, never()).selectById(any());
    }

    @Test
    void shouldPrependManagedLegacyImageWhenTableOnlyContainsWikiRows() {
        Item item = new Item();
        item.setId(7L);
        item.setImage("http://localhost:9000/terrapedia-images/items/legacy.png");

        ItemImage wikiPrimary = new ItemImage();
        wikiPrimary.setId(11L);
        wikiPrimary.setItemId(7L);
        wikiPrimary.setRole("icon");
        wikiPrimary.setCachedUrl("https://terraria.wiki.gg/images/primary.png");
        wikiPrimary.setIsPrimary(Boolean.TRUE);
        wikiPrimary.setSortOrder(0);

        when(itemImageMapper.selectList(any())).thenReturn(List.of(wikiPrimary));
        when(itemMapper.selectById(7L)).thenReturn(item);

        List<ItemImageDTO> images = itemImageService.getImagesByItemId(7L);

        assertEquals(2, images.size());
        assertEquals("http://localhost:9000/terrapedia-images/items/legacy.png", images.get(0).getCachedUrl());
        assertTrue(images.get(0).getIsPrimary());
        assertEquals("items.image", images.get(0).getSourcePage());
        assertEquals("https://terraria.wiki.gg/images/primary.png", images.get(1).getCachedUrl());
        verify(itemMapper).selectById(7L);
    }

    @Test
    void shouldReturnEmptyListWhenNeitherNewNorLegacyImageExists() {
        Item item = new Item();
        item.setId(7L);
        item.setImage("   ");

        when(itemImageMapper.selectList(any())).thenReturn(List.of());
        when(itemMapper.selectById(7L)).thenReturn(item);

        List<ItemImageDTO> images = itemImageService.getImagesByItemId(7L);

        assertTrue(images.isEmpty());
        verify(itemMapper).selectById(7L);
    }

    @Test
    void shouldFallbackToLegacyItemImageWhenNewTableIsEmpty() {
        Item item = new Item();
        item.setId(7L);
        item.setImage("/images/items/legacy.png");

        when(itemImageMapper.selectList(any())).thenReturn(List.of());
        when(itemMapper.selectById(7L)).thenReturn(item);

        List<ItemImageDTO> images = itemImageService.getImagesByItemId(7L);

        assertEquals(1, images.size());
        assertEquals("/images/items/legacy.png", images.get(0).getCachedUrl());
        assertTrue(images.get(0).getIsPrimary());
        assertEquals("icon", images.get(0).getRole());
        verify(itemMapper).selectById(7L);
    }
}

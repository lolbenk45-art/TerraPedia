package com.terraria.skills.service.impl;

import com.terraria.skills.dto.ItemImageDTO;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.ItemImage;
import com.terraria.skills.mapper.ItemImageMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.ManagedImageUrlPolicy;
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
import static org.mockito.Mockito.lenient;

@ExtendWith(MockitoExtension.class)
class ItemImageServiceImplTest {

    @Mock
    private ItemImageMapper itemImageMapper;

    @Mock
    private ItemMapper itemMapper;

    @Mock
    private ManagedImageUrlPolicy managedImageUrlPolicy;

    @InjectMocks
    private ItemImageServiceImpl itemImageService;

    @Test
    void shouldPreferMinioCachedImagesFromNewTableAndKeepWikiAsFallbackMetadata() {
        trustLocalMinioOnly();
        ItemImage wikiPrimary = new ItemImage();
        wikiPrimary.setId(11L);
        wikiPrimary.setItemId(7L);
        wikiPrimary.setRole("icon");
        wikiPrimary.setOriginalUrl("https://terraria.wiki.gg/images/primary.png");
        wikiPrimary.setCachedUrl("http://localhost:9000/terrapedia-images/items/primary.png");
        wikiPrimary.setIsPrimary(Boolean.TRUE);
        wikiPrimary.setSortOrder(0);

        ItemImage minioOnly = new ItemImage();
        minioOnly.setId(12L);
        minioOnly.setItemId(7L);
        minioOnly.setRole("detail");
        minioOnly.setCachedUrl("http://localhost:9000/terrapedia-images/items/detail.png");
        minioOnly.setIsPrimary(Boolean.FALSE);
        minioOnly.setSortOrder(1);

        when(itemImageMapper.selectList(any())).thenReturn(List.of(wikiPrimary, minioOnly));

        List<ItemImageDTO> images = itemImageService.getImagesByItemId(7L);

        assertEquals(2, images.size());
        assertEquals("http://localhost:9000/terrapedia-images/items/primary.png", images.get(0).getImageUrl());
        assertEquals("http://localhost:9000/terrapedia-images/items/primary.png", images.get(0).getCachedUrl());
        assertEquals("https://terraria.wiki.gg/images/primary.png", images.get(0).getOriginalUrl());
        assertEquals("http://localhost:9000/terrapedia-images/items/detail.png", images.get(1).getImageUrl());
        verify(itemMapper, never()).selectById(any());
    }

    @Test
    void shouldDropWikiOnlyTableRowFromDisplayList() {
        trustLocalMinioOnly();
        ItemImage wikiPrimary = new ItemImage();
        wikiPrimary.setId(11L);
        wikiPrimary.setItemId(7L);
        wikiPrimary.setRole("icon");
        wikiPrimary.setOriginalUrl("https://terraria.wiki.gg/images/primary.png");
        wikiPrimary.setIsPrimary(Boolean.TRUE);
        wikiPrimary.setSortOrder(0);

        when(itemImageMapper.selectList(any())).thenReturn(List.of(wikiPrimary));

        List<ItemImageDTO> images = itemImageService.getImagesByItemId(7L);

        assertTrue(images.isEmpty());
        verify(itemMapper).selectById(7L);
    }

    @Test
    void shouldReturnEmptyListWhenNeitherNewNorLegacyImageExists() {
        trustLocalMinioOnly();
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
    void shouldReturnEmptyListForWikiLegacyItemImageWhenNewTableIsEmpty() {
        trustLocalMinioOnly();
        Item item = new Item();
        item.setId(7L);
        item.setImage("https://terraria.wiki.gg/images/Legacy.png");

        when(itemImageMapper.selectList(any())).thenReturn(List.of());
        when(itemMapper.selectById(7L)).thenReturn(item);

        List<ItemImageDTO> images = itemImageService.getImagesByItemId(7L);

        assertTrue(images.isEmpty());
        verify(itemMapper).selectById(7L);
    }

    @Test
    void shouldUseManagedLegacyItemImageWhenTableIsEmpty() {
        trustLocalMinioOnly();
        Item item = new Item();
        item.setId(7L);
        item.setImage("http://localhost:9000/terrapedia-images/items/legacy.png");

        when(itemImageMapper.selectList(any())).thenReturn(List.of());
        when(itemMapper.selectById(7L)).thenReturn(item);

        List<ItemImageDTO> images = itemImageService.getImagesByItemId(7L);

        assertEquals(1, images.size());
        assertEquals("http://localhost:9000/terrapedia-images/items/legacy.png", images.get(0).getImageUrl());
        assertEquals("http://localhost:9000/terrapedia-images/items/legacy.png", images.get(0).getCachedUrl());
        verify(itemMapper).selectById(7L);
    }

    @Test
    void shouldReturnEmptyListForWikiLegacyItemImageWhenTableRowsAreRejected() {
        trustLocalMinioOnly();
        ItemImage demo = new ItemImage();
        demo.setId(11L);
        demo.setItemId(7L);
        demo.setRole("icon");
        demo.setOriginalUrl("https://terraria.wiki.gg/images/Work_Bench_%28demo%29.gif");
        demo.setIsPrimary(Boolean.TRUE);
        demo.setSortOrder(0);

        Item item = new Item();
        item.setId(7L);
        item.setImage("https://terraria.wiki.gg/images/Work_Bench.png");

        when(itemImageMapper.selectList(any())).thenReturn(List.of(demo));
        when(itemMapper.selectById(7L)).thenReturn(item);

        List<ItemImageDTO> images = itemImageService.getImagesByItemId(7L);

        assertTrue(images.isEmpty());
    }

    @Test
    void shouldExcludeDemoAndPlacedWikiRowsFromDisplayList() {
        trustLocalMinioOnly();
        ItemImage demo = new ItemImage();
        demo.setId(11L);
        demo.setItemId(7L);
        demo.setRole("icon");
        demo.setOriginalUrl("https://terraria.wiki.gg/images/Work_Bench_%28demo%29.gif");
        demo.setIsPrimary(Boolean.TRUE);
        demo.setSortOrder(0);

        ItemImage placed = new ItemImage();
        placed.setId(12L);
        placed.setItemId(7L);
        placed.setRole("icon");
        placed.setOriginalUrl("https://terraria.wiki.gg/images/Work_Bench_%28placed%29.png");
        placed.setIsPrimary(Boolean.TRUE);
        placed.setSortOrder(0);

        when(itemImageMapper.selectList(any())).thenReturn(List.of(demo, placed));

        List<ItemImageDTO> images = itemImageService.getImagesByItemId(7L);

        assertTrue(images.isEmpty());
    }

    @Test
    void shouldDropDemonWikiOnlyItemImagesFromDisplayList() {
        trustLocalMinioOnly();
        ItemImage demon = new ItemImage();
        demon.setId(11L);
        demon.setItemId(7L);
        demon.setRole("icon");
        demon.setOriginalUrl("https://terraria.wiki.gg/images/Living_Demon_Fire_Block.png");
        demon.setIsPrimary(Boolean.TRUE);
        demon.setSortOrder(0);

        when(itemImageMapper.selectList(any())).thenReturn(List.of(demon));

        List<ItemImageDTO> images = itemImageService.getImagesByItemId(7L);

        assertTrue(images.isEmpty());
    }

    @Test
    void shouldRejectUntrustedManagedLikeImageUrls() {
        trustLocalMinioOnly();
        ItemImage fakeManaged = new ItemImage();
        fakeManaged.setId(11L);
        fakeManaged.setItemId(7L);
        fakeManaged.setRole("icon");
        fakeManaged.setCachedUrl("https://evil.example.com/terrapedia-images/items/fake.png");
        fakeManaged.setIsPrimary(Boolean.TRUE);
        fakeManaged.setSortOrder(0);

        Item item = new Item();
        item.setId(7L);
        item.setImage("https://evil.example.com/terrapedia-images/items/legacy-fake.png");

        when(itemImageMapper.selectList(any())).thenReturn(List.of(fakeManaged));
        when(itemMapper.selectById(7L)).thenReturn(item);

        List<ItemImageDTO> images = itemImageService.getImagesByItemId(7L);

        assertTrue(images.isEmpty());
    }

    private void trustLocalMinioOnly() {
        lenient().when(managedImageUrlPolicy.isManagedImageUrl(any())).thenAnswer(invocation -> {
            String value = invocation.getArgument(0);
            return value != null && value.startsWith("http://localhost:9000/terrapedia-images/");
        });
    }
}

package com.terraria.skills.service.impl;

import com.terraria.skills.dto.ItemSourceDTO;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.ItemAcquisitionSource;
import com.terraria.skills.entity.Npc;
import com.terraria.skills.mapper.BiomeMapper;
import com.terraria.skills.mapper.ItemAcquisitionSourceMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.mapper.NpcMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ItemSourceServiceImplTest {

    @Mock
    private ItemAcquisitionSourceMapper itemAcquisitionSourceMapper;

    @Mock
    private BiomeMapper biomeMapper;

    @Mock
    private ItemMapper itemMapper;

    @Mock
    private NpcMapper npcMapper;

    @InjectMocks
    private ItemSourceServiceImpl itemSourceService;

    @Test
    void shouldEnrichNpcSourceImagesFromReferencedNpc() {
        String managedNpcImage = "http://localhost:9000/terrapedia-images/npcs/merchant.png";
        ItemAcquisitionSource source = source(1L, 88L, "shop", "npc", 17L, "Merchant");

        Npc npc = new Npc();
        npc.setId(17L);
        npc.setName("Merchant");
        npc.setInternalName("Merchant");
        npc.setNameZh("商人");
        npc.setImageUrl(managedNpcImage);

        when(itemAcquisitionSourceMapper.selectList(any())).thenReturn(List.of(source));
        when(itemMapper.selectList(any())).thenReturn(List.of());
        when(npcMapper.selectList(any())).thenReturn(List.of(npc));

        List<ItemSourceDTO> sources = itemSourceService.getSourcesByItemId(88L);

        assertEquals(1, sources.size());
        ItemSourceDTO result = sources.get(0);
        assertEquals("商人", result.getSourceRefNameZh());
        assertEquals(managedNpcImage, result.getImageUrl());
        assertEquals(managedNpcImage, result.getSourceRefImageUrl());
        assertEquals(managedNpcImage, result.getNpcImageUrl());
    }

    @Test
    void shouldEnrichItemSourceImagesFromReferencedItem() {
        String managedItemImage = "http://localhost:9000/terrapedia-images/items/wood.png";
        ItemAcquisitionSource source = source(2L, 88L, "craft", "item", 9L, "Wood");

        Item item = new Item();
        item.setId(9L);
        item.setName("Wood");
        item.setInternalName("Wood");
        item.setNameZh("木材");
        item.setImage(managedItemImage);

        when(itemAcquisitionSourceMapper.selectList(any())).thenReturn(List.of(source));
        when(itemMapper.selectList(any())).thenReturn(List.of(item));
        when(npcMapper.selectList(any())).thenReturn(List.of());

        List<ItemSourceDTO> sources = itemSourceService.getSourcesByItemId(88L);

        assertEquals(1, sources.size());
        ItemSourceDTO result = sources.get(0);
        assertEquals("木材", result.getSourceRefNameZh());
        assertEquals(managedItemImage, result.getImageUrl());
        assertEquals(managedItemImage, result.getSourceRefImageUrl());
        assertEquals(managedItemImage, result.getItemImageUrl());
    }

    @Test
    void shouldQueryActiveNonDeletedItemsWhenResolvingByName() {
        ItemAcquisitionSource source = source(3L, 88L, "drop", null, null, "Wood");

        when(itemAcquisitionSourceMapper.selectList(any())).thenReturn(List.of(source));
        when(itemMapper.selectList(any())).thenReturn(List.of());
        when(npcMapper.selectList(any())).thenReturn(List.of());

        itemSourceService.getSourcesByItemId(88L);

        ArgumentCaptor<com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<Item>> captor =
            ArgumentCaptor.forClass(com.baomidou.mybatisplus.core.conditions.query.QueryWrapper.class);
        org.mockito.Mockito.verify(itemMapper).selectList(captor.capture());
        String sqlSegment = captor.getValue().getSqlSegment();
        assertTrue(sqlSegment.contains("status"));
        assertTrue(sqlSegment.contains("deleted"));
    }

    @Test
    void shouldPreferReferencedNpcIdOverSameNameFallback() {
        String idImage = "http://localhost:9000/terrapedia-images/npcs/by-id.png";
        String nameImage = "http://localhost:9000/terrapedia-images/npcs/by-name.png";
        ItemAcquisitionSource source = source(4L, 88L, "drop", "npc", 17L, "Zombie");

        Npc idNpc = npc(17L, "Merchant", "商人", idImage);
        Npc nameNpc = npc(590L, "Zombie", "僵尸", nameImage);

        when(itemAcquisitionSourceMapper.selectList(any())).thenReturn(List.of(source));
        when(itemMapper.selectList(any())).thenReturn(List.of());
        when(npcMapper.selectList(any()))
            .thenReturn(List.of(idNpc))
            .thenReturn(List.of(nameNpc));

        List<ItemSourceDTO> sources = itemSourceService.getSourcesByItemId(88L);

        assertEquals(1, sources.size());
        ItemSourceDTO result = sources.get(0);
        assertEquals("商人", result.getSourceRefNameZh());
        assertEquals(idImage, result.getImageUrl());
        assertEquals(idImage, result.getNpcImageUrl());
    }

    @Test
    void shouldUseSameTypeNameFallbackOnlyForMissingIdImage() {
        String nameImage = "http://localhost:9000/terrapedia-images/npcs/by-name.png";
        ItemAcquisitionSource source = source(5L, 88L, "drop", "npc", 17L, "Zombie");

        Npc idNpcWithoutImage = npc(17L, "Zombie", "僵尸", null);
        Npc nameNpcWithImage = npc(590L, "Zombie", "僵尸", nameImage);

        when(itemAcquisitionSourceMapper.selectList(any())).thenReturn(List.of(source));
        when(itemMapper.selectList(any())).thenReturn(List.of());
        when(npcMapper.selectList(any()))
            .thenReturn(List.of(idNpcWithoutImage))
            .thenReturn(List.of(nameNpcWithImage));

        List<ItemSourceDTO> sources = itemSourceService.getSourcesByItemId(88L);

        assertEquals(1, sources.size());
        ItemSourceDTO result = sources.get(0);
        assertEquals("僵尸", result.getSourceRefNameZh());
        assertEquals(nameImage, result.getImageUrl());
        assertEquals(nameImage, result.getNpcImageUrl());
    }

    @Test
    void shouldMergeImagesWhenDuplicateSourcesHaveDifferentReferenceCompleteness() {
        String managedNpcImage = "http://localhost:9000/terrapedia-images/npcs/zombie.png";
        ItemAcquisitionSource sourceWithoutRef = source(6L, 88L, "drop", "npc", 999L, "Zombie");
        ItemAcquisitionSource sourceWithRef = source(7L, 88L, "drop", "npc", 590L, "Zombie");

        Npc matchedNpc = npc(590L, "Zombie", "僵尸", managedNpcImage);

        when(itemAcquisitionSourceMapper.selectList(any())).thenReturn(List.of(sourceWithoutRef, sourceWithRef));
        when(itemMapper.selectList(any())).thenReturn(List.of());
        when(npcMapper.selectList(any()))
            .thenReturn(List.of(matchedNpc))
            .thenReturn(List.of(matchedNpc));

        List<ItemSourceDTO> sources = itemSourceService.getSourcesByItemId(88L);

        assertEquals(1, sources.size());
        ItemSourceDTO result = sources.get(0);
        assertEquals("僵尸", result.getSourceRefNameZh());
        assertEquals(managedNpcImage, result.getImageUrl());
        assertEquals(managedNpcImage, result.getNpcImageUrl());
    }

    private static ItemAcquisitionSource source(Long id, Long itemId, String sourceType, String sourceRefType, Long sourceRefId, String sourceRefName) {
        ItemAcquisitionSource source = new ItemAcquisitionSource();
        source.setId(id);
        source.setItemId(itemId);
        source.setSourceType(sourceType);
        source.setSourceRefType(sourceRefType);
        source.setSourceRefId(sourceRefId);
        source.setSourceRefName(sourceRefName);
        source.setStatus(1);
        return source;
    }

    private static Npc npc(Long id, String name, String nameZh, String imageUrl) {
        Npc npc = new Npc();
        npc.setId(id);
        npc.setName(name);
        npc.setInternalName(name);
        npc.setNameZh(nameZh);
        npc.setImageUrl(imageUrl);
        return npc;
    }
}

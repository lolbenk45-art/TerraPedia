package com.terraria.skills.service.impl;

import com.terraria.skills.dto.ItemSourceDTO;
import com.terraria.skills.entity.Biome;
import com.terraria.skills.entity.BiomeResource;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.ItemAcquisitionSource;
import com.terraria.skills.entity.ItemBiome;
import com.terraria.skills.entity.Npc;
import com.terraria.skills.entity.NpcLootEntry;
import com.terraria.skills.entity.NpcShopEntry;
import com.terraria.skills.mapper.BiomeMapper;
import com.terraria.skills.mapper.BiomeResourceMapper;
import com.terraria.skills.mapper.ItemAcquisitionSourceMapper;
import com.terraria.skills.mapper.ItemBiomeMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.mapper.NpcLootEntryMapper;
import com.terraria.skills.mapper.NpcMapper;
import com.terraria.skills.mapper.NpcShopEntryMapper;
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
import static org.mockito.Mockito.verify;

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

    @Mock
    private NpcLootEntryMapper npcLootEntryMapper;

    @Mock
    private NpcShopEntryMapper npcShopEntryMapper;

    @Mock
    private BiomeResourceMapper biomeResourceMapper;

    @Mock
    private ItemBiomeMapper itemBiomeMapper;

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
    void shouldEnrichBossSourceImagesFromReferencedNpcWhileKeepingBossType() {
        String managedBossImage = "http://localhost:9000/terrapedia-images/npcs/queen-bee.png";
        ItemAcquisitionSource source = source(14L, 2108L, "drop", "boss", 222L, "Queen Bee");

        Npc boss = new Npc();
        boss.setId(222L);
        boss.setName("Queen Bee");
        boss.setInternalName("QueenBee");
        boss.setNameZh("蜂王");
        boss.setImageUrl(managedBossImage);

        when(itemAcquisitionSourceMapper.selectList(any())).thenReturn(List.of(source));
        when(itemMapper.selectList(any())).thenReturn(List.of());
        when(npcMapper.selectList(any())).thenReturn(List.of(boss));

        List<ItemSourceDTO> sources = itemSourceService.getSourcesByItemId(2108L);

        assertEquals(1, sources.size());
        ItemSourceDTO result = sources.get(0);
        assertEquals("boss", result.getSourceRefType());
        assertEquals("蜂王", result.getSourceRefNameZh());
        assertEquals(managedBossImage, result.getImageUrl());
        assertEquals(managedBossImage, result.getSourceRefImageUrl());
        assertEquals(managedBossImage, result.getNpcImageUrl());
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
    void shouldNotFallbackToItemMetadataForNpcTypedSourceName() {
        String crateImage = "http://localhost:9000/terrapedia-images/items/wiki/item-images/Azure_Crate.png";
        ItemAcquisitionSource source = source(8L, 88L, "drop", "npc", null, "Azure Crate");

        Item crate = new Item();
        crate.setId(5303L);
        crate.setName("Azure Crate");
        crate.setInternalName("FloatingIslandFishingCrateHard");
        crate.setNameZh("天蓝匣");
        crate.setImage(crateImage);

        when(itemAcquisitionSourceMapper.selectList(any())).thenReturn(List.of(source));
        when(itemMapper.selectList(any())).thenReturn(List.of(crate));
        when(npcMapper.selectList(any())).thenReturn(List.of());

        List<ItemSourceDTO> sources = itemSourceService.getSourcesByItemId(88L);

        assertEquals(1, sources.size());
        ItemSourceDTO result = sources.get(0);
        assertEquals(null, result.getSourceRefNameZh());
        assertEquals(null, result.getImageUrl());
        assertEquals(null, result.getSourceRefImageUrl());
        assertEquals(null, result.getItemImageUrl());
        assertEquals(null, result.getNpcImageUrl());
    }

    @Test
    void shouldKeepMagicMirrorContainerAndWorldgenSourcesOutOfNpcFallback() {
        String frozenChestImage = "http://localhost:9000/terrapedia-images/items/frozen-chest.png";
        String mimicImage = "http://localhost:9000/terrapedia-images/npcs/mimic.png";
        String fakeGoldChestNpcImage = "http://localhost:9000/terrapedia-images/npcs/gold-chest.png";
        ItemAcquisitionSource goldChest = source(9L, 50L, "container", "container", null, "Gold Chest");
        ItemAcquisitionSource frozenChest = source(10L, 50L, "container", "container", null, "Frozen Chest");
        ItemAcquisitionSource mimic = source(11L, 50L, "drop", "npc", null, "Mimic");
        ItemAcquisitionSource worldgen = source(12L, 50L, "worldgen", "world", null, "Magic Mirrors worldgen");

        Item frozenChestItem = new Item();
        frozenChestItem.setId(681L);
        frozenChestItem.setName("Frozen Chest");
        frozenChestItem.setInternalName("FrozenChest");
        frozenChestItem.setNameZh("冰冻箱");
        frozenChestItem.setImage(frozenChestImage);

        Npc mimicNpc = npc(85L, "Mimic", "宝箱怪", mimicImage);
        Npc fakeGoldChestNpc = npc(999L, "Gold Chest", "错误金箱 NPC", fakeGoldChestNpcImage);

        when(itemAcquisitionSourceMapper.selectList(any())).thenReturn(List.of(goldChest, frozenChest, mimic, worldgen));
        when(itemMapper.selectList(any())).thenReturn(List.of(frozenChestItem));
        when(npcMapper.selectList(any())).thenReturn(List.of(mimicNpc, fakeGoldChestNpc));

        List<ItemSourceDTO> result = itemSourceService.getSourcesByItemId(50L);

        assertEquals(4, result.size());
        ItemSourceDTO goldChestResult = sourceByName(result, "Gold Chest");
        assertEquals("container", goldChestResult.getSourceRefType());
        assertEquals("Gold Chest", goldChestResult.getSourceRefName());
        assertEquals(null, goldChestResult.getSourceRefNameZh());
        assertEquals(null, goldChestResult.getImageUrl());
        assertEquals(null, goldChestResult.getNpcImageUrl());

        ItemSourceDTO frozenChestResult = sourceByName(result, "Frozen Chest");
        assertEquals("container", frozenChestResult.getSourceRefType());
        assertEquals("冰冻箱", frozenChestResult.getSourceRefNameZh());
        assertEquals(frozenChestImage, frozenChestResult.getImageUrl());
        assertEquals(frozenChestImage, frozenChestResult.getItemImageUrl());
        assertEquals(null, frozenChestResult.getNpcImageUrl());

        ItemSourceDTO mimicResult = sourceByName(result, "Mimic");
        assertEquals("npc", mimicResult.getSourceRefType());
        assertEquals("宝箱怪", mimicResult.getSourceRefNameZh());
        assertEquals(mimicImage, mimicResult.getNpcImageUrl());

        ItemSourceDTO worldgenResult = sourceByName(result, "Magic Mirrors worldgen");
        assertEquals("world", worldgenResult.getSourceRefType());
        assertEquals(null, worldgenResult.getSourceRefNameZh());
        assertEquals(null, worldgenResult.getNpcImageUrl());
    }

    @Test
    void shouldUseItemBackedSourceRefIdForContainerSources() {
        String goldChestImage = "http://localhost:9000/terrapedia-images/items/gold-chest.png";
        ItemAcquisitionSource goldChest = source(13L, 50L, "container", "container", 681L, "Wrong Display Name");

        Item goldChestItem = new Item();
        goldChestItem.setId(681L);
        goldChestItem.setName("Gold Chest");
        goldChestItem.setInternalName("GoldChest");
        goldChestItem.setNameZh("金箱");
        goldChestItem.setImage(goldChestImage);

        when(itemAcquisitionSourceMapper.selectList(any())).thenReturn(List.of(goldChest));
        when(itemMapper.selectList(any())).thenReturn(List.of(goldChestItem));

        List<ItemSourceDTO> result = itemSourceService.getSourcesByItemId(50L);

        assertEquals(1, result.size());
        ItemSourceDTO goldChestResult = result.get(0);
        assertEquals("container", goldChestResult.getSourceRefType());
        assertEquals("金箱", goldChestResult.getSourceRefNameZh());
        assertEquals(goldChestImage, goldChestResult.getImageUrl());
        assertEquals(goldChestImage, goldChestResult.getSourceRefImageUrl());
        assertEquals(goldChestImage, goldChestResult.getItemImageUrl());
        assertEquals(null, goldChestResult.getNpcImageUrl());
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

    @Test
    void shouldProjectNpcLootEvidenceWhenItemHasNoOrdinarySourceRows() {
        NpcLootEntry lootEntry = new NpcLootEntry();
        lootEntry.setId(700L);
        lootEntry.setNpcId(42L);
        lootEntry.setItemId(1586L);
        lootEntry.setDropSourceKind("npc_drop");
        lootEntry.setQuantityText("1");
        lootEntry.setChanceText("5%");
        lootEntry.setConditions("Expert Mode");
        lootEntry.setStatus(1);
        lootEntry.setDeleted(0);

        Npc npc = npc(42L, "Cenx", "Cenx", "http://localhost:9000/terrapedia-images/npcs/cenx.png");

        when(itemAcquisitionSourceMapper.selectList(any())).thenReturn(List.of());
        when(npcLootEntryMapper.selectList(any())).thenReturn(List.of(lootEntry));
        when(npcShopEntryMapper.selectList(any())).thenReturn(List.of());
        when(npcMapper.selectList(any())).thenReturn(List.of(npc));
        when(biomeResourceMapper.selectList(any())).thenReturn(List.of());
        when(itemBiomeMapper.selectList(any())).thenReturn(List.of());

        List<ItemSourceDTO> result = itemSourceService.getSourcesByItemId(1586L);

        assertEquals(1, result.size());
        ItemSourceDTO source = result.get(0);
        assertEquals("npc_relation", source.getEvidenceKind());
        assertEquals("npc_loot:700", source.getSourceFactKey());
        assertEquals(700L, source.getLootEntryId());
        assertEquals("npc_drop", source.getDropSourceKind());
        assertEquals("drop", source.getSourceType());
        assertEquals("npc", source.getSourceRefType());
        assertEquals(42L, source.getSourceRefId());
        assertEquals("Cenx", source.getSourceRefName());
        assertEquals("Cenx", source.getSourceRefNameZh());
        assertEquals("/npcs/42", source.getNpcDetailPath());
        assertEquals("http://localhost:9000/terrapedia-images/npcs/cenx.png", source.getNpcImageUrl());
        assertEquals("5%", source.getChanceText());
    }

    @Test
    void shouldProjectNpcShopEvidenceWhenItemHasNoOrdinarySourceRows() {
        NpcShopEntry shopEntry = new NpcShopEntry();
        shopEntry.setId(701L);
        shopEntry.setNpcId(43L);
        shopEntry.setItemId(3217L);
        shopEntry.setPriceText("1 silver");
        shopEntry.setNotes("When Corruption is present");
        shopEntry.setStatus(1);
        shopEntry.setDeleted(0);

        Npc npc = npc(43L, "Dryad", "树妖", "http://localhost:9000/terrapedia-images/npcs/dryad.png");

        when(itemAcquisitionSourceMapper.selectList(any())).thenReturn(List.of());
        when(npcLootEntryMapper.selectList(any())).thenReturn(List.of());
        when(npcShopEntryMapper.selectList(any())).thenReturn(List.of(shopEntry));
        when(npcMapper.selectList(any())).thenReturn(List.of(npc));
        when(biomeResourceMapper.selectList(any())).thenReturn(List.of());
        when(itemBiomeMapper.selectList(any())).thenReturn(List.of());

        List<ItemSourceDTO> result = itemSourceService.getSourcesByItemId(3217L);

        assertEquals(1, result.size());
        ItemSourceDTO source = result.get(0);
        assertEquals("npc_relation", source.getEvidenceKind());
        assertEquals("npc_shop:701", source.getSourceFactKey());
        assertEquals(701L, source.getShopEntryId());
        assertEquals("shop", source.getSourceType());
        assertEquals("npc", source.getSourceRefType());
        assertEquals(43L, source.getSourceRefId());
        assertEquals("Dryad", source.getSourceRefName());
        assertEquals("树妖", source.getSourceRefNameZh());
        assertEquals("/npcs/43", source.getNpcDetailPath());
        assertEquals("1 silver", source.getConditions());
        assertEquals("When Corruption is present", source.getNotes());
    }

    @Test
    void shouldKeepProjectedFactWhenOrdinarySourceHasSameVisibleText() {
        ItemAcquisitionSource ordinary = source(100L, 1586L, "drop", "npc", 42L, "Cenx");
        ordinary.setQuantityText("1");
        ordinary.setChanceText("5%");
        ordinary.setConditions("Expert Mode");

        NpcLootEntry lootEntry = new NpcLootEntry();
        lootEntry.setId(700L);
        lootEntry.setNpcId(42L);
        lootEntry.setItemId(1586L);
        lootEntry.setDropSourceKind("npc_drop");
        lootEntry.setQuantityText("1");
        lootEntry.setChanceText("5%");
        lootEntry.setConditions("Expert Mode");
        lootEntry.setStatus(1);
        lootEntry.setDeleted(0);

        Npc npc = npc(42L, "Cenx", "Cenx", "http://localhost:9000/terrapedia-images/npcs/cenx.png");

        when(itemAcquisitionSourceMapper.selectList(any())).thenReturn(List.of(ordinary));
        when(itemMapper.selectList(any())).thenReturn(List.of());
        when(npcLootEntryMapper.selectList(any())).thenReturn(List.of(lootEntry));
        when(npcShopEntryMapper.selectList(any())).thenReturn(List.of());
        when(npcMapper.selectList(any())).thenReturn(List.of(npc));
        when(biomeResourceMapper.selectList(any())).thenReturn(List.of());
        when(itemBiomeMapper.selectList(any())).thenReturn(List.of());

        List<ItemSourceDTO> result = itemSourceService.getSourcesByItemId(1586L);

        assertEquals(2, result.size());
        assertTrue(result.stream().anyMatch(source -> source.getEvidenceKind() == null && "drop".equals(source.getSourceType())));
        assertTrue(result.stream().anyMatch(source -> "npc_loot:700".equals(source.getSourceFactKey())));
    }

    @Test
    void shouldProjectBiomeEvidenceWhenItemHasBiomeResourceOrItemBiomeRows() {
        BiomeResource resource = new BiomeResource();
        resource.setId(800L);
        resource.setBiomeId(9L);
        resource.setItemId(1827L);
        resource.setResourceNameRaw("Halloween biome drop");
        resource.setResourceType("drop");
        resource.setNotes("Halloween event enemy drop");
        resource.setSortOrder(0);

        ItemBiome itemBiome = new ItemBiome();
        itemBiome.setId(801L);
        itemBiome.setItemId(1827L);
        itemBiome.setBiomeId(9L);
        itemBiome.setRelationType("event_drop");
        itemBiome.setNotes("Halloween");
        itemBiome.setSortOrder(1);

        Biome biome = new Biome();
        biome.setId(9L);
        biome.setCode("halloween");
        biome.setNameEn("Halloween");
        biome.setNameZh("万圣节");

        when(itemAcquisitionSourceMapper.selectList(any())).thenReturn(List.of());
        when(npcLootEntryMapper.selectList(any())).thenReturn(List.of());
        when(npcShopEntryMapper.selectList(any())).thenReturn(List.of());
        when(biomeResourceMapper.selectList(any())).thenReturn(List.of(resource));
        when(itemBiomeMapper.selectList(any())).thenReturn(List.of(itemBiome));
        when(biomeMapper.selectList(any())).thenReturn(List.of(biome));

        List<ItemSourceDTO> result = itemSourceService.getSourcesByItemId(1827L);

        assertEquals(2, result.size());
        ItemSourceDTO resourceSource = result.get(0);
        assertEquals("biome_resource", resourceSource.getEvidenceKind());
        assertEquals("biome_resource:800", resourceSource.getSourceFactKey());
        assertEquals("worldgen", resourceSource.getSourceType());
        assertEquals("world", resourceSource.getSourceRefType());
        assertEquals("Halloween biome drop", resourceSource.getSourceRefName());
        assertEquals(9L, resourceSource.getBiomeId());
        assertEquals("halloween", resourceSource.getBiomeCode());
        assertEquals("万圣节", resourceSource.getBiomeNameZh());
        assertEquals("/biomes/9", resourceSource.getBiomeDetailPath());

        ItemSourceDTO itemBiomeSource = result.get(1);
        assertEquals("item_biome", itemBiomeSource.getEvidenceKind());
        assertEquals("item_biome:801", itemBiomeSource.getSourceFactKey());
        assertEquals("event_drop", itemBiomeSource.getConditions());
        assertEquals("Halloween", itemBiomeSource.getNotes());
    }

    @Test
    void shouldQueryOnlyActiveNonDeletedBiomesForProjectionMetadata() {
        ItemBiome itemBiome = new ItemBiome();
        itemBiome.setId(801L);
        itemBiome.setItemId(1827L);
        itemBiome.setBiomeId(9L);
        itemBiome.setRelationType("event_drop");

        when(itemAcquisitionSourceMapper.selectList(any())).thenReturn(List.of());
        when(npcLootEntryMapper.selectList(any())).thenReturn(List.of());
        when(npcShopEntryMapper.selectList(any())).thenReturn(List.of());
        when(biomeResourceMapper.selectList(any())).thenReturn(List.of());
        when(itemBiomeMapper.selectList(any())).thenReturn(List.of(itemBiome));
        when(biomeMapper.selectList(any())).thenReturn(List.of());

        itemSourceService.getSourcesByItemId(1827L);

        ArgumentCaptor<com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<Biome>> captor =
            ArgumentCaptor.forClass(com.baomidou.mybatisplus.core.conditions.query.QueryWrapper.class);
        verify(biomeMapper).selectList(captor.capture());
        String sqlSegment = captor.getValue().getSqlSegment();
        assertTrue(sqlSegment.contains("status"));
        assertTrue(sqlSegment.contains("deleted"));
    }

    private static ItemSourceDTO sourceByName(List<ItemSourceDTO> sources, String sourceRefName) {
        return sources.stream()
            .filter(source -> sourceRefName.equals(source.getSourceRefName()))
            .findFirst()
            .orElseThrow();
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

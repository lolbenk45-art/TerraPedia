package com.terraria.skills.service.impl;

import com.terraria.skills.dto.BiomeDTO;
import com.terraria.skills.entity.Biome;
import com.terraria.skills.entity.BiomeResource;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.ItemAcquisitionSource;
import com.terraria.skills.entity.ItemBiome;
import com.terraria.skills.entity.Npc;
import com.terraria.skills.entity.NpcBiome;
import com.terraria.skills.mapper.BiomeMapper;
import com.terraria.skills.mapper.BiomeRelationMapper;
import com.terraria.skills.mapper.BiomeResourceMapper;
import com.terraria.skills.mapper.ItemAcquisitionSourceMapper;
import com.terraria.skills.mapper.ItemBiomeMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.mapper.NpcBiomeMapper;
import com.terraria.skills.mapper.NpcMapper;
import com.terraria.skills.service.ManagedItemImageResolver;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BiomeServiceImplTest {

    @Mock
    private BiomeMapper biomeMapper;

    @Mock
    private BiomeRelationMapper biomeRelationMapper;

    @Mock
    private BiomeResourceMapper biomeResourceMapper;

    @Mock
    private ItemMapper itemMapper;

    @Mock
    private ItemBiomeMapper itemBiomeMapper;

    @Mock
    private NpcBiomeMapper npcBiomeMapper;

    @Mock
    private ItemAcquisitionSourceMapper itemAcquisitionSourceMapper;

    @Mock
    private NpcMapper npcMapper;

    @Mock
    private ManagedItemImageResolver managedItemImageResolver;

    @Test
    void shouldReturnPublicBiomeDetailWithItemNpcAndSourceRelations() {
        Biome biome = new Biome();
        biome.setId(10L);
        biome.setCode("forest");
        biome.setNameEn("Forest");
        biome.setNameZh("森林");
        biome.setStatus(1);
        biome.setDeleted(0);

        Item item = new Item();
        item.setId(50L);
        item.setName("Wood");
        item.setNameZh("木材");
        item.setInternalName("Wood");
        item.setImage("https://terraria.wiki.gg/images/Wood.png");

        Npc npc = new Npc();
        npc.setId(70L);
        npc.setName("Green Slime");
        npc.setNameZh("绿史莱姆");
        npc.setInternalName("GreenSlime");
        npc.setImageUrl("http://localhost:9000/terrapedia-images/npcs/green-slime.png");

        BiomeResource resource = new BiomeResource();
        resource.setId(40L);
        resource.setBiomeId(10L);
        resource.setItemId(50L);
        resource.setResourceType("resource");
        resource.setSortOrder(1);

        ItemBiome itemBiome = new ItemBiome();
        itemBiome.setId(60L);
        itemBiome.setBiomeId(10L);
        itemBiome.setItemId(50L);
        itemBiome.setRelationType("drop");
        itemBiome.setSortOrder(1);

        NpcBiome npcBiome = new NpcBiome();
        npcBiome.setId(80L);
        npcBiome.setBiomeId(10L);
        npcBiome.setNpcId(70L);
        npcBiome.setRelationType("appears_in");
        npcBiome.setSpawnContext("During the day");
        npcBiome.setSortOrder(2);
        npcBiome.setStatus(1);
        npcBiome.setDeleted(0);

        NpcBiome deletedNpcBiome = new NpcBiome();
        deletedNpcBiome.setId(81L);
        deletedNpcBiome.setBiomeId(10L);
        deletedNpcBiome.setNpcId(70L);
        deletedNpcBiome.setRelationType("appears_in");
        deletedNpcBiome.setStatus(1);
        deletedNpcBiome.setDeleted(1);

        ItemAcquisitionSource itemSource = new ItemAcquisitionSource();
        itemSource.setId(90L);
        itemSource.setItemId(50L);
        itemSource.setBiomeId(10L);
        itemSource.setSourceType("drop");
        itemSource.setSourceRefType("biome_wikitext");
        itemSource.setSourceRefName("From Goblin Scouts");
        itemSource.setSourceProvider("terraria.wiki.gg");
        itemSource.setSourcePage("Forest");
        itemSource.setSortOrder(3);
        itemSource.setStatus(1);
        itemSource.setDeleted(0);

        ItemAcquisitionSource unrelatedItemSource = new ItemAcquisitionSource();
        unrelatedItemSource.setId(91L);
        unrelatedItemSource.setItemId(50L);
        unrelatedItemSource.setBiomeId(10L);
        unrelatedItemSource.setSourceType("drop");
        unrelatedItemSource.setSourceRefType("npc");
        unrelatedItemSource.setSourceRefName("Green Slime");
        unrelatedItemSource.setSourceProvider("terraria.wiki.gg");
        unrelatedItemSource.setSourcePage("Forest");
        unrelatedItemSource.setStatus(1);
        unrelatedItemSource.setDeleted(0);

        when(biomeMapper.selectById(10L)).thenReturn(biome);
        when(biomeRelationMapper.selectList(any())).thenReturn(List.of());
        when(biomeResourceMapper.selectList(any())).thenReturn(List.of(resource));
        when(itemBiomeMapper.selectList(any())).thenReturn(List.of(itemBiome));
        when(npcBiomeMapper.selectList(any())).thenReturn(List.of(npcBiome, deletedNpcBiome));
        when(itemAcquisitionSourceMapper.selectList(any())).thenReturn(List.of(itemSource, unrelatedItemSource));
        when(itemMapper.selectBatchIds(List.of(50L))).thenReturn(List.of(item));
        when(managedItemImageResolver.resolveManagedImages(any())).thenReturn(Map.of(50L, "http://localhost:9000/terrapedia-images/items/wood.png"));
        when(managedItemImageResolver.resolveManagedImage(any(), any())).thenReturn("http://localhost:9000/terrapedia-images/items/wood.png");
        when(npcMapper.selectList(any())).thenReturn(List.of(npc));

        BiomeServiceImpl service = new BiomeServiceImpl(
            biomeMapper,
            biomeRelationMapper,
            biomeResourceMapper,
            itemMapper,
            itemBiomeMapper,
            npcBiomeMapper,
            itemAcquisitionSourceMapper,
            npcMapper,
            managedItemImageResolver
        );

        BiomeDTO detail = service.getBiomeById(10L);

        assertNotNull(detail);
        assertEquals("木材", detail.getItemBiomes().get(0).getItemNameZh());
        assertEquals("绿史莱姆", detail.getNpcBiomes().get(0).getNpcNameZh());
        assertEquals("biome_wikitext", detail.getItemSources().get(0).getSourceRefType());
        assertEquals("From Goblin Scouts", detail.getItemSources().get(0).getSourceRefName());
        assertEquals(Boolean.FALSE, detail.getItemBiomes().get(0).getMissingItem());
        assertEquals(Boolean.FALSE, detail.getNpcBiomes().get(0).getMissingNpc());
        assertEquals(1, detail.getNpcBiomes().size());
        assertEquals(1, detail.getItemSources().size());
        assertEquals("http://localhost:9000/terrapedia-images/items/wood.png", detail.getResources().get(0).getItemImage());
    }
}

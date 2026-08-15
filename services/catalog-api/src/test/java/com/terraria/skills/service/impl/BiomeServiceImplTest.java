package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
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
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.ArgumentCaptor;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

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
    @SuppressWarnings({"rawtypes", "unchecked"})
    void shouldExcludeDeletedBiomesFromPublicListQuery() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), Biome.class);
        when(biomeMapper.selectList(any())).thenReturn(List.of());
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

        service.getBiomes();

        ArgumentCaptor<Wrapper<Biome>> captor = ArgumentCaptor.forClass((Class) Wrapper.class);
        verify(biomeMapper).selectList(captor.capture());
        String sqlSegment = captor.getValue().getSqlSegment();
        assertTrue(sqlSegment.contains("status"));
        assertTrue(sqlSegment.contains("deleted"));
    }

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
        item.setStatus(1);
        item.setDeleted(0);

        Npc npc = new Npc();
        npc.setId(70L);
        npc.setName("Green Slime");
        npc.setNameZh("绿史莱姆");
        npc.setInternalName("GreenSlime");
        npc.setImageUrl("http://localhost:9000/terrapedia-images/npcs/green-slime.png");
        npc.setStatus(1);

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
        unrelatedItemSource.setSourceRefId(70L);
        unrelatedItemSource.setSourceRefName("Green Slime");
        unrelatedItemSource.setSourceProvider("wiki_gg");
        unrelatedItemSource.setSourcePage("Forest");
        unrelatedItemSource.setStatus(1);
        unrelatedItemSource.setDeleted(0);

        ItemAcquisitionSource bossItemSource = new ItemAcquisitionSource();
        bossItemSource.setId(92L);
        bossItemSource.setItemId(50L);
        bossItemSource.setBiomeId(10L);
        bossItemSource.setSourceType("drop");
        bossItemSource.setSourceRefType("boss");
        bossItemSource.setSourceRefId(701L);
        bossItemSource.setSourceRefName("King Slime");
        bossItemSource.setSourceProvider("wiki_gg");
        bossItemSource.setSourcePage("Forest");
        bossItemSource.setStatus(1);
        bossItemSource.setDeleted(0);

        ItemAcquisitionSource crateItemSource = new ItemAcquisitionSource();
        crateItemSource.setId(93L);
        crateItemSource.setItemId(50L);
        crateItemSource.setBiomeId(10L);
        crateItemSource.setSourceType("crate");
        crateItemSource.setSourceRefType("crate");
        crateItemSource.setSourceRefId(9001L);
        crateItemSource.setSourceRefName("Wooden Crate");
        crateItemSource.setSourceProvider("wiki_gg");
        crateItemSource.setSourcePage("Forest");
        crateItemSource.setStatus(1);
        crateItemSource.setDeleted(0);

        ItemAcquisitionSource bossGroupItemSource = new ItemAcquisitionSource();
        bossGroupItemSource.setId(94L);
        bossGroupItemSource.setItemId(50L);
        bossGroupItemSource.setBiomeId(10L);
        bossGroupItemSource.setSourceType("treasure_bag");
        bossGroupItemSource.setSourceRefType("boss_group");
        bossGroupItemSource.setSourceRefName("Mechanical bosses");
        bossGroupItemSource.setSourceProvider("wiki_gg");
        bossGroupItemSource.setSourcePage("Forest");
        bossGroupItemSource.setStatus(1);
        bossGroupItemSource.setDeleted(0);

        ItemAcquisitionSource nullProviderItemSource = new ItemAcquisitionSource();
        nullProviderItemSource.setId(95L);
        nullProviderItemSource.setItemId(50L);
        nullProviderItemSource.setBiomeId(10L);
        nullProviderItemSource.setSourceType("drop");
        nullProviderItemSource.setSourceRefType("npc_group");
        nullProviderItemSource.setSourceRefName("Slimes");
        nullProviderItemSource.setStatus(1);
        nullProviderItemSource.setDeleted(0);

        ItemAcquisitionSource rejectedProviderItemSource = new ItemAcquisitionSource();
        rejectedProviderItemSource.setId(96L);
        rejectedProviderItemSource.setItemId(50L);
        rejectedProviderItemSource.setBiomeId(10L);
        rejectedProviderItemSource.setSourceType("drop");
        rejectedProviderItemSource.setSourceRefType("npc");
        rejectedProviderItemSource.setSourceRefName("Rejected Provider");
        rejectedProviderItemSource.setSourceProvider("unknown_provider");
        rejectedProviderItemSource.setStatus(1);
        rejectedProviderItemSource.setDeleted(0);

        ItemAcquisitionSource rejectedTypeItemSource = new ItemAcquisitionSource();
        rejectedTypeItemSource.setId(97L);
        rejectedTypeItemSource.setItemId(50L);
        rejectedTypeItemSource.setBiomeId(10L);
        rejectedTypeItemSource.setSourceType("crafting");
        rejectedTypeItemSource.setSourceRefType("npc");
        rejectedTypeItemSource.setSourceRefName("Rejected Type");
        rejectedTypeItemSource.setSourceProvider("wiki_gg");
        rejectedTypeItemSource.setStatus(1);
        rejectedTypeItemSource.setDeleted(0);

        ItemAcquisitionSource rejectedRefTypeItemSource = new ItemAcquisitionSource();
        rejectedRefTypeItemSource.setId(98L);
        rejectedRefTypeItemSource.setItemId(50L);
        rejectedRefTypeItemSource.setBiomeId(10L);
        rejectedRefTypeItemSource.setSourceType("drop");
        rejectedRefTypeItemSource.setSourceRefType("recipe");
        rejectedRefTypeItemSource.setSourceRefName("Rejected Ref Type");
        rejectedRefTypeItemSource.setSourceProvider("wiki_gg");
        rejectedRefTypeItemSource.setStatus(1);
        rejectedRefTypeItemSource.setDeleted(0);

        when(biomeMapper.selectById(10L)).thenReturn(biome);
        when(biomeRelationMapper.selectList(any())).thenReturn(List.of());
        when(biomeResourceMapper.selectList(any())).thenReturn(List.of(resource));
        when(itemBiomeMapper.selectList(any())).thenReturn(List.of(itemBiome));
        when(npcBiomeMapper.selectList(any())).thenReturn(List.of(npcBiome, deletedNpcBiome));
        when(itemAcquisitionSourceMapper.selectList(any())).thenReturn(List.of(
            itemSource,
            unrelatedItemSource,
            bossItemSource,
            crateItemSource,
            bossGroupItemSource,
            nullProviderItemSource,
            rejectedProviderItemSource,
            rejectedTypeItemSource,
            rejectedRefTypeItemSource
        ));
        when(itemMapper.selectList(any())).thenReturn(List.of(item));
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
        assertEquals("npc", detail.getItemSources().get(1).getSourceRefType());
        assertEquals(70L, detail.getItemSources().get(1).getSourceRefId());
        assertEquals("boss", detail.getItemSources().get(2).getSourceRefType());
        assertEquals("crate", detail.getItemSources().get(3).getSourceRefType());
        assertEquals("boss_group", detail.getItemSources().get(4).getSourceRefType());
        assertEquals("npc_group", detail.getItemSources().get(5).getSourceRefType());
        assertEquals(Boolean.FALSE, detail.getItemBiomes().get(0).getMissingItem());
        assertEquals(Boolean.FALSE, detail.getNpcBiomes().get(0).getMissingNpc());
        assertEquals(1, detail.getNpcBiomes().size());
        assertEquals(6, detail.getItemSources().size());
        assertEquals("http://localhost:9000/terrapedia-images/items/wood.png", detail.getResources().get(0).getItemImage());

        @SuppressWarnings({"rawtypes", "unchecked"})
        ArgumentCaptor<Wrapper<Item>> itemCaptor = ArgumentCaptor.forClass((Class) Wrapper.class);
        verify(itemMapper).selectList(itemCaptor.capture());
        assertTrue(itemCaptor.getValue().getSqlSegment().contains("status"));
        assertTrue(itemCaptor.getValue().getSqlSegment().contains("deleted"));
    }
}

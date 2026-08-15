package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.terraria.skills.dto.BiomeDTO;
import com.terraria.skills.entity.Biome;
import com.terraria.skills.entity.ItemAcquisitionSource;
import com.terraria.skills.entity.ItemBiome;
import com.terraria.skills.entity.BiomeRelation;
import com.terraria.skills.entity.BiomeResource;
import com.terraria.skills.entity.Item;
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
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;
import java.util.Collection;
import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.times;

@ExtendWith(MockitoExtension.class)
class AdminBiomeControllerTest {

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
    void listShouldAcceptWikiGroupFilterForMiniMicroAndTreasureRoomCategories() throws Exception {
        AdminBiomeController controller = new AdminBiomeController(
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
        when(biomeMapper.selectPage(any(), any())).thenReturn(new com.baomidou.mybatisplus.extension.plugins.pagination.Page<Biome>(1, 20));

        Method getBiomes = AdminBiomeController.class.getMethod(
            "getBiomes",
            Integer.class,
            Integer.class,
            Integer.class,
            String.class,
            String.class,
            String.class
        );
        getBiomes.invoke(controller, 1, 20, null, null, "treasure_room", null);

        verify(biomeMapper).selectPage(any(), any());
    }

    @Test
    void listShouldAcceptWikiGroupCodeFilterAndSortByWikiOrder() throws Exception {
        AdminBiomeController controller = new AdminBiomeController(
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
        when(biomeMapper.selectPage(any(), any())).thenReturn(new com.baomidou.mybatisplus.extension.plugins.pagination.Page<Biome>(1, 20));

        Method getBiomes = AdminBiomeController.class.getMethod(
            "getBiomes",
            Integer.class,
            Integer.class,
            Integer.class,
            String.class,
            String.class,
            String.class
        );
        getBiomes.invoke(controller, 1, 20, null, null, null, "micro_biomes");

        verify(biomeMapper).selectPage(any(), any());
    }

    @Test
    void detailShouldExposeWikiTaxonomyFields() {
        AdminBiomeController controller = new AdminBiomeController(
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

        Biome biome = new Biome();
        biome.setId(241L);
        biome.setCode("spike_caves");
        biome.setNameEn("Spike Caves");
        biome.setNameZh("尖刺洞穴");
        biome.setWikiGroupCode("spike_caves");
        biome.setWikiGroupNameEn("Spike Caves");
        biome.setWikiGroupNameZh("尖刺洞穴");
        biome.setWikiParentGroupCode("micro_biomes");
        biome.setWikiParentGroupNameEn("Micro-biomes");
        biome.setWikiParentGroupNameZh("微型群系");
        biome.setWikiSectionLevel(3);
        biome.setWikiSortOrder(44);
        biome.setWikiSectionAnchor("Spike_Caves");

        when(biomeMapper.selectById(241L)).thenReturn(biome);
        when(biomeRelationMapper.selectList(any())).thenReturn(List.of());
        when(biomeResourceMapper.selectList(any())).thenReturn(List.of());
        when(itemBiomeMapper.selectList(any())).thenReturn(List.of());
        when(npcBiomeMapper.selectList(any())).thenReturn(List.of());
        when(itemAcquisitionSourceMapper.selectList(any())).thenReturn(List.of());

        ResponseEntity<ApiResponse<BiomeDTO>> response = controller.getBiomeById(241L);

        assertNotNull(response.getBody());
        BiomeDTO detail = response.getBody().getData();
        assertEquals("spike_caves", detail.getWikiGroupCode());
        assertEquals("尖刺洞穴", detail.getWikiGroupNameZh());
        assertEquals("micro_biomes", detail.getWikiParentGroupCode());
        assertEquals("微型群系", detail.getWikiParentGroupNameZh());
        assertEquals(3, detail.getWikiSectionLevel());
        assertEquals(44, detail.getWikiSortOrder());
        assertEquals("Spike_Caves", detail.getWikiSectionAnchor());
    }

    @Test
    void detailShouldExposeStructuredFieldsAndManagedResourceItemImages() {
        AdminBiomeController controller = new AdminBiomeController(
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

        Biome biome = new Biome();
        biome.setId(10L);
        biome.setCode("forest");
        biome.setNameEn("Forest");
        biome.setNameZh("森林");
        biome.setDescription("Surface forest biome");
        biome.setIconUrl("http://localhost:9000/terrapedia-images/biomes/forest.png");

        Biome relatedBiome = new Biome();
        relatedBiome.setId(20L);
        relatedBiome.setCode("underground");
        relatedBiome.setNameEn("Underground");
        relatedBiome.setNameZh("地下");

        BiomeRelation relation = new BiomeRelation();
        relation.setId(30L);
        relation.setBiomeId(10L);
        relation.setRelatedBiomeId(20L);
        relation.setRelationType("contains");
        relation.setNotes("Caverns below");

        BiomeResource resource = new BiomeResource();
        resource.setId(40L);
        resource.setBiomeId(10L);
        resource.setItemId(50L);
        resource.setResourceNameRaw("Wood");
        resource.setResourceType("material");
        resource.setNotes("Trees");
        resource.setSortOrder(1);

        Item item = new Item();
        item.setId(50L);
        item.setName("Wood");
        item.setNameZh("木材");
        item.setInternalName("Wood");
        item.setImage("https://terraria.wiki.gg/images/Wood.png");

        ItemBiome itemBiome = new ItemBiome();
        itemBiome.setId(60L);
        itemBiome.setBiomeId(10L);
        itemBiome.setItemId(50L);
        itemBiome.setRelationType("resource");
        itemBiome.setNotes("From vegetation");
        itemBiome.setSortOrder(2);

        ItemBiome unresolvedItemBiome = new ItemBiome();
        unresolvedItemBiome.setId(61L);
        unresolvedItemBiome.setBiomeId(10L);
        unresolvedItemBiome.setItemId(9999L);
        unresolvedItemBiome.setRelationType("drop");
        unresolvedItemBiome.setNotes("Broken item reference");
        unresolvedItemBiome.setSortOrder(3);

        Npc npc = new Npc();
        npc.setId(70L);
        npc.setName("Green Slime");
        npc.setNameZh("绿史莱姆");
        npc.setInternalName("GreenSlime");
        npc.setImageUrl("http://localhost:9000/terrapedia-images/npcs/green-slime.png");

        NpcBiome npcBiome = new NpcBiome();
        npcBiome.setId(80L);
        npcBiome.setBiomeId(10L);
        npcBiome.setNpcId(70L);
        npcBiome.setRelationType("appears_in");
        npcBiome.setSpawnContext("During the day");
        npcBiome.setNotes("Common spawn");
        npcBiome.setSourceProvider("terraria.wiki.gg");
        npcBiome.setSourcePage("Forest");
        npcBiome.setSortOrder(4);

        NpcBiome unresolvedNpcBiome = new NpcBiome();
        unresolvedNpcBiome.setId(81L);
        unresolvedNpcBiome.setBiomeId(10L);
        unresolvedNpcBiome.setNpcId(9998L);
        unresolvedNpcBiome.setRelationType("appears_in");
        unresolvedNpcBiome.setSpawnContext("Broken spawn");
        unresolvedNpcBiome.setNotes("Broken npc reference");
        unresolvedNpcBiome.setSourcePage("Forest");
        unresolvedNpcBiome.setSortOrder(5);

        ItemAcquisitionSource itemSource = new ItemAcquisitionSource();
        itemSource.setId(90L);
        itemSource.setItemId(50L);
        itemSource.setBiomeId(10L);
        itemSource.setSourceType("resource");
        itemSource.setSourceRefType("biome_wikitext");
        itemSource.setSourceRefName("From vegetation");
        itemSource.setNotes("From Forest page");
        itemSource.setSourceProvider("terraria.wiki.gg");
        itemSource.setSourcePage("Forest");
        itemSource.setSortOrder(6);

        String managedImage = "http://localhost:9000/terrapedia-images/items/wood.png";

        when(biomeMapper.selectById(10L)).thenReturn(biome);
        when(biomeRelationMapper.selectList(any())).thenReturn(List.of(relation));
        when(biomeResourceMapper.selectList(any())).thenReturn(List.of(resource));
        when(itemBiomeMapper.selectList(any())).thenReturn(List.of(itemBiome, unresolvedItemBiome));
        when(npcBiomeMapper.selectList(any())).thenReturn(List.of(npcBiome, unresolvedNpcBiome));
        when(itemAcquisitionSourceMapper.selectList(any())).thenReturn(List.of(itemSource));
        when(biomeMapper.selectBatchIds(List.of(20L))).thenReturn(List.of(relatedBiome));
        when(itemMapper.selectBatchIds(any())).thenReturn(List.of(item));
        when(npcMapper.selectList(any())).thenReturn(List.of(npc));
        when(managedItemImageResolver.resolveManagedImages(any())).thenReturn(Map.of(50L, managedImage));
        when(managedItemImageResolver.resolveManagedImage(any(), anyMap())).thenReturn(managedImage);

        ResponseEntity<ApiResponse<BiomeDTO>> response = controller.getBiomeById(10L);

        assertNotNull(response.getBody());
        BiomeDTO detail = response.getBody().getData();
        assertEquals("Surface forest biome", detail.getDescription());
        assertEquals("http://localhost:9000/terrapedia-images/biomes/forest.png", detail.getIconUrl());
        assertEquals(1, detail.getRelations().size());
        assertEquals("contains", detail.getRelations().get(0).getRelationType());
        assertEquals("underground", detail.getRelations().get(0).getRelatedBiomeCode());
        assertEquals("Underground", detail.getRelations().get(0).getRelatedBiomeNameEn());
        assertEquals("地下", detail.getRelations().get(0).getRelatedBiomeNameZh());
        assertEquals(1, detail.getResources().size());
        assertEquals("Wood", detail.getResources().get(0).getItemName());
        assertEquals("Wood", detail.getResources().get(0).getItemInternalName());
        assertEquals(managedImage, detail.getResources().get(0).getItemImage());
        assertEquals(2, detail.getItemBiomes().size());
        assertEquals("resource", detail.getItemBiomes().get(0).getRelationType());
        assertEquals("Wood", detail.getItemBiomes().get(0).getItemName());
        assertEquals("木材", detail.getItemBiomes().get(0).getItemNameZh());
        assertEquals("Wood", detail.getItemBiomes().get(0).getItemInternalName());
        assertEquals(managedImage, detail.getItemBiomes().get(0).getItemImage());
        assertEquals(Boolean.FALSE, detail.getItemBiomes().get(0).getMissingItem());
        assertEquals(9999L, detail.getItemBiomes().get(1).getItemId());
        assertEquals(Boolean.TRUE, detail.getItemBiomes().get(1).getMissingItem());
        assertEquals(2, detail.getNpcBiomes().size());
        assertEquals("Green Slime", detail.getNpcBiomes().get(0).getNpcName());
        assertEquals("绿史莱姆", detail.getNpcBiomes().get(0).getNpcNameZh());
        assertEquals("GreenSlime", detail.getNpcBiomes().get(0).getNpcInternalName());
        assertEquals("During the day", detail.getNpcBiomes().get(0).getSpawnContext());
        assertEquals("Forest", detail.getNpcBiomes().get(0).getSourcePage());
        assertEquals("http://localhost:9000/terrapedia-images/npcs/green-slime.png", detail.getNpcBiomes().get(0).getNpcImageUrl());
        assertEquals(Boolean.FALSE, detail.getNpcBiomes().get(0).getMissingNpc());
        assertEquals(9998L, detail.getNpcBiomes().get(1).getNpcId());
        assertEquals(Boolean.TRUE, detail.getNpcBiomes().get(1).getMissingNpc());
        assertEquals(1, detail.getItemSources().size());
        assertEquals("resource", detail.getItemSources().get(0).getSourceType());
        assertEquals("biome_wikitext", detail.getItemSources().get(0).getSourceRefType());
        assertEquals("From vegetation", detail.getItemSources().get(0).getSourceRefName());
        assertEquals("terraria.wiki.gg", detail.getItemSources().get(0).getSourceProvider());
        assertEquals("Forest", detail.getItemSources().get(0).getSourcePage());
        assertEquals("Wood", detail.getItemSources().get(0).getItemName());
        assertEquals("木材", detail.getItemSources().get(0).getItemNameZh());
        assertEquals(managedImage, detail.getItemSources().get(0).getItemImage());

        ArgumentCaptor<Collection<Item>> itemsCaptor = ArgumentCaptor.captor();
        verify(managedItemImageResolver).resolveManagedImages(itemsCaptor.capture());
        assertEquals(List.of(item), List.copyOf(itemsCaptor.getValue()));
        verify(managedItemImageResolver, times(3)).resolveManagedImage(item, Map.of(50L, managedImage));
        ArgumentCaptor<QueryWrapper<Npc>> npcWrapperCaptor = ArgumentCaptor.forClass(QueryWrapper.class);
        verify(npcMapper).selectList(npcWrapperCaptor.capture());
        String npcSqlSegment = npcWrapperCaptor.getValue().getSqlSegment();
        assertTrue(npcSqlSegment.contains("id"));
        assertTrue(npcSqlSegment.contains("status"));
        assertTrue(npcSqlSegment.contains("deleted"));
    }
}

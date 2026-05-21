package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.BiomeDTO;
import com.terraria.skills.entity.Biome;
import com.terraria.skills.entity.BiomeRelation;
import com.terraria.skills.entity.BiomeResource;
import com.terraria.skills.entity.Item;
import com.terraria.skills.mapper.BiomeMapper;
import com.terraria.skills.mapper.BiomeRelationMapper;
import com.terraria.skills.mapper.BiomeResourceMapper;
import com.terraria.skills.mapper.ItemMapper;
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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
    private ManagedItemImageResolver managedItemImageResolver;

    @Test
    void detailShouldExposeStructuredFieldsAndManagedResourceItemImages() {
        AdminBiomeController controller = new AdminBiomeController(
            biomeMapper,
            biomeRelationMapper,
            biomeResourceMapper,
            itemMapper,
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
        item.setInternalName("Wood");
        item.setImage("https://terraria.wiki.gg/images/Wood.png");

        String managedImage = "http://localhost:9000/terrapedia-images/items/wood.png";

        when(biomeMapper.selectById(10L)).thenReturn(biome);
        when(biomeRelationMapper.selectList(any())).thenReturn(List.of(relation));
        when(biomeResourceMapper.selectList(any())).thenReturn(List.of(resource));
        when(biomeMapper.selectBatchIds(List.of(20L))).thenReturn(List.of(relatedBiome));
        when(itemMapper.selectBatchIds(List.of(50L))).thenReturn(List.of(item));
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

        ArgumentCaptor<Collection<Item>> itemsCaptor = ArgumentCaptor.captor();
        verify(managedItemImageResolver).resolveManagedImages(itemsCaptor.capture());
        assertEquals(List.of(item), List.copyOf(itemsCaptor.getValue()));
        verify(managedItemImageResolver).resolveManagedImage(item, Map.of(50L, managedImage));
    }
}

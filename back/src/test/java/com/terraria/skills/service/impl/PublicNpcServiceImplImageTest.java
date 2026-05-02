package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.NpcBuffRelationDTO;
import com.terraria.skills.dto.NpcListItemDTO;
import com.terraria.skills.dto.NpcLootEntryDTO;
import com.terraria.skills.dto.PublicNpcQuery;
import com.terraria.skills.entity.Npc;
import com.terraria.skills.mapper.CategoryMapper;
import com.terraria.skills.mapper.NpcMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PublicNpcServiceImplImageTest {

    @Mock
    private NpcMapper npcMapper;

    @Mock
    private CategoryMapper categoryMapper;

    @Mock
    private JdbcTemplate jdbcTemplate;

    @Test
    void shouldPreferNpcWikiImageUrlColumnForPublicList() {
        Npc npc = new Npc();
        npc.setId(1L);
        npc.setGameId(-650001L);
        npc.setInternalName("TestHornetStingy");
        npc.setName("Hornet");
        npc.setCategoryId(1L);
        npc.setImageUrl("https://terraria.wiki.gg/images/Stingy%20Hornet.gif");
        npc.setIsBoss(false);
        npc.setStatus(1);

        Page<Npc> page = new Page<>(1, 20);
        page.setTotal(1);
        page.setRecords(List.of(npc));
        when(npcMapper.selectPage(any(Page.class), any())).thenReturn(page);

        PublicNpcServiceImpl service = new PublicNpcServiceImpl(npcMapper, categoryMapper, jdbcTemplate, new ObjectMapper());
        Page<NpcListItemDTO> result = service.getNpcs(new PublicNpcQuery());

        assertEquals("https://terraria.wiki.gg/images/Stingy%20Hornet.gif", result.getRecords().get(0).getImageUrl());
    }

    @Test
    void shouldMapProjectionJsonStringsFromNpcEntityToPublicListDto() {
        String lootItemsJson = "[{\"itemId\":8,\"internalName\":\"Torch\"}]";
        String shopItemsJson = "[{\"itemId\":9,\"internalName\":\"Rope\"}]";
        String sourceItemsJson = "[{\"itemId\":930,\"internalName\":\"FlareGun\"}]";

        Npc npc = new Npc();
        npc.setId(7L);
        npc.setGameId(22L);
        npc.setInternalName("Guide");
        npc.setName("Guide");
        npc.setCategoryId(1L);
        npc.setIsBoss(false);
        npc.setStatus(1);
        ReflectionTestUtils.setField(npc, "lootItemsJson", lootItemsJson);
        ReflectionTestUtils.setField(npc, "shopItemsJson", shopItemsJson);
        ReflectionTestUtils.setField(npc, "sourceItemsJson", sourceItemsJson);

        Page<Npc> page = new Page<>(1, 20);
        page.setTotal(1);
        page.setRecords(List.of(npc));
        when(npcMapper.selectPage(any(Page.class), any())).thenReturn(page);

        PublicNpcServiceImpl service = new PublicNpcServiceImpl(npcMapper, categoryMapper, jdbcTemplate, new ObjectMapper());
        NpcListItemDTO result = service.getNpcs(new PublicNpcQuery()).getRecords().get(0);

        assertEquals(lootItemsJson, ReflectionTestUtils.getField(result, "lootItemsJson"));
        assertEquals(shopItemsJson, ReflectionTestUtils.getField(result, "shopItemsJson"));
        assertEquals(sourceItemsJson, ReflectionTestUtils.getField(result, "sourceItemsJson"));
    }

    @Test
    void shouldPreferCachedBuffImageForPublicNpcBuffRelations() {
        when(jdbcTemplate.queryForList(contains("FROM npc_buff_relations"), eq(7L))).thenReturn(List.of(Map.of(
            "id", 31L,
            "buffId", 401L,
            "buffSourceId", 401,
            "buffInternalName", "Sharpened",
            "buffImage", "http://localhost:9000/terrapedia-images/items/wiki/buffs/ab/sharpened.png"
        )));

        PublicNpcServiceImpl service = new PublicNpcServiceImpl(npcMapper, categoryMapper, jdbcTemplate, new ObjectMapper());
        List<NpcBuffRelationDTO> result = service.getNpcBuffRelations(7L);

        assertEquals(1, result.size());
        assertEquals("http://localhost:9000/terrapedia-images/items/wiki/buffs/ab/sharpened.png", result.get(0).getImageUrl());

        ArgumentCaptor<String> queryCaptor = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).queryForList(queryCaptor.capture(), eq(7L));
        assertTrue(queryCaptor.getValue().contains("b.image_cached_url"));
        assertTrue(queryCaptor.getValue().contains("AS buffImage"));
    }

    @Test
    void shouldFallbackPublicLootToPrototypeNpcWhenVariantHasNoDirectDrops() {
        when(jdbcTemplate.queryForList(contains("WHERE nle.npc_id = ?"), eq(-55L))).thenReturn(List.of());
        lenient().when(jdbcTemplate.queryForObject(
            contains("FROM item_acquisition_sources"),
            eq(Integer.class),
            eq(-55L)
        )).thenReturn(0);
        lenient().when(jdbcTemplate.queryForList(contains("source_ref_id IS NULL"), eq("Zombie"))).thenReturn(List.of());
        lenient().when(jdbcTemplate.queryForList(contains("current_npc.npc_type"), eq(-55L))).thenReturn(List.of(Map.ofEntries(
            Map.entry("id", 41L),
            Map.entry("itemId", 282L),
            Map.entry("sourceItemId", 282),
            Map.entry("dropSourceKind", "npc_drop"),
            Map.entry("quantityMin", 1),
            Map.entry("quantityMax", 4),
            Map.entry("quantityText", "1-4"),
            Map.entry("chanceText", "100%"),
            Map.entry("itemName", "Glowstick"),
            Map.entry("itemNameZh", "荧光棒"),
            Map.entry("itemInternalName", "Glowstick")
        )));

        PublicNpcServiceImpl service = new PublicNpcServiceImpl(npcMapper, categoryMapper, jdbcTemplate, new ObjectMapper());
        List<NpcLootEntryDTO> result = service.getNpcLoot(-55L, -55L, "Zombie");

        assertEquals(1, result.size());
        assertEquals("Glowstick", result.get(0).getItemInternalName());
        assertEquals("100%", result.get(0).getChanceText());
    }
}

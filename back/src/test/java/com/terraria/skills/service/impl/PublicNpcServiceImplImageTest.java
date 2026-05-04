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
import com.terraria.skills.service.ManagedImageUrlPolicy;
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
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PublicNpcServiceImplImageTest {

    private static final String MANAGED_IMAGE = "http://localhost:9000/terrapedia-images/items/wiki/npcs/ab/guide.png";
    private static final String WIKI_IMAGE = "https://terraria.wiki.gg/images/Stingy%20Hornet.gif";
    private static final String STATIC_IMAGE = "/static/images/npcs/guide.png";

    @Mock
    private NpcMapper npcMapper;

    @Mock
    private CategoryMapper categoryMapper;

    @Mock
    private JdbcTemplate jdbcTemplate;

    @Test
    void shouldReturnManagedNpcImageUrlColumnForPublicList() {
        Npc npc = new Npc();
        npc.setId(1L);
        npc.setGameId(-650001L);
        npc.setInternalName("TestHornetStingy");
        npc.setName("Hornet");
        npc.setCategoryId(1L);
        npc.setImageUrl(MANAGED_IMAGE);
        npc.setIsBoss(false);
        npc.setStatus(1);

        Page<Npc> page = new Page<>(1, 20);
        page.setTotal(1);
        page.setRecords(List.of(npc));
        when(npcMapper.selectPage(any(Page.class), any())).thenReturn(page);

        PublicNpcServiceImpl service = newService();
        Page<NpcListItemDTO> result = service.getNpcs(new PublicNpcQuery());

        assertEquals(MANAGED_IMAGE, result.getRecords().get(0).getImageUrl());
    }

    @Test
    void shouldHideNonManagedNpcImageUrlColumnForPublicList() {
        Npc npc = new Npc();
        npc.setId(1L);
        npc.setGameId(-650001L);
        npc.setInternalName("TestHornetStingy");
        npc.setName("Hornet");
        npc.setCategoryId(1L);
        npc.setImageUrl(WIKI_IMAGE);
        npc.setIsBoss(false);
        npc.setStatus(1);

        Page<Npc> page = new Page<>(1, 20);
        page.setTotal(1);
        page.setRecords(List.of(npc));
        when(npcMapper.selectPage(any(Page.class), any())).thenReturn(page);

        PublicNpcServiceImpl service = newService();
        Page<NpcListItemDTO> result = service.getNpcs(new PublicNpcQuery());

        assertNull(result.getRecords().get(0).getImageUrl());
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

        PublicNpcServiceImpl service = newService();
        NpcListItemDTO result = service.getNpcs(new PublicNpcQuery()).getRecords().get(0);

        assertEquals(lootItemsJson, ReflectionTestUtils.getField(result, "lootItemsJson"));
        assertEquals(shopItemsJson, ReflectionTestUtils.getField(result, "shopItemsJson"));
        assertEquals(sourceItemsJson, ReflectionTestUtils.getField(result, "sourceItemsJson"));
    }

    @Test
    void shouldReturnManagedCachedBuffImageForPublicNpcBuffRelations() {
        when(jdbcTemplate.queryForList(contains("FROM npc_buff_relations"), eq(7L))).thenReturn(List.of(Map.of(
            "id", 31L,
            "buffId", 401L,
            "buffSourceId", 401,
            "buffInternalName", "Sharpened",
            "buffImage", "http://localhost:9000/terrapedia-images/items/wiki/buffs/ab/sharpened.png"
        )));

        PublicNpcServiceImpl service = newService();
        List<NpcBuffRelationDTO> result = service.getNpcBuffRelations(7L);

        assertEquals(1, result.size());
        assertEquals("http://localhost:9000/terrapedia-images/items/wiki/buffs/ab/sharpened.png", result.get(0).getImageUrl());

        ArgumentCaptor<String> queryCaptor = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).queryForList(queryCaptor.capture(), eq(7L));
        assertTrue(queryCaptor.getValue().contains("b.image_cached_url"));
        assertTrue(queryCaptor.getValue().contains("AS buffImage"));
    }

    @Test
    void shouldHideNonManagedLootShopAndBuffRelationImages() {
        Map<String, Object> lootRow = Map.ofEntries(
            Map.entry("id", 41L),
            Map.entry("itemId", 282L),
            Map.entry("dropSourceKind", "npc_drop"),
            Map.entry("chanceText", "100%"),
            Map.entry("sourcePage", "https://terraria.wiki.gg/wiki/Zombie"),
            Map.entry("itemName", "Glowstick"),
            Map.entry("itemInternalName", "Glowstick"),
            Map.entry("itemImage", WIKI_IMAGE)
        );
        Map<String, Object> shopRow = Map.ofEntries(
            Map.entry("id", 51L),
            Map.entry("itemId", 8L),
            Map.entry("priceText", "50 Copper"),
            Map.entry("notes", "Day only"),
            Map.entry("itemName", "Torch"),
            Map.entry("itemInternalName", "Torch"),
            Map.entry("itemImage", STATIC_IMAGE)
        );
        Map<String, Object> buffRow = Map.of(
            "id", 61L,
            "buffId", 401L,
            "buffInternalName", "Sharpened",
            "buffImage", WIKI_IMAGE
        );
        when(jdbcTemplate.queryForList(contains("WHERE nle.npc_id = ?"), eq(7L))).thenReturn(List.of(lootRow));
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_entries"), eq(7L))).thenReturn(List.of(shopRow));
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_conditions"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_buff_relations"), eq(7L))).thenReturn(List.of(buffRow));

        PublicNpcServiceImpl service = newService();

        NpcLootEntryDTO loot = service.getNpcLoot(7L, null, "Zombie").get(0);
        assertNull(loot.getImageUrl());
        assertEquals("https://terraria.wiki.gg/wiki/Zombie", loot.getSourcePage());
        assertEquals("100%", loot.getChanceText());

        assertNull(service.getNpcShopEntries(7L).get(0).getImageUrl());
        assertNull(service.getNpcBuffRelations(7L).get(0).getImageUrl());
    }

    @Test
    void shouldReturnManagedLootShopAndBuffRelationImages() {
        Map<String, Object> lootRow = Map.ofEntries(
            Map.entry("id", 41L),
            Map.entry("itemId", 282L),
            Map.entry("itemName", "Glowstick"),
            Map.entry("itemInternalName", "Glowstick"),
            Map.entry("itemImage", "http://localhost:9000/terrapedia-images/items/wiki/items/ab/glowstick.png")
        );
        Map<String, Object> shopRow = Map.ofEntries(
            Map.entry("id", 51L),
            Map.entry("itemId", 8L),
            Map.entry("itemName", "Torch"),
            Map.entry("itemInternalName", "Torch"),
            Map.entry("itemImage", "http://localhost:9000/terrapedia-images/items/wiki/items/cd/torch.png")
        );
        Map<String, Object> buffRow = Map.of(
            "id", 61L,
            "buffId", 401L,
            "buffInternalName", "Sharpened",
            "buffImage", "http://localhost:9000/terrapedia-images/items/wiki/buffs/ab/sharpened.png"
        );
        when(jdbcTemplate.queryForList(contains("WHERE nle.npc_id = ?"), eq(7L))).thenReturn(List.of(lootRow));
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_entries"), eq(7L))).thenReturn(List.of(shopRow));
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_conditions"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_buff_relations"), eq(7L))).thenReturn(List.of(buffRow));

        PublicNpcServiceImpl service = newService();

        assertEquals("http://localhost:9000/terrapedia-images/items/wiki/items/ab/glowstick.png", service.getNpcLoot(7L, null, "Zombie").get(0).getImageUrl());
        assertEquals("http://localhost:9000/terrapedia-images/items/wiki/items/cd/torch.png", service.getNpcShopEntries(7L).get(0).getImageUrl());
        assertEquals("http://localhost:9000/terrapedia-images/items/wiki/buffs/ab/sharpened.png", service.getNpcBuffRelations(7L).get(0).getImageUrl());
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

        PublicNpcServiceImpl service = newService();
        List<NpcLootEntryDTO> result = service.getNpcLoot(-55L, -55L, "Zombie");

        assertEquals(1, result.size());
        assertEquals("Glowstick", result.get(0).getItemInternalName());
        assertEquals("100%", result.get(0).getChanceText());
    }

    private PublicNpcServiceImpl newService() {
        return new PublicNpcServiceImpl(npcMapper, categoryMapper, jdbcTemplate, new ObjectMapper(), managedImageUrlPolicy());
    }

    private ManagedImageUrlPolicy managedImageUrlPolicy() {
        return new ManagedImageUrlPolicy() {
            @Override
            public boolean isManagedImageUrl(String value) {
                return value != null && value.startsWith("http://localhost:9000/terrapedia-images/items/");
            }

            @Override
            public List<String> trustedManagedImageUrlPrefixes() {
                return List.of("http://localhost:9000/terrapedia-images/items/");
            }
        };
    }
}

package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.NpcBuffRelationDTO;
import com.terraria.skills.dto.NpcListItemDTO;
import com.terraria.skills.dto.NpcLootEntryDTO;
import com.terraria.skills.dto.PublicNpcQuery;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.Npc;
import com.terraria.skills.mapper.CategoryMapper;
import com.terraria.skills.mapper.NpcMapper;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import com.terraria.skills.service.ManagedItemImageResolver;
import org.junit.jupiter.api.BeforeEach;
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
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PublicNpcServiceImplImageTest {

    private static final String MANAGED_IMAGE = "http://localhost:9000/terrapedia-images/items/wiki/npcs/ab/guide.png";
    private static final String CDN_BUFF_IMAGE = "https://cdn.example.com/terrapedia-images/buffs/wiki/ab/sharpened.png";
    private static final String WIKI_IMAGE = "https://terraria.wiki.gg/images/Stingy%20Hornet.gif";
    private static final String STATIC_IMAGE = "/static/images/npcs/guide.png";

    @Mock
    private NpcMapper npcMapper;

    @Mock
    private CategoryMapper categoryMapper;

    @Mock
    private JdbcTemplate jdbcTemplate;

    @Mock
    private ManagedItemImageResolver managedItemImageResolver;

    @BeforeEach
    void setUpManagedItemImageResolver() {
        lenient().when(managedItemImageResolver.resolveManagedImages(any())).thenReturn(Map.of());
        lenient().when(managedItemImageResolver.resolveManagedImage(any(), anyMap())).thenAnswer(invocation -> {
            Item item = invocation.getArgument(0);
            Map<Long, String> managedImagesByItemId = invocation.getArgument(1);
            if (item == null || item.getId() == null) {
                return null;
            }
            String resolved = managedImagesByItemId == null ? null : managedImagesByItemId.get(item.getId());
            if (managedImageUrlPolicy().isManagedImageUrl(resolved)) {
                return resolved;
            }
            String fallback = item.getImage();
            return managedImageUrlPolicy().isManagedImageUrl(fallback) ? fallback : null;
        });
    }

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
            "buffImage", "http://localhost:9000/terrapedia-images/buffs/wiki/ab/sharpened.png"
        )));

        PublicNpcServiceImpl service = newService();
        List<NpcBuffRelationDTO> result = service.getNpcBuffRelations(7L);

        assertEquals(1, result.size());
        assertEquals("http://localhost:9000/terrapedia-images/buffs/wiki/ab/sharpened.png", result.get(0).getImageUrl());

        ArgumentCaptor<String> queryCaptor = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).queryForList(queryCaptor.capture(), eq(7L));
        assertTrue(queryCaptor.getValue().contains("b.image_cached_url"));
        assertTrue(queryCaptor.getValue().contains("AS buffImage"));
    }

    @Test
    void shouldAllowConfiguredCdnBuffImageForPublicNpcBuffRelations() {
        when(jdbcTemplate.queryForList(contains("FROM npc_buff_relations"), eq(8L))).thenReturn(List.of(Map.of(
            "id", 32L,
            "buffId", 402L,
            "buffSourceId", 402,
            "buffInternalName", "Sharpened",
            "buffImage", CDN_BUFF_IMAGE
        )));

        PublicNpcServiceImpl service = newService();
        List<NpcBuffRelationDTO> result = service.getNpcBuffRelations(8L);

        assertEquals(1, result.size());
        assertEquals(CDN_BUFF_IMAGE, result.get(0).getImageUrl());
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
            "buffImage", "http://localhost:9000/terrapedia-images/buffs/wiki/ab/sharpened.png"
        );
        when(jdbcTemplate.queryForList(contains("WHERE nle.npc_id = ?"), eq(7L))).thenReturn(List.of(lootRow));
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_entries"), eq(7L))).thenReturn(List.of(shopRow));
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_conditions"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npc_buff_relations"), eq(7L))).thenReturn(List.of(buffRow));

        PublicNpcServiceImpl service = newService();

        assertEquals("http://localhost:9000/terrapedia-images/items/wiki/items/ab/glowstick.png", service.getNpcLoot(7L, null, "Zombie").get(0).getImageUrl());
        assertEquals("http://localhost:9000/terrapedia-images/items/wiki/items/cd/torch.png", service.getNpcShopEntries(7L).get(0).getImageUrl());
        assertEquals("http://localhost:9000/terrapedia-images/buffs/wiki/ab/sharpened.png", service.getNpcBuffRelations(7L).get(0).getImageUrl());
    }

    @Test
    void shouldResolveLootImageFromManagedItemImagesWhenItemsImageIsMissing() {
        String managedLootImage = "http://localhost:9000/terrapedia-images/items/wiki/items/re/requiem.png";
        when(jdbcTemplate.queryForList(contains("WHERE nle.npc_id = ?"), eq(253L))).thenReturn(List.of(Map.ofEntries(
            Map.entry("id", 401L),
            Map.entry("itemId", 5001L),
            Map.entry("itemName", "Requiem"),
            Map.entry("itemInternalName", "Requiem"),
            Map.entry("chanceText", "1.56%")
        )));
        when(managedItemImageResolver.resolveManagedImages(any())).thenReturn(Map.of(5001L, managedLootImage));

        PublicNpcServiceImpl service = newService();
        NpcLootEntryDTO loot = service.getNpcLoot(253L, 253L, "Reaper").get(0);

        assertEquals(managedLootImage, loot.getImageUrl());

        ArgumentCaptor<String> queryCaptor = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).queryForList(queryCaptor.capture(), eq(253L));
        assertTrue(queryCaptor.getValue().contains("item_images ii"));
        assertTrue(queryCaptor.getValue().contains("AS itemImage"));
        assertFalse(queryCaptor.getValue().contains("i.image AS itemImage"));
    }

    @Test
    void shouldPreferManagedItemImageResolverOverWikiLootItemImage() {
        String managedLootImage = "http://localhost:9000/terrapedia-images/items/wiki/items/de/death-sickle.png";
        when(jdbcTemplate.queryForList(contains("WHERE nle.npc_id = ?"), eq(253L))).thenReturn(List.of(Map.ofEntries(
            Map.entry("id", 402L),
            Map.entry("itemId", 1327L),
            Map.entry("itemName", "Death Sickle"),
            Map.entry("itemInternalName", "DeathSickle"),
            Map.entry("itemImage", WIKI_IMAGE)
        )));
        when(managedItemImageResolver.resolveManagedImages(any())).thenReturn(Map.of(1327L, managedLootImage));

        PublicNpcServiceImpl service = newService();
        NpcLootEntryDTO loot = service.getNpcLoot(253L, 253L, "Reaper").get(0);

        assertEquals(managedLootImage, loot.getImageUrl());
    }

    @Test
    void shouldResolveShopImageFromManagedItemImagesWhenItemsImageIsMissing() {
        String managedShopImage = "http://localhost:9000/terrapedia-images/items/wiki/items/to/torch.png";
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_entries"), eq(22L))).thenReturn(List.of(Map.ofEntries(
            Map.entry("id", 501L),
            Map.entry("itemId", 8L),
            Map.entry("itemName", "Torch"),
            Map.entry("itemInternalName", "Torch"),
            Map.entry("priceText", "50 Copper")
        )));
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_conditions"), any(Object[].class))).thenReturn(List.of());
        when(managedItemImageResolver.resolveManagedImages(any())).thenReturn(Map.of(8L, managedShopImage));

        PublicNpcServiceImpl service = newService();

        assertEquals(managedShopImage, service.getNpcShopEntries(22L).get(0).getImageUrl());

        ArgumentCaptor<String> queryCaptor = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).queryForList(queryCaptor.capture(), eq(22L));
        assertTrue(queryCaptor.getValue().contains("item_images ii"));
        assertTrue(queryCaptor.getValue().contains("AS itemImage"));
        assertFalse(queryCaptor.getValue().contains("i.image AS itemImage"));
    }

    @Test
    void shouldKeepManagedItemsImageFallbackWhenResolverHasNoCachedImage() {
        String managedLootImage = "http://localhost:9000/terrapedia-images/items/wiki/items/gl/glowstick.png";
        when(jdbcTemplate.queryForList(contains("WHERE nle.npc_id = ?"), eq(7L))).thenReturn(List.of(Map.ofEntries(
            Map.entry("id", 41L),
            Map.entry("itemId", 282L),
            Map.entry("itemName", "Glowstick"),
            Map.entry("itemInternalName", "Glowstick"),
            Map.entry("itemImage", managedLootImage)
        )));
        when(managedItemImageResolver.resolveManagedImages(any())).thenReturn(Map.of());

        PublicNpcServiceImpl service = newService();
        NpcLootEntryDTO loot = service.getNpcLoot(7L, 7L, "Zombie").get(0);

        assertEquals(managedLootImage, loot.getImageUrl());
    }

    @Test
    void shouldNotExposePrototypeFallbackAsPublicLootWhenVariantHasNoDirectDrops() {
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
            Map.entry("itemInternalName", "Glowstick"),
            Map.entry("sourceNpcId", 55L),
            Map.entry("sourceNpcInternalName", "Zombie")
        )));

        PublicNpcServiceImpl service = newService();
        List<NpcLootEntryDTO> result = service.getNpcLoot(-55L, -55L, "Zombie");

        assertTrue(result.isEmpty());
    }

    @Test
    void shouldNotExposeSameNameFallbackAsPublicLootWhenVariantHasNoDirectDrops() {
        lenient().when(jdbcTemplate.queryForList(contains("WHERE nle.npc_id = ?"), eq(-65L))).thenReturn(List.of());
        lenient().when(jdbcTemplate.queryForList(contains("WHERE nle.npc_id = ?"), eq(42L))).thenReturn(List.of(Map.ofEntries(
            Map.entry("id", 41L),
            Map.entry("itemId", 887L),
            Map.entry("dropSourceKind", "npc_drop"),
            Map.entry("chanceText", "1% 1.99%"),
            Map.entry("itemName", "Bezoar"),
            Map.entry("itemNameZh", "Bezoar ZH"),
            Map.entry("itemInternalName", "Bezoar")
        )));
        lenient().when(jdbcTemplate.queryForObject(
            contains("FROM item_acquisition_sources"),
            eq(Integer.class),
            eq(-65L)
        )).thenReturn(0);
        lenient().when(jdbcTemplate.queryForList(contains("source_ref_id IS NULL"), eq("Hornet"))).thenReturn(List.of());
        lenient().when(jdbcTemplate.queryForList(contains("LOWER(TRIM(canonical_npc.name))"), eq(-65L))).thenReturn(List.of(Map.ofEntries(
            Map.entry("sourceNpcId", 42L)
        )));

        PublicNpcServiceImpl service = newService();
        List<NpcLootEntryDTO> result = service.getNpcLoot(-65L, -65L, "Hornet");

        assertTrue(result.isEmpty());
    }

    @Test
    void shouldExposeDirectLootProvenanceAndKeepDerivedFallbackOutOfPublicNpcLoot() {
        when(jdbcTemplate.queryForList(contains("WHERE nle.npc_id = ?"), eq(7L))).thenReturn(List.of(Map.ofEntries(
            Map.entry("id", 41L),
            Map.entry("itemId", 282L),
            Map.entry("dropSourceKind", "npc_drop"),
            Map.entry("chanceText", "100%"),
            Map.entry("itemName", "Glowstick"),
            Map.entry("itemInternalName", "Glowstick")
        )));

        PublicNpcServiceImpl service = newService();
        NpcLootEntryDTO direct = service.getNpcLoot(7L, 7L, "Zombie").get(0);

        assertEquals("direct", direct.getLootSourceMode());
        assertEquals(true, direct.getTrustedStructured());
        assertEquals(7L, direct.getSourceNpcId());

        when(jdbcTemplate.queryForList(contains("WHERE nle.npc_id = ?"), eq(8L))).thenReturn(List.of());
        assertTrue(service.getNpcLoot(8L, 8L, "Blue Slime").isEmpty());
    }

    @Test
    void shouldQueryOnlyNpcDropRowsForPublicNpcLoot() {
        when(jdbcTemplate.queryForList(contains("WHERE nle.npc_id = ?"), eq(7L))).thenReturn(List.of());

        PublicNpcServiceImpl service = newService();
        service.getNpcLoot(7L, 7L, "Zombie");

        ArgumentCaptor<String> queryCaptor = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).queryForList(queryCaptor.capture(), eq(7L));
        assertTrue(queryCaptor.getValue().contains("nle.drop_source_kind IS NULL OR nle.drop_source_kind = 'npc_drop'"));
    }

    private PublicNpcServiceImpl newService() {
        return new PublicNpcServiceImpl(npcMapper, categoryMapper, jdbcTemplate, new ObjectMapper(), managedImageUrlPolicy(), managedItemImageResolver);
    }

    private ManagedImageUrlPolicy managedImageUrlPolicy() {
        return new ManagedImageUrlPolicy() {
            @Override
            public boolean isManagedImageUrl(String value) {
                return value != null
                    && (value.startsWith("http://localhost:9000/terrapedia-images/items/")
                    || value.startsWith("http://localhost:9000/terrapedia-images/buffs/")
                    || value.startsWith("https://cdn.example.com/terrapedia-images/buffs/"));
            }

            @Override
            public List<String> trustedManagedImageUrlPrefixes() {
                return List.of(
                    "http://localhost:9000/terrapedia-images/items/",
                    "http://localhost:9000/terrapedia-images/buffs/",
                    "https://cdn.example.com/terrapedia-images/buffs/"
                );
            }
        };
    }
}

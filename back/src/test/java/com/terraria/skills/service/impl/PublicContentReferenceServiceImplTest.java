package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.NpcDetailDTO;
import com.terraria.skills.dto.NpcListItemDTO;
import com.terraria.skills.dto.PublicBossDetailDTO;
import com.terraria.skills.dto.PublicBossListDTO;
import com.terraria.skills.dto.PublicBossQuery;
import com.terraria.skills.dto.PublicContentReferenceDTO;
import com.terraria.skills.dto.PublicContentReferenceResolveItemDTO;
import com.terraria.skills.dto.PublicItemDetailDTO;
import com.terraria.skills.dto.PublicItemSuggestionDTO;
import com.terraria.skills.dto.PublicNpcQuery;
import com.terraria.skills.service.PublicBossService;
import com.terraria.skills.service.PublicItemService;
import com.terraria.skills.service.PublicNpcService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PublicContentReferenceServiceImplTest {

    @Mock
    private PublicItemService publicItemService;

    @Mock
    private PublicNpcService publicNpcService;

    @Mock
    private PublicBossService publicBossService;

    @Test
    void searchShouldMergeItemAndNpcResultsIntoUnifiedContract() {
        PublicItemSuggestionDTO item = new PublicItemSuggestionDTO();
        item.setId(77L);
        item.setName("Terra Blade");
        item.setNameZh("泰拉刃");
        item.setInternalName("TerraBlade");
        item.setImage("http://localhost:9000/items/terra-blade.png");
        item.setCategoryName("Weapons");
        item.setRarity("Yellow");

        NpcListItemDTO npc = new NpcListItemDTO();
        npc.setId(1L);
        npc.setName("Guide");
        npc.setNameZh("向导");
        npc.setInternalName("Guide");
        npc.setImageUrl("http://localhost:9000/npcs/guide.png");
        npc.setCategoryName("Town NPC");
        npc.setIsTownNpc(true);

        Page<NpcListItemDTO> npcPage = new Page<>(1, 10);
        npcPage.setRecords(List.of(npc));
        npcPage.setTotal(1);

        when(publicItemService.searchSuggestions("泰", 10)).thenReturn(List.of(item));
        when(publicNpcService.getNpcs(any(PublicNpcQuery.class))).thenReturn(npcPage);

        PublicContentReferenceServiceImpl service = newService();
        List<PublicContentReferenceDTO> results = service.search(Set.of("item", "npc"), " 泰 ", 20);

        assertEquals(2, results.size());
        assertEquals("item", results.get(0).getType());
        assertEquals("77", results.get(0).getId());
        assertEquals("泰拉刃", results.get(0).getLabel());
        assertEquals("Terra Blade", results.get(0).getName());
        assertEquals("TerraBlade", results.get(0).getInternalName());
        assertEquals("http://localhost:9000/items/terra-blade.png", results.get(0).getImageUrl());
        assertEquals("Weapons", results.get(0).getCategoryName());
        assertEquals("物品 · Weapons · Yellow", results.get(0).getSummary());
        assertEquals("/items/77", results.get(0).getDetailPath());
        assertEquals(Boolean.TRUE, results.get(0).getAvailable());
        assertEquals("npc", results.get(1).getType());
        assertEquals("1", results.get(1).getId());
        assertEquals("向导", results.get(1).getLabel());
        assertEquals("/npcs/1", results.get(1).getDetailPath());

        ArgumentCaptor<PublicNpcQuery> npcQuery = ArgumentCaptor.forClass(PublicNpcQuery.class);
        verify(publicNpcService).getNpcs(npcQuery.capture());
        assertEquals("泰", npcQuery.getValue().getSearch());
        assertEquals(10, npcQuery.getValue().getLimit());
    }

    @Test
    void searchShouldMergeBossResultsIntoUnifiedContract() {
        PublicBossListDTO boss = bossList(34L);
        Page<PublicBossListDTO> bossPage = new Page<>(1, 20);
        bossPage.setRecords(List.of(boss));
        bossPage.setTotal(1);

        when(publicBossService.getPublicBosses(any(PublicBossQuery.class))).thenReturn(bossPage);

        PublicContentReferenceServiceImpl service = newService();
        List<PublicContentReferenceDTO> results = service.search(Set.of("boss"), "史莱姆", 20);

        assertEquals(1, results.size());
        assertEquals("boss", results.get(0).getType());
        assertEquals("34", results.get(0).getId());
        assertEquals("史莱姆王", results.get(0).getLabel());
        assertEquals("King Slime", results.get(0).getName());
        assertEquals("KING_SLIME", results.get(0).getInternalName());
        assertEquals("http://localhost:9000/bosses/king-slime.png", results.get(0).getImageUrl());
        assertEquals("PRE_HARDMODE", results.get(0).getCategoryName());
        assertEquals("Boss · PRE_HARDMODE · 顺序 1", results.get(0).getSummary());
        assertEquals("/bosses/34", results.get(0).getDetailPath());
        assertEquals(Boolean.TRUE, results.get(0).getAvailable());

        ArgumentCaptor<PublicBossQuery> bossQuery = ArgumentCaptor.forClass(PublicBossQuery.class);
        verify(publicBossService).getPublicBosses(bossQuery.capture());
        assertEquals("史莱姆", bossQuery.getValue().getSearch());
        assertEquals(20, bossQuery.getValue().getLimit());
    }

    @Test
    void searchShouldReturnDefaultReferencesForBlankQuery() {
        PublicItemSuggestionDTO item = new PublicItemSuggestionDTO();
        item.setId(1L);
        item.setName("Iron Pickaxe");
        item.setNameZh("铁镐");
        item.setInternalName("IronPickaxe");

        NpcListItemDTO npc = new NpcListItemDTO();
        npc.setId(17L);
        npc.setName("Merchant");
        npc.setNameZh("商人");
        npc.setInternalName("Merchant");
        npc.setIsTownNpc(true);

        Page<NpcListItemDTO> npcPage = new Page<>(1, 10);
        npcPage.setRecords(List.of(npc));
        npcPage.setTotal(1);

        when(publicItemService.searchSuggestions("铁", 10)).thenReturn(List.of(item));
        when(publicNpcService.getNpcs(any(PublicNpcQuery.class))).thenReturn(npcPage);

        PublicContentReferenceServiceImpl service = newService();

        List<PublicContentReferenceDTO> results = service.search(Set.of("item", "npc"), "   ", 20);

        assertEquals(2, results.size());
        assertEquals("item", results.get(0).getType());
        assertEquals("铁镐", results.get(0).getLabel());
        assertEquals("npc", results.get(1).getType());
        assertEquals("商人", results.get(1).getLabel());

        ArgumentCaptor<PublicNpcQuery> npcQuery = ArgumentCaptor.forClass(PublicNpcQuery.class);
        verify(publicNpcService).getNpcs(npcQuery.capture());
        assertEquals("商", npcQuery.getValue().getSearch());
        assertEquals(10, npcQuery.getValue().getLimit());
    }

    @Test
    void searchShouldReturnDefaultBossReferencesForBlankQuery() {
        PublicBossListDTO boss = bossList(34L);
        Page<PublicBossListDTO> bossPage = new Page<>(1, 20);
        bossPage.setRecords(List.of(boss));
        bossPage.setTotal(1);

        when(publicBossService.getPublicBosses(any(PublicBossQuery.class))).thenReturn(bossPage);

        PublicContentReferenceServiceImpl service = newService();
        List<PublicContentReferenceDTO> results = service.search(Set.of("boss"), "   ", 20);

        assertEquals(1, results.size());
        assertEquals("boss", results.get(0).getType());
        assertEquals("史莱姆王", results.get(0).getLabel());

        ArgumentCaptor<PublicBossQuery> bossQuery = ArgumentCaptor.forClass(PublicBossQuery.class);
        verify(publicBossService).getPublicBosses(bossQuery.capture());
        assertEquals("王", bossQuery.getValue().getSearch());
        assertEquals(20, bossQuery.getValue().getLimit());
    }

    @Test
    void resolveShouldPreserveOrderAndMarkMissingReferencesUnavailable() {
        PublicItemDetailDTO item = itemDetail(77L);
        NpcDetailDTO npc = npcDetail(1L);

        when(publicItemService.getPublicItemById(77L)).thenReturn(item);
        when(publicNpcService.getNpcById(1L)).thenReturn(npc);
        when(publicNpcService.getNpcById(999L)).thenReturn(null);

        PublicContentReferenceServiceImpl service = newService();
        List<PublicContentReferenceDTO> results = service.resolve(List.of(
            ref("npc", "1"),
            ref("item", "77"),
            ref("npc", "999")
        ));

        assertEquals("npc", results.get(0).getType());
        assertEquals("1", results.get(0).getId());
        assertTrue(results.get(0).getAvailable());
        assertEquals("item", results.get(1).getType());
        assertEquals("77", results.get(1).getId());
        assertTrue(results.get(1).getAvailable());
        assertEquals("npc", results.get(2).getType());
        assertEquals("999", results.get(2).getId());
        assertFalse(results.get(2).getAvailable());
        assertEquals("npc #999", results.get(2).getLabel());
    }

    @Test
    void resolveShouldResolveBossReference() {
        PublicBossDetailDTO boss = bossDetail(34L);
        when(publicBossService.getPublicBossById(34L)).thenReturn(boss);

        PublicContentReferenceServiceImpl service = newService();
        List<PublicContentReferenceDTO> results = service.resolve(List.of(ref("boss", "34")));

        assertEquals(1, results.size());
        assertEquals("boss", results.get(0).getType());
        assertEquals("34", results.get(0).getId());
        assertEquals("史莱姆王", results.get(0).getLabel());
        assertEquals("King Slime", results.get(0).getName());
        assertEquals("KING_SLIME", results.get(0).getInternalName());
        assertEquals("/bosses/34", results.get(0).getDetailPath());
        assertTrue(results.get(0).getAvailable());
    }

    @Test
    void resolveShouldMarkMissingBossReferenceUnavailableWithBossPath() {
        when(publicBossService.getPublicBossById(999L)).thenReturn(null);

        PublicContentReferenceServiceImpl service = newService();
        List<PublicContentReferenceDTO> results = service.resolve(List.of(ref("boss", "999")));

        assertEquals(1, results.size());
        assertEquals("boss", results.get(0).getType());
        assertEquals("999", results.get(0).getId());
        assertEquals("boss #999", results.get(0).getLabel());
        assertEquals("/bosses/999", results.get(0).getDetailPath());
        assertFalse(results.get(0).getAvailable());
    }

    @Test
    void resolveShouldPreserveRequestedNpcIdWhenServiceReturnsRepresentativeNpc() {
        NpcDetailDTO npc = npcDetail(454L);
        when(publicNpcService.getNpcById(455L)).thenReturn(npc);

        PublicContentReferenceServiceImpl service = newService();
        List<PublicContentReferenceDTO> results = service.resolve(List.of(ref("npc", "455")));

        assertEquals(1, results.size());
        assertEquals("npc", results.get(0).getType());
        assertEquals("455", results.get(0).getId());
        assertEquals("/npcs/455", results.get(0).getDetailPath());
        assertTrue(results.get(0).getAvailable());
    }

    @Test
    void resolveShouldSkipNullEntriesAndReturnUnavailableRowsForInvalidRefs() {
        PublicContentReferenceServiceImpl service = newService();

        List<PublicContentReferenceDTO> results = service.resolve(Arrays.asList(
            null,
            ref("biome", "1"),
            ref("item", "abc"),
            ref("item", "-1"),
            ref("npc", "1234567890123"),
            ref(null, null)
        ));

        assertEquals(5, results.size());
        assertEquals("biome", results.get(0).getType());
        assertEquals("1", results.get(0).getId());
        assertFalse(results.get(0).getAvailable());
        assertEquals("item", results.get(1).getType());
        assertEquals("abc", results.get(1).getId());
        assertFalse(results.get(1).getAvailable());
        assertEquals("item", results.get(2).getType());
        assertEquals("-1", results.get(2).getId());
        assertFalse(results.get(2).getAvailable());
        assertEquals("npc", results.get(3).getType());
        assertEquals("1234567890123", results.get(3).getId());
        assertFalse(results.get(3).getAvailable());
        assertEquals("unknown", results.get(4).getType());
        assertEquals("", results.get(4).getId());
        assertFalse(results.get(4).getAvailable());
        verifyNoInteractions(publicItemService, publicNpcService, publicBossService);
    }

    @Test
    void resolveShouldDeduplicateReferencesBeforeCallingSourceServices() {
        when(publicItemService.getPublicItemById(77L)).thenReturn(itemDetail(77L));

        PublicContentReferenceServiceImpl service = newService();
        List<PublicContentReferenceDTO> results = service.resolve(List.of(
            ref("item", "77"),
            ref(" item ", " 77 "),
            ref("ITEM", "77")
        ));

        assertEquals(1, results.size());
        assertEquals("item", results.get(0).getType());
        assertEquals("77", results.get(0).getId());
        verify(publicItemService).getPublicItemById(77L);
    }

    @Test
    void resolveShouldCapAtOneHundredUniqueValidReferences() {
        for (long id = 1; id <= 100; id++) {
            when(publicItemService.getPublicItemById(id)).thenReturn(itemDetail(id));
        }

        List<PublicContentReferenceResolveItemDTO> refs = new ArrayList<>();
        for (int id = 1; id <= 105; id++) {
            refs.add(ref("item", String.valueOf(id)));
        }

        PublicContentReferenceServiceImpl service = newService();
        List<PublicContentReferenceDTO> results = service.resolve(refs);

        assertEquals(100, results.size());
        assertEquals("1", results.get(0).getId());
        assertEquals("100", results.get(99).getId());
        verify(publicItemService, never()).getPublicItemById(101L);
    }

    @Test
    void resolveShouldDeduplicateAndCapInvalidReferencesBeforeBuildingMissingRows() {
        List<PublicContentReferenceResolveItemDTO> refs = new ArrayList<>();
        for (int index = 0; index < 150; index++) {
            refs.add(ref("boss", "bad-" + index));
        }
        refs.add(ref("boss", "bad-1"));

        PublicContentReferenceServiceImpl service = newService();
        List<PublicContentReferenceDTO> results = service.resolve(refs);

        assertEquals(100, results.size());
        assertEquals("boss", results.get(0).getType());
        assertEquals("bad-0", results.get(0).getId());
        assertFalse(results.get(0).getAvailable());
        assertEquals("bad-99", results.get(99).getId());
        verifyNoInteractions(publicItemService, publicNpcService, publicBossService);
    }

    private PublicContentReferenceServiceImpl newService() {
        return new PublicContentReferenceServiceImpl(publicItemService, publicNpcService, publicBossService);
    }

    private static PublicItemDetailDTO itemDetail(Long id) {
        PublicItemDetailDTO item = new PublicItemDetailDTO();
        item.setId(id);
        item.setName("Terra Blade");
        item.setNameZh("泰拉刃");
        item.setInternalName("TerraBlade");
        item.setImage("http://localhost:9000/items/terra-blade.png");
        item.setCategoryName("Weapons");
        item.setRarity("Yellow");
        return item;
    }

    private static NpcDetailDTO npcDetail(Long id) {
        NpcDetailDTO npc = new NpcDetailDTO();
        npc.setId(id);
        npc.setName("Guide");
        npc.setNameZh("向导");
        npc.setInternalName("Guide");
        npc.setImageUrl("http://localhost:9000/npcs/guide.png");
        npc.setCategoryName("Town NPC");
        npc.setIsTownNpc(true);
        return npc;
    }

    private static PublicBossListDTO bossList(Long id) {
        PublicBossListDTO boss = new PublicBossListDTO();
        boss.setId(id);
        boss.setCode("KING_SLIME");
        boss.setName("King Slime");
        boss.setNameZh("史莱姆王");
        boss.setNameEn("King Slime");
        boss.setImageUrl("http://localhost:9000/bosses/king-slime.png");
        boss.setBossType("PRE_HARDMODE");
        boss.setProgressionOrder(1);
        return boss;
    }

    private static PublicBossDetailDTO bossDetail(Long id) {
        PublicBossDetailDTO boss = new PublicBossDetailDTO();
        boss.setId(id);
        boss.setCode("KING_SLIME");
        boss.setName("King Slime");
        boss.setNameZh("史莱姆王");
        boss.setNameEn("King Slime");
        boss.setImageUrl("http://localhost:9000/bosses/king-slime.png");
        boss.setBossType("PRE_HARDMODE");
        boss.setProgressionOrder(1);
        return boss;
    }

    private static PublicContentReferenceResolveItemDTO ref(String type, String id) {
        PublicContentReferenceResolveItemDTO ref = new PublicContentReferenceResolveItemDTO();
        ref.setType(type);
        ref.setId(id);
        return ref;
    }
}

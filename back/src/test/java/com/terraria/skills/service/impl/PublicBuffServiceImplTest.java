package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.PublicBuffDetailDTO;
import com.terraria.skills.dto.PublicBuffListDTO;
import com.terraria.skills.dto.PublicBuffQuery;
import com.terraria.skills.entity.Buff;
import com.terraria.skills.mapper.BuffMapper;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Map;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doThrow;

@ExtendWith(MockitoExtension.class)
class PublicBuffServiceImplTest {

    private static final String CDN_BUFF_IMAGE_URL = "https://cdn.example.com/terrapedia-images/buffs/wiki/ab/sharpened.png";
    private static final String CDN_NPC_IMAGE_URL = "https://cdn.example.com/terrapedia-images/npcs/wiki/ab/hornet.gif";
    private static final String CDN_ITEM_IMAGE_URL = "https://cdn.example.com/terrapedia-images/items/wiki/ab/cursed-arrow.png";

    @Mock
    private BuffMapper buffMapper;

    @Mock
    private JdbcTemplate jdbcTemplate;

    @Test
    void shouldAllowConfiguredCdnBuffImages() {
        Buff buff = new Buff();
        buff.setId(159L);
        buff.setSourceId(159);
        buff.setInternalName("Sharpened");
        buff.setEnglishName("Sharpened");
        buff.setNameZh("Sharpened");
        buff.setImageCachedUrl(CDN_BUFF_IMAGE_URL);
        buff.setBuffType("buff");
        buff.setStatus(1);

        Page<Buff> page = new Page<>(1, 20);
        page.setTotal(1);
        page.setRecords(List.of(buff));
        when(buffMapper.selectPage(any(Page.class), any())).thenReturn(page);

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), null, new ObjectMapper());
        Page<PublicBuffListDTO> result = service.getPublicBuffs(new PublicBuffQuery());

        assertEquals(1, result.getRecords().size());
        assertEquals(CDN_BUFF_IMAGE_URL, result.getRecords().get(0).getImageUrl());
    }

    @Test
    void shouldUseProjectionCountsForPublicBuffListWhenLocalCountsAreStale() {
        Buff buff = new Buff();
        buff.setId(46L);
        buff.setSourceId(46);
        buff.setInternalName("Chilled");
        buff.setEnglishName("Chilled");
        buff.setBuffType("debuff");
        buff.setSourceItemCount(2);
        buff.setImmuneNpcCount(0);
        buff.setStatus(1);

        Page<Buff> page = new Page<>(1, 20);
        page.setTotal(1);
        page.setRecords(List.of(buff));
        when(buffMapper.selectPage(any(Page.class), any())).thenReturn(page);
        when(jdbcTemplate.queryForList(contains("source_item_count, immune_npc_count"), any(Object[].class))).thenReturn(List.of(Map.of(
            "source_id", 46,
            "internal_name", "Chilled",
            "source_item_count", 0,
            "immune_npc_count", 6
        )));

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        Page<PublicBuffListDTO> result = service.getPublicBuffs(new PublicBuffQuery());

        assertEquals(1, result.getRecords().size());
        assertEquals(0, result.getRecords().get(0).getSourceItemCount());
        assertEquals(6, result.getRecords().get(0).getImmuneNpcCount());
    }

    @Test
    void shouldLoadPublicBuffDetailWithStructuredEvidence() {
        Buff buff = new Buff();
        buff.setId(39L);
        buff.setSourceId(39);
        buff.setInternalName("CursedInferno");
        buff.setEnglishName("Cursed Inferno");
        buff.setNameZh("诅咒狱火");
        buff.setBuffType("debuff");
        buff.setSourceItemCount(7);
        buff.setImmuneNpcCount(25);
        buff.setSourceItemsJson("[{\"sourceId\":47,\"internalName\":\"CursedArrow\",\"nameZh\":\"诅咒箭\"}]");
        buff.setImmuneNpcSampleJson("[{\"sourceId\":68,\"internalName\":\"DungeonGuardian\",\"name\":\"Dungeon Guardian\"}]");
        buff.setStatus(1);

        when(buffMapper.selectById(39L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_buffs`"), eq(39))).thenReturn(List.of(Map.of(
            "source_items_json",
            "[{\"sourceId\":47,\"internalName\":\"CursedArrow\",\"nameZh\":\"诅咒箭\"}]",
            "immune_npcs_json",
            "[{\"sourceId\":68,\"internalName\":\"DungeonGuardian\",\"name\":\"Dungeon Guardian\"},{\"sourceId\":101,\"internalName\":\"Clinger\",\"name\":\"Clinger\"}]",
            "source_evidence_json",
            "{\"provider\":\"terraria.wiki.gg\",\"pageTitle\":\"Cursed Inferno\",\"canonicalPageTitle\":\"Cursed Inferno\",\"revisionId\":12345,\"revisionTimestamp\":\"2026-05-15T00:00:00Z\",\"parseStatus\":\"parsed\",\"sectionAnchors\":[\"来自玩家\",\"来自敌怪\",\"免疫的_NPC\"],\"unresolvedFacts\":[{\"type\":\"npc\",\"name\":\"Unresolved\"}]}"
        )));

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        PublicBuffDetailDTO detail = service.getPublicBuffDetail(39L);

        assertNotNull(detail);
        assertEquals(39L, detail.getId());
        assertEquals("CursedInferno", detail.getInternalName());
        assertEquals(7, detail.getSourceItemCount());
        assertEquals(1, detail.getSourceItems().size());
        assertEquals(0, detail.getInflictingNpcs().size());
        assertEquals(2, detail.getImmuneNpcs().size());
        assertEquals("Clinger", detail.getImmuneNpcs().get(1).getName());
        assertEquals(2, detail.getImmuneNpcCount());
        assertNotNull(detail.getSourceEvidence());
        assertEquals("parsed", detail.getSourceEvidence().getParseStatus());
        assertEquals(12345L, detail.getSourceEvidence().getRevisionId());
        assertEquals(1, detail.getSourceEvidence().getUnresolvedFacts().size());
        assertEquals("Cursed Inferno", detail.getProvenance().getPageTitle());
    }

    @Test
    void shouldUseProjectionSourceItemCountForDetailWhenLocalCountIsStale() {
        Buff buff = new Buff();
        buff.setId(46L);
        buff.setSourceId(46);
        buff.setInternalName("Chilled");
        buff.setEnglishName("Chilled");
        buff.setBuffType("debuff");
        buff.setSourceItemCount(2);
        buff.setImmuneNpcCount(0);
        buff.setStatus(1);

        when(buffMapper.selectById(46L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(argThat(sql ->
            sql.contains("FROM `terria_v1_relation`.`projection_buffs`")
                && sql.contains("deleted = 0")
                && sql.contains("status = 1")
        ), eq(46))).thenReturn(List.of(Map.of(
            "source_item_count", 0,
            "immune_npc_count", 6,
            "source_items_json",
            "[]",
            "inflicting_npcs_json",
            "[]",
            "immune_npcs_json",
            "[{\"internalName\":\"IceSlime\",\"name\":\"Ice Slime\"}]",
            "source_evidence_json",
            "{\"parseStatus\":\"parsed\"}"
        )));

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        PublicBuffDetailDTO detail = service.getPublicBuffDetail(46L);

        assertNotNull(detail);
        assertEquals(0, detail.getSourceItemCount());
        assertEquals(0, detail.getSourceItems().size());
        assertEquals(1, detail.getImmuneNpcCount());
        assertEquals(1, detail.getImmuneNpcs().size());
    }

    @Test
    void shouldEnrichImmuneNpcEvidenceWithLocalNpcImages() {
        Buff buff = new Buff();
        buff.setId(20L);
        buff.setSourceId(20);
        buff.setInternalName("Poisoned");
        buff.setEnglishName("Poisoned");
        buff.setNameZh("中毒");
        buff.setBuffType("debuff");
        buff.setImmuneNpcSampleJson("[{\"id\":-65,\"internalName\":\"BigHornetStingy\",\"name\":\"Hornet\"}]");
        buff.setStatus(1);

        when(buffMapper.selectById(20L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_buffs`"), eq(20))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npcs"), any(Object[].class))).thenReturn(List.of(Map.of(
            "id", 9001L,
            "sourceId", -65,
            "internalName", "BigHornetStingy",
            "name", "Hornet",
            "nameZh", "黄蜂",
            "imageUrl", CDN_NPC_IMAGE_URL
        )));

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        PublicBuffDetailDTO detail = service.getPublicBuffDetail(20L);

        assertNotNull(detail);
        assertEquals(1, detail.getImmuneNpcs().size());
        PublicBuffDetailDTO.FactSummary hornet = detail.getImmuneNpcs().get(0);
        assertEquals(9001L, hornet.getId());
        assertEquals(-65, hornet.getSourceId());
        assertEquals("黄蜂", hornet.getNameZh());
        assertEquals(CDN_NPC_IMAGE_URL, hornet.getImageUrl());
    }

    @Test
    void shouldLoadSourceItemImagesFromPreferredItemImageSql() {
        Buff buff = new Buff();
        buff.setId(39L);
        buff.setSourceId(39);
        buff.setInternalName("CursedInferno");
        buff.setEnglishName("Cursed Inferno");
        buff.setNameZh("诅咒狱火");
        buff.setBuffType("debuff");
        buff.setStatus(1);

        when(buffMapper.selectById(39L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(contains("FROM buff_source_items"), eq(39L))).thenReturn(List.of(Map.of(
            "id", 545L,
            "sourceId", 545,
            "internalName", "CursedArrow",
            "name", "Cursed Arrow",
            "nameZh", "诅咒箭",
            "imageUrl", CDN_ITEM_IMAGE_URL
        )));

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        PublicBuffDetailDTO detail = service.getPublicBuffDetail(39L);

        assertNotNull(detail);
        assertEquals(1, detail.getSourceItems().size());
        assertEquals(CDN_ITEM_IMAGE_URL, detail.getSourceItems().get(0).getImageUrl());
        verify(jdbcTemplate).queryForList(argThat(sql -> sql.contains("item_images ii")), eq(39L));
    }

    @Test
    void shouldMergeProjectionSourceItemFactsWhenLocalRowsArePartial() {
        Buff buff = new Buff();
        buff.setId(24L);
        buff.setSourceId(24);
        buff.setInternalName("OnFire");
        buff.setEnglishName("On Fire!");
        buff.setNameZh("着火了！");
        buff.setBuffType("debuff");
        buff.setStatus(1);

        when(buffMapper.selectById(24L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_buffs`"), eq(24))).thenReturn(List.of(Map.of(
            "source_items_json",
            """
            [
              {"itemId":1322,"internalName":"MagmaStone","name":"Magma Stone","sourceSection":"From player"},
              {"itemId":null,"internalName":"FlameburstTower","name":"Flameburst Tower","pageTitle":"Flameburst Tower","sourceSection":"From player"},
              {"itemId":null,"internalName":"Lava","name":"Lava","pageTitle":"Lava","sourceSection":"From environment"}
            ]
            """,
            "immune_npcs_json",
            "[]",
            "source_evidence_json",
            "{\"parseStatus\":\"parsed\"}"
        )));
        when(jdbcTemplate.queryForList(contains("FROM buff_source_items"), eq(24L))).thenReturn(List.of(Map.of(
            "id", 1322L,
            "sourceId", 1322,
            "internalName", "MagmaStone",
            "name", "Magma Stone",
            "imageUrl", CDN_ITEM_IMAGE_URL
        )));
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`npc_buff_relations`"), any(Object[].class))).thenReturn(List.of());

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        PublicBuffDetailDTO detail = service.getPublicBuffDetail(24L);

        assertNotNull(detail);
        assertEquals(3, detail.getSourceItems().size());
        assertEquals("MagmaStone", detail.getSourceItems().get(0).getInternalName());
        assertEquals("FlameburstTower", detail.getSourceItems().get(1).getInternalName());
        assertEquals("Lava", detail.getSourceItems().get(2).getInternalName());
        assertEquals("From environment", detail.getSourceItems().get(2).getSourceSection());
    }

    @Test
    void shouldNotFallbackToLocalSourceItemsWhenProjectionHasResolvedEmptyArray() {
        Buff buff = new Buff();
        buff.setId(46L);
        buff.setSourceId(46);
        buff.setInternalName("Chilled");
        buff.setEnglishName("Chilled");
        buff.setBuffType("debuff");
        buff.setSourceItemsJson("[{\"internalName\":\"Water\",\"name\":\"Water\"}]");
        buff.setStatus(1);

        when(buffMapper.selectById(46L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_buffs`"), eq(46))).thenReturn(List.of(Map.of(
            "source_item_count", 0,
            "immune_npc_count", 0,
            "source_items_json",
            "[]",
            "inflicting_npcs_json",
            "[]",
            "immune_npcs_json",
            "[]",
            "source_evidence_json",
            "{\"parseStatus\":\"parsed\"}"
        )));
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`item_buff_relations`"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`npc_buff_relations`"), any(Object[].class))).thenReturn(List.of());

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        PublicBuffDetailDTO detail = service.getPublicBuffDetail(46L);

        assertNotNull(detail);
        assertTrue(detail.getSourceItems().isEmpty());
        assertEquals(0, detail.getSourceItemCount());
    }

    @Test
    void shouldLoadResolvedSourceItemsFromRelationProjectionTables() {
        Buff buff = new Buff();
        buff.setId(21L);
        buff.setSourceId(21);
        buff.setInternalName("PotionSickness");
        buff.setEnglishName("Potion Sickness");
        buff.setBuffType("debuff");
        buff.setSourceItemCount(0);
        buff.setStatus(1);

        when(buffMapper.selectById(21L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_buffs`"), eq(21))).thenReturn(List.of(Map.of(
            "source_item_count", 12,
            "immune_npc_count", 0,
            "source_items_json",
            "[{\"sourceId\":5,\"internalName\":\"Mushroom\",\"name\":\"Mushroom\",\"sourceSection\":\"From item\"}]",
            "inflicting_npcs_json",
            "[]",
            "immune_npcs_json",
            "[]",
            "source_evidence_json",
            "{\"parseStatus\":\"parsed\"}"
        )));
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`item_buff_relations`"), any(Object[].class))).thenReturn(List.of(Map.of(
            "id", 5L,
            "sourceId", 5,
            "internalName", "Mushroom",
            "name", "Mushroom",
            "nameZh", "蘑菇",
            "imageUrl", CDN_ITEM_IMAGE_URL,
            "relationType", "buff_source_item",
            "sourceProvider", "terrapedia.generated",
            "sourcePage", "buffs.standardized"
        )));
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`npc_buff_relations`"), any(Object[].class))).thenReturn(List.of());

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        PublicBuffDetailDTO detail = service.getPublicBuffDetail(21L);

        assertNotNull(detail);
        assertEquals(12, detail.getSourceItemCount());
        assertEquals(1, detail.getSourceItems().size());
        PublicBuffDetailDTO.FactSummary mushroom = detail.getSourceItems().get(0);
        assertEquals(5, mushroom.getSourceId());
        assertEquals("Mushroom", mushroom.getInternalName());
        assertEquals(CDN_ITEM_IMAGE_URL, mushroom.getImageUrl());
        assertEquals("terrapedia.generated", mushroom.getSourceProvider());
        assertEquals("buffs.standardized", mushroom.getSourcePage());
        assertEquals("From item", mushroom.getSourceSection());
    }

    @Test
    void shouldEnrichRelationSourceItemImageFromLocalItemImagesWhenProjectionImageIsMissing() {
        Buff buff = new Buff();
        buff.setId(31L);
        buff.setSourceId(31);
        buff.setInternalName("Confused");
        buff.setEnglishName("Confused");
        buff.setBuffType("debuff");
        buff.setStatus(1);

        when(buffMapper.selectById(31L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_buffs`"), eq(31))).thenReturn(List.of(Map.of(
            "source_item_count", 1,
            "immune_npc_count", 0,
            "source_items_json",
            "[]",
            "inflicting_npcs_json",
            "[]",
            "immune_npcs_json",
            "[]",
            "source_evidence_json",
            "{\"parseStatus\":\"parsed\"}"
        )));
        when(jdbcTemplate.queryForList(argThat(sql -> sql != null
            && sql.contains("FROM `terria_v1_relation`.`item_buff_relations`")
            && sql.contains("LEFT JOIN items")
            && sql.contains("item_images ii")), any(Object[].class))).thenReturn(List.of(Map.of(
            "id", 3223L,
            "sourceId", 3223,
            "internalName", "BrainOfConfusion",
            "name", "Brain of Confusion",
            "nameZh", "混乱之脑",
            "imageUrl", CDN_ITEM_IMAGE_URL,
            "relationType", "buff_source_item",
            "sourceProvider", "terrapedia.generated",
            "sourcePage", "buffs.standardized"
        )));
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`npc_buff_relations`"), any(Object[].class))).thenReturn(List.of());

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        PublicBuffDetailDTO detail = service.getPublicBuffDetail(31L);

        assertNotNull(detail);
        assertEquals(1, detail.getSourceItems().size());
        PublicBuffDetailDTO.FactSummary brain = detail.getSourceItems().get(0);
        assertEquals("BrainOfConfusion", brain.getInternalName());
        assertEquals(CDN_ITEM_IMAGE_URL, brain.getImageUrl());
    }

    @Test
    void shouldEnrichRelationInflictingNpcImageFromLocalNpcWhenProjectionImageIsMissing() {
        Buff buff = new Buff();
        buff.setId(31L);
        buff.setSourceId(31);
        buff.setInternalName("Confused");
        buff.setEnglishName("Confused");
        buff.setBuffType("debuff");
        buff.setStatus(1);

        when(buffMapper.selectById(31L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_buffs`"), eq(31))).thenReturn(List.of(Map.of(
            "source_item_count", 0,
            "immune_npc_count", 0,
            "source_items_json",
            "[]",
            "inflicting_npcs_json",
            "[]",
            "immune_npcs_json",
            "[]",
            "source_evidence_json",
            "{\"parseStatus\":\"parsed\"}"
        )));
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`item_buff_relations`"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(argThat(sql -> sql != null
            && sql.contains("FROM `terria_v1_relation`.`npc_buff_relations`")
            && sql.contains("LEFT JOIN npcs")), any(Object[].class))).thenReturn(List.of(Map.of(
            "id", 93L,
            "sourceId", 93,
            "internalName", "GiantBat",
            "name", "Giant Bat",
            "imageUrl", CDN_NPC_IMAGE_URL,
            "relationType", "inflicts"
        )));

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        PublicBuffDetailDTO detail = service.getPublicBuffDetail(31L);

        assertNotNull(detail);
        assertEquals(1, detail.getInflictingNpcs().size());
        PublicBuffDetailDTO.FactSummary giantBat = detail.getInflictingNpcs().get(0);
        assertEquals("GiantBat", giantBat.getInternalName());
        assertEquals(CDN_NPC_IMAGE_URL, giantBat.getImageUrl());
    }

    @Test
    void shouldPreferLocalNpcIdForRelationInflictingNpcRoutes() {
        Buff buff = new Buff();
        buff.setId(31L);
        buff.setSourceId(31);
        buff.setInternalName("Confused");
        buff.setEnglishName("Confused");
        buff.setBuffType("debuff");
        buff.setStatus(1);

        when(buffMapper.selectById(31L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_buffs`"), eq(31))).thenReturn(List.of(Map.of(
            "source_item_count", 0,
            "immune_npc_count", 0,
            "source_items_json",
            "[]",
            "inflicting_npcs_json",
            "[]",
            "immune_npcs_json",
            "[]",
            "source_evidence_json",
            "{\"parseStatus\":\"parsed\"}"
        )));
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`item_buff_relations`"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(argThat(sql -> sql != null
            && sql.contains("FROM `terria_v1_relation`.`npc_buff_relations`")
            && sql.contains("LEFT JOIN npcs")), any(Object[].class))).thenReturn(List.of(Map.of(
            "id", 9100L,
            "sourceId", 454,
            "internalName", "CultistDragonHead",
            "name", "Phantasm Dragon",
            "nameZh", "幻影龙",
            "imageUrl", CDN_NPC_IMAGE_URL,
            "relationType", "inflicts"
        )));

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        PublicBuffDetailDTO detail = service.getPublicBuffDetail(31L);

        assertNotNull(detail);
        assertEquals(1, detail.getInflictingNpcs().size());
        PublicBuffDetailDTO.FactSummary phantasmDragon = detail.getInflictingNpcs().get(0);
        assertEquals(9100L, phantasmDragon.getId());
        assertEquals(454, phantasmDragon.getSourceId());
        assertEquals("CultistDragonHead", phantasmDragon.getInternalName());
        verify(jdbcTemplate).queryForList(argThat(sql -> sql != null
            && sql.contains("FROM `terria_v1_relation`.`npc_buff_relations`")
            && sql.contains("ln.id AS id")
            && sql.contains("COALESCE(ln.image_url, pn.image_url) AS imageUrl")
            && !sql.contains("COALESCE(pn.id, ln.id) AS id")
            && !sql.contains("COALESCE(ln.id, pn.id) AS id")
            && !sql.contains("nbr.npc_source_id IS NULL\n                          AND nbr.npc_internal_name IS NOT NULL")), any(Object[].class));
    }

    @Test
    void shouldEnrichImmuneNpcEvidenceByDisplayNameWhenInternalNameIsWikiAlias() {
        Buff buff = new Buff();
        buff.setId(39L);
        buff.setSourceId(39);
        buff.setInternalName("CursedInferno");
        buff.setEnglishName("Cursed Inferno");
        buff.setNameZh("诅咒狱火");
        buff.setBuffType("debuff");
        buff.setImmuneNpcCount(26);
        buff.setStatus(1);

        when(buffMapper.selectById(39L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_buffs`"), eq(39))).thenReturn(List.of(Map.of(
            "immune_npcs_json",
            "[{\"internalName\":\"BubbleShield\",\"name\":\"Bubble Shield\",\"pageTitle\":\"Bubble Shield\"}]"
        )));
        when(jdbcTemplate.queryForList(contains("FROM npcs"), any(Object[].class))).thenReturn(List.of(Map.of(
            "id", 384L,
            "sourceId", 384,
            "internalName", "ForceBubble",
            "name", "Bubble Shield",
            "imageUrl", CDN_NPC_IMAGE_URL
        )));

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        PublicBuffDetailDTO detail = service.getPublicBuffDetail(39L);

        assertNotNull(detail);
        assertEquals(1, detail.getImmuneNpcs().size());
        PublicBuffDetailDTO.FactSummary bubbleShield = detail.getImmuneNpcs().get(0);
        assertEquals(384L, bubbleShield.getId());
        assertEquals(384, bubbleShield.getSourceId());
        assertEquals("ForceBubble", bubbleShield.getInternalName());
        assertEquals(CDN_NPC_IMAGE_URL, bubbleShield.getImageUrl());
    }

    @Test
    void shouldUseLocalManagedNpcImageWhenFactImageIsRawWikiUrl() {
        Buff buff = new Buff();
        buff.setId(323L);
        buff.setSourceId(323);
        buff.setInternalName("OnFire3");
        buff.setEnglishName("Hellfire");
        buff.setNameZh("狱炎");
        buff.setBuffType("debuff");
        buff.setStatus(1);

        when(buffMapper.selectById(323L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_buffs`"), eq(323))).thenReturn(List.of(Map.of(
            "immune_npcs_json",
            "[{\"internalName\":\"AncientVision\",\"name\":\"Ancient Vision\",\"pageTitle\":\"Ancient Vision\",\"imageUrl\":\"https://terraria.wiki.gg/images/Ancient_Vision.png\"}]"
        )));
        when(jdbcTemplate.queryForList(contains("FROM npcs"), any(Object[].class))).thenReturn(List.of(Map.of(
            "id", 999L,
            "sourceId", 522,
            "internalName", "AncientCultistSquidhead",
            "name", "Ancient Vision",
            "imageUrl", CDN_NPC_IMAGE_URL
        )));

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        PublicBuffDetailDTO detail = service.getPublicBuffDetail(323L);

        assertNotNull(detail);
        PublicBuffDetailDTO.FactSummary ancientVision = detail.getImmuneNpcs().get(0);
        assertEquals("AncientCultistSquidhead", ancientVision.getInternalName());
        assertEquals(CDN_NPC_IMAGE_URL, ancientVision.getImageUrl());
    }

    @Test
    void shouldLoadSourceItemsAndInflictingNpcsFromRelationProjectionFallbacks() {
        Buff buff = new Buff();
        buff.setId(90039L);
        buff.setSourceId(39);
        buff.setInternalName("CursedInferno");
        buff.setEnglishName("Cursed Inferno");
        buff.setNameZh("诅咒狱火");
        buff.setBuffType("debuff");
        buff.setStatus(1);

        when(buffMapper.selectById(90039L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_buffs`"), eq(39))).thenReturn(List.of(Map.of(
            "source_items_json",
            "[{\"sourceId\":47,\"internalName\":\"CursedArrow\",\"name\":\"Cursed Arrow\",\"imageUrl\":\"https://cdn.example.com/terrapedia-images/items/wiki/cursed-arrow.png\"}]",
            "immune_npcs_json",
            "[]",
            "source_evidence_json",
            "{\"parseStatus\":\"parsed\"}"
        )));
        when(jdbcTemplate.queryForList(contains("FROM buff_source_items"), eq(90039L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`npc_buff_relations`"), any(Object[].class))).thenReturn(List.of(Map.of(
            "id", 101L,
            "sourceId", 214,
            "internalName", "Clinger",
            "name", "Clinger",
            "nameZh", "爬藤怪",
            "imageUrl", CDN_NPC_IMAGE_URL,
            "relationType", "inflicts"
        )));

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        PublicBuffDetailDTO detail = service.getPublicBuffDetail(90039L);

        assertNotNull(detail);
        assertEquals(1, detail.getSourceItems().size());
        assertEquals("CursedArrow", detail.getSourceItems().get(0).getInternalName());
        assertEquals(1, detail.getInflictingNpcs().size());
        assertEquals("Clinger", detail.getInflictingNpcs().get(0).getInternalName());
    }

    @Test
    void shouldExposeProjectionInflictingNpcFactsWhenRelationRowsAreUnresolved() {
        Buff buff = new Buff();
        buff.setId(48L);
        buff.setSourceId(48);
        buff.setInternalName("Honey");
        buff.setEnglishName("Honey");
        buff.setBuffType("buff");
        buff.setStatus(1);

        when(buffMapper.selectById(48L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_buffs`"), eq(48))).thenReturn(List.of(Map.of(
            "source_items_json",
            "[]",
            "inflicting_npcs_json",
            "[{\"internalName\":\"HoneySlime\",\"name\":\"Honey Slime\",\"pageTitle\":\"Honey Slime\",\"sourceSection\":\"From enemy\"}]",
            "immune_npcs_json",
            "[]",
            "source_evidence_json",
            "{\"parseStatus\":\"parsed\"}"
        )));
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`npc_buff_relations`"), any(Object[].class))).thenReturn(List.of());

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        PublicBuffDetailDTO detail = service.getPublicBuffDetail(48L);

        assertNotNull(detail);
        assertEquals(1, detail.getInflictingNpcs().size());
        PublicBuffDetailDTO.FactSummary honeySlime = detail.getInflictingNpcs().get(0);
        assertEquals("HoneySlime", honeySlime.getInternalName());
        assertEquals("Honey Slime", honeySlime.getName());
        assertEquals("From enemy", honeySlime.getSourceSection());
        assertEquals(null, honeySlime.getImageUrl());
        assertEquals(1, detail.getInflictingNpcCount());
    }

    @Test
    void shouldParseSnakeCaseProjectionNpcFactsBeforeEnrichment() {
        Buff buff = new Buff();
        buff.setId(48L);
        buff.setSourceId(48);
        buff.setInternalName("Honey");
        buff.setEnglishName("Honey");
        buff.setBuffType("buff");
        buff.setStatus(1);

        when(buffMapper.selectById(48L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_buffs`"), eq(48))).thenReturn(List.of(Map.of(
            "source_items_json",
            "[]",
            "inflicting_npcs_json",
            "[{\"npc_id\":122,\"npc_internal_name\":\"HoneySlime\",\"npc_name\":\"Honey Slime\",\"npc_name_zh\":\"蜂蜜史莱姆\",\"npc_image_url\":\"https://cdn.example.com/terrapedia-images/npcs/wiki/honey-slime.gif\",\"source_section\":\"From NPCs\"}]",
            "immune_npcs_json",
            "[]",
            "source_evidence_json",
            "{\"parseStatus\":\"parsed\"}"
        )));
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`npc_buff_relations`"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npcs"), any(Object[].class))).thenReturn(List.of());

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        PublicBuffDetailDTO detail = service.getPublicBuffDetail(48L);

        assertNotNull(detail);
        assertEquals(1, detail.getInflictingNpcs().size());
        PublicBuffDetailDTO.FactSummary honeySlime = detail.getInflictingNpcs().get(0);
        assertEquals(null, honeySlime.getId());
        assertEquals(122, honeySlime.getSourceId());
        assertEquals("HoneySlime", honeySlime.getInternalName());
        assertEquals("Honey Slime", honeySlime.getName());
        assertEquals("蜂蜜史莱姆", honeySlime.getNameZh());
        assertEquals("https://cdn.example.com/terrapedia-images/npcs/wiki/honey-slime.gif", honeySlime.getImageUrl());
        assertEquals("From NPCs", honeySlime.getSourceSection());
    }

    @Test
    void shouldNotTreatBareProjectionNpcIdAsSourceIdForEnrichment() {
        Buff buff = new Buff();
        buff.setId(48L);
        buff.setSourceId(48);
        buff.setInternalName("Honey");
        buff.setEnglishName("Honey");
        buff.setBuffType("buff");
        buff.setStatus(1);

        when(buffMapper.selectById(48L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_buffs`"), eq(48))).thenReturn(List.of(Map.of(
            "source_items_json",
            "[]",
            "inflicting_npcs_json",
            "[{\"id\":9100,\"internalName\":\"HoneySlime\",\"name\":\"Honey Slime\",\"pageTitle\":\"Honey Slime\"}]",
            "immune_npcs_json",
            "[]",
            "source_evidence_json",
            "{\"parseStatus\":\"parsed\"}"
        )));
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`npc_buff_relations`"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npcs"), any(Object[].class))).thenReturn(List.of());

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        PublicBuffDetailDTO detail = service.getPublicBuffDetail(48L);

        assertNotNull(detail);
        assertEquals(1, detail.getInflictingNpcs().size());
        PublicBuffDetailDTO.FactSummary honeySlime = detail.getInflictingNpcs().get(0);
        assertEquals(null, honeySlime.getId());
        assertEquals(null, honeySlime.getSourceId());
        assertEquals("HoneySlime", honeySlime.getInternalName());
        verify(jdbcTemplate).queryForList(argThat(sql -> sql != null
            && sql.contains("FROM npcs")
            && !sql.contains("n.source_id IN (?)")
            && !sql.contains("n.game_id IN (?)")), any(Object[].class));
    }

    @Test
    void shouldKeepProjectionInflictingNpcsWhenSourceEvidenceColumnIsMissing() {
        Buff buff = new Buff();
        buff.setId(48L);
        buff.setSourceId(48);
        buff.setInternalName("Honey");
        buff.setEnglishName("Honey");
        buff.setBuffType("buff");
        buff.setStatus(1);

        when(buffMapper.selectById(48L)).thenReturn(buff);
        doThrow(new org.springframework.jdbc.BadSqlGrammarException("query", "SELECT source_evidence_json", new java.sql.SQLException("Unknown column source_evidence_json")))
            .when(jdbcTemplate).queryForList(argThat(sql -> sql != null && sql.contains("source_items_json, inflicting_npcs_json")), eq(48));
        when(jdbcTemplate.queryForList(argThat(sql -> sql != null && sql.contains("inflicting_npcs_json") && !sql.contains("source_items_json") && !sql.contains("source_evidence_json")), eq(48))).thenReturn(List.of(Map.of(
            "inflicting_npcs_json",
            "[{\"internalName\":\"HoneySlime\",\"name\":\"Honey Slime\",\"pageTitle\":\"Honey Slime\",\"sourceSection\":\"From enemy\"}]"
        )));
        when(jdbcTemplate.queryForList(argThat(sql -> sql != null && sql.contains("source_items_json") && !sql.contains("inflicting_npcs_json") && !sql.contains("source_evidence_json")), eq(48))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(argThat(sql -> sql != null && sql.contains("immune_npcs_json") && !sql.contains("source_evidence_json")), eq(48))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`npc_buff_relations`"), any(Object[].class))).thenReturn(List.of());

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        PublicBuffDetailDTO detail = service.getPublicBuffDetail(48L);

        assertNotNull(detail);
        assertEquals(1, detail.getInflictingNpcs().size());
        assertEquals("HoneySlime", detail.getInflictingNpcs().get(0).getInternalName());
        assertEquals(1, detail.getInflictingNpcCount());
    }

    @Test
    void shouldKeepProjectionSourceItemsWhenSourceEvidenceColumnIsMissing() {
        Buff buff = new Buff();
        buff.setId(90039L);
        buff.setSourceId(39);
        buff.setInternalName("CursedInferno");
        buff.setEnglishName("Cursed Inferno");
        buff.setNameZh("诅咒狱火");
        buff.setBuffType("debuff");
        buff.setStatus(1);

        when(buffMapper.selectById(90039L)).thenReturn(buff);
        doThrow(new org.springframework.jdbc.BadSqlGrammarException("query", "SELECT source_evidence_json", new java.sql.SQLException("Unknown column source_evidence_json")))
            .when(jdbcTemplate).queryForList(argThat(sql -> sql != null && sql.contains("source_evidence_json")), eq(39));
        when(jdbcTemplate.queryForList(argThat(sql -> sql != null && sql.contains("source_items_json") && !sql.contains("source_evidence_json")), eq(39))).thenReturn(List.of(Map.of(
            "source_items_json",
            "[{\"sourceId\":545,\"internalName\":\"CursedArrow\",\"name\":\"Cursed Arrow\",\"imageUrl\":\"https://cdn.example.com/terrapedia-images/items/wiki/cursed-arrow.png\"}]"
        )));
        when(jdbcTemplate.queryForList(argThat(sql -> sql != null && sql.contains("immune_npcs_json") && !sql.contains("source_evidence_json")), eq(39))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM buff_source_items"), eq(90039L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`npc_buff_relations`"), any(Object[].class))).thenReturn(List.of());

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        PublicBuffDetailDTO detail = service.getPublicBuffDetail(90039L);

        assertNotNull(detail);
        assertEquals(1, detail.getSourceItems().size());
        assertEquals("CursedArrow", detail.getSourceItems().get(0).getInternalName());
        assertEquals(545, detail.getSourceItems().get(0).getSourceId());
        assertEquals(null, detail.getSourceItems().get(0).getId());
    }

    @Test
    void shouldExpandAmbiguousDisplayNameToLocalNpcCandidatesInsteadOfPickingOne() {
        Buff buff = new Buff();
        buff.setId(39L);
        buff.setSourceId(39);
        buff.setInternalName("CursedInferno");
        buff.setEnglishName("Cursed Inferno");
        buff.setNameZh("诅咒狱火");
        buff.setBuffType("debuff");
        buff.setStatus(1);

        when(buffMapper.selectById(39L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_buffs`"), eq(39))).thenReturn(List.of(Map.of(
            "immune_npcs_json",
            "[{\"internalName\":\"WikiOnlyHornetAlias\",\"name\":\"Hornet\",\"pageTitle\":\"Hornet\"}]"
        )));
        when(jdbcTemplate.queryForList(contains("FROM npcs"), any(Object[].class))).thenReturn(List.of(
            Map.of(
                "id", 901L,
                "sourceId", -65,
                "internalName", "BigHornetStingy",
                "name", "Hornet",
                "imageUrl", CDN_NPC_IMAGE_URL
            ),
            Map.of(
                "id", 902L,
                "sourceId", -63,
                "internalName", "LittleHornetStingy",
                "name", "Hornet",
                "imageUrl", CDN_NPC_IMAGE_URL
            )
        ));

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        PublicBuffDetailDTO detail = service.getPublicBuffDetail(39L);

        assertNotNull(detail);
        assertEquals(2, detail.getImmuneNpcs().size());
        PublicBuffDetailDTO.FactSummary bigHornet = detail.getImmuneNpcs().get(0);
        PublicBuffDetailDTO.FactSummary littleHornet = detail.getImmuneNpcs().get(1);
        assertEquals(901L, bigHornet.getId());
        assertEquals(-65, bigHornet.getSourceId());
        assertEquals("BigHornetStingy", bigHornet.getInternalName());
        assertEquals(CDN_NPC_IMAGE_URL, bigHornet.getImageUrl());
        assertEquals(902L, littleHornet.getId());
        assertEquals(-63, littleHornet.getSourceId());
        assertEquals("LittleHornetStingy", littleHornet.getInternalName());
        assertEquals(CDN_NPC_IMAGE_URL, littleHornet.getImageUrl());
    }

    @Test
    void shouldEnrichMultipartNpcEvidenceWithPublicRepresentativeWhenDisplayNameHasSegments() {
        Buff buff = new Buff();
        buff.setId(31L);
        buff.setSourceId(31);
        buff.setInternalName("Confused");
        buff.setEnglishName("Confused");
        buff.setBuffType("debuff");
        buff.setStatus(1);

        when(buffMapper.selectById(31L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_buffs`"), eq(31))).thenReturn(List.of(Map.of(
            "source_items_json",
            "[]",
            "inflicting_npcs_json",
            "[]",
            "immune_npcs_json",
            "[{\"internalName\":\"PhantasmDragon\",\"name\":\"Phantasm Dragon\",\"pageTitle\":\"Phantasm Dragon\"}]",
            "source_evidence_json",
            "{\"parseStatus\":\"parsed\"}"
        )));
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`item_buff_relations`"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`npc_buff_relations`"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npcs"), any(Object[].class))).thenReturn(List.of(
            Map.of(
                "id", 454L,
                "sourceId", 454,
                "rawSourceId", 454,
                "gameId", 454,
                "internalName", "CultistDragonHead",
                "name", "Phantasm Dragon",
                "imageUrl", CDN_NPC_IMAGE_URL
            ),
            Map.of(
                "id", 455L,
                "sourceId", 455,
                "rawSourceId", 455,
                "gameId", 455,
                "internalName", "CultistDragonBody1",
                "name", "Phantasm Dragon",
                "imageUrl", "https://cdn.example.com/terrapedia-images/npcs/wiki/ab/dragon-body.png"
            ),
            Map.of(
                "id", 459L,
                "sourceId", 459,
                "rawSourceId", 459,
                "gameId", 459,
                "internalName", "CultistDragonTail",
                "name", "Phantasm Dragon",
                "imageUrl", "https://cdn.example.com/terrapedia-images/npcs/wiki/ab/dragon-tail.png"
            )
        ));

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        PublicBuffDetailDTO detail = service.getPublicBuffDetail(31L);

        assertNotNull(detail);
        assertEquals(1, detail.getImmuneNpcs().size());
        PublicBuffDetailDTO.FactSummary phantasmDragon = detail.getImmuneNpcs().get(0);
        assertEquals(454L, phantasmDragon.getId());
        assertEquals(454, phantasmDragon.getSourceId());
        assertEquals("CultistDragonHead", phantasmDragon.getInternalName());
        assertEquals(CDN_NPC_IMAGE_URL, phantasmDragon.getImageUrl());
    }

    @Test
    void shouldEnrichNpcEvidenceByNormalizedInternalNameWhenWikiCasingDiffers() {
        Buff buff = new Buff();
        buff.setId(31L);
        buff.setSourceId(31);
        buff.setInternalName("Confused");
        buff.setEnglishName("Confused");
        buff.setBuffType("debuff");
        buff.setStatus(1);

        when(buffMapper.selectById(31L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_buffs`"), eq(31))).thenReturn(List.of(Map.of(
            "source_items_json",
            "[]",
            "inflicting_npcs_json",
            "[]",
            "immune_npcs_json",
            "[{\"internalName\":\"WallOfFlesh\",\"name\":\"Wall of Flesh\",\"pageTitle\":\"Wall of Flesh\"}]",
            "source_evidence_json",
            "{\"parseStatus\":\"parsed\"}"
        )));
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`item_buff_relations`"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`npc_buff_relations`"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npcs"), any(Object[].class))).thenReturn(List.of(
            Map.of(
                "id", 113L,
                "sourceId", 113,
                "rawSourceId", 113,
                "gameId", 113,
                "internalName", "WallofFlesh",
                "name", "Wall of Flesh",
                "imageUrl", CDN_NPC_IMAGE_URL
            ),
            Map.of(
                "id", 114L,
                "sourceId", 114,
                "rawSourceId", 114,
                "gameId", 114,
                "internalName", "WallofFleshEye",
                "name", "Wall of Flesh",
                "imageUrl", "https://cdn.example.com/terrapedia-images/npcs/wiki/ab/wall-eye.png"
            )
        ));

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        PublicBuffDetailDTO detail = service.getPublicBuffDetail(31L);

        assertNotNull(detail);
        assertEquals(2, detail.getImmuneNpcs().size());
        PublicBuffDetailDTO.FactSummary wallOfFlesh = detail.getImmuneNpcs().get(0);
        PublicBuffDetailDTO.FactSummary wallOfFleshEye = detail.getImmuneNpcs().get(1);
        assertEquals(113L, wallOfFlesh.getId());
        assertEquals(113, wallOfFlesh.getSourceId());
        assertEquals("WallofFlesh", wallOfFlesh.getInternalName());
        assertEquals(CDN_NPC_IMAGE_URL, wallOfFlesh.getImageUrl());
        assertEquals(114L, wallOfFleshEye.getId());
        assertEquals(114, wallOfFleshEye.getSourceId());
        assertEquals("WallofFleshEye", wallOfFleshEye.getInternalName());
        assertEquals("https://cdn.example.com/terrapedia-images/npcs/wiki/ab/wall-eye.png", wallOfFleshEye.getImageUrl());
    }

    @Test
    void shouldExpandSamePageNpcFactToAllLocalVariantsWhenNoSingleRepresentativeExists() {
        Buff buff = new Buff();
        buff.setId(31L);
        buff.setSourceId(31);
        buff.setInternalName("Confused");
        buff.setEnglishName("Confused");
        buff.setBuffType("debuff");
        buff.setStatus(1);

        when(buffMapper.selectById(31L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_buffs`"), eq(31))).thenReturn(List.of(Map.of(
            "source_items_json",
            "[]",
            "inflicting_npcs_json",
            "[]",
            "immune_npcs_json",
            "[{\"internalName\":\"Ogre\",\"name\":\"Ogre\",\"pageTitle\":\"Ogre\"}]",
            "source_evidence_json",
            "{\"parseStatus\":\"parsed\"}"
        )));
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`item_buff_relations`"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`npc_buff_relations`"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npcs"), any(Object[].class))).thenReturn(List.of(
            Map.of(
                "id", 576L,
                "sourceId", 576,
                "rawSourceId", 576,
                "gameId", 576,
                "internalName", "DD2OgreT2",
                "name", "Ogre",
                "imageUrl", CDN_NPC_IMAGE_URL
            ),
            Map.of(
                "id", 577L,
                "sourceId", 577,
                "rawSourceId", 577,
                "gameId", 577,
                "internalName", "DD2OgreT3",
                "name", "Ogre",
                "imageUrl", "https://cdn.example.com/terrapedia-images/npcs/wiki/ab/ogre-t3.png"
            )
        ));

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        PublicBuffDetailDTO detail = service.getPublicBuffDetail(31L);

        assertNotNull(detail);
        assertEquals(2, detail.getImmuneNpcs().size());
        assertEquals(576L, detail.getImmuneNpcs().get(0).getId());
        assertEquals("DD2OgreT2", detail.getImmuneNpcs().get(0).getInternalName());
        assertEquals(CDN_NPC_IMAGE_URL, detail.getImmuneNpcs().get(0).getImageUrl());
        assertEquals(577L, detail.getImmuneNpcs().get(1).getId());
        assertEquals("DD2OgreT3", detail.getImmuneNpcs().get(1).getInternalName());
        assertEquals("https://cdn.example.com/terrapedia-images/npcs/wiki/ab/ogre-t3.png", detail.getImmuneNpcs().get(1).getImageUrl());
    }

    @Test
    void shouldOnlyEnrichNpcFactsWithPublicNpcRows() {
        Buff buff = new Buff();
        buff.setId(31L);
        buff.setSourceId(31);
        buff.setInternalName("Confused");
        buff.setEnglishName("Confused");
        buff.setBuffType("debuff");
        buff.setStatus(1);

        when(buffMapper.selectById(31L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_buffs`"), eq(31))).thenReturn(List.of(Map.of(
            "source_items_json",
            "[]",
            "inflicting_npcs_json",
            "[]",
            "immune_npcs_json",
            "[{\"internalName\":\"RetiredNpc\",\"name\":\"Retired NPC\",\"pageTitle\":\"Retired NPC\"}]",
            "source_evidence_json",
            "{\"parseStatus\":\"parsed\"}"
        )));
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`item_buff_relations`"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`npc_buff_relations`"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npcs"), any(Object[].class))).thenReturn(List.of());

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        PublicBuffDetailDTO detail = service.getPublicBuffDetail(31L);

        assertNotNull(detail);
        assertEquals(1, detail.getImmuneNpcs().size());
        PublicBuffDetailDTO.FactSummary retired = detail.getImmuneNpcs().get(0);
        assertEquals(null, retired.getId());
        assertEquals(null, retired.getImageUrl());
        verify(jdbcTemplate).queryForList(argThat(sql -> sql != null
            && sql.contains("FROM npcs")
            && sql.contains("(n.status = 1 OR n.status IS NULL)")), any(Object[].class));
    }

    @Test
    void shouldExpandSamePageNpcFactWhenWikiInternalAliasMatchesOneVariant() {
        Buff buff = new Buff();
        buff.setId(31L);
        buff.setSourceId(31);
        buff.setInternalName("Confused");
        buff.setEnglishName("Confused");
        buff.setBuffType("debuff");
        buff.setStatus(1);

        when(buffMapper.selectById(31L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_buffs`"), eq(31))).thenReturn(List.of(Map.of(
            "source_items_json",
            "[]",
            "inflicting_npcs_json",
            "[]",
            "immune_npcs_json",
            "[{\"internalName\":\"DD2OgreT2\",\"name\":\"Ogre\",\"pageTitle\":\"Ogre\"}]",
            "source_evidence_json",
            "{\"parseStatus\":\"parsed\"}"
        )));
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`item_buff_relations`"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`npc_buff_relations`"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npcs"), any(Object[].class))).thenReturn(List.of(
            Map.of(
                "id", 576L,
                "sourceId", 576,
                "rawSourceId", 576,
                "gameId", 576,
                "internalName", "DD2OgreT2",
                "name", "Ogre",
                "imageUrl", CDN_NPC_IMAGE_URL
            ),
            Map.of(
                "id", 577L,
                "sourceId", 577,
                "rawSourceId", 577,
                "gameId", 577,
                "internalName", "DD2OgreT3",
                "name", "Ogre",
                "imageUrl", "https://cdn.example.com/terrapedia-images/npcs/wiki/ab/ogre-t3.png"
            )
        ));

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        PublicBuffDetailDTO detail = service.getPublicBuffDetail(31L);

        assertNotNull(detail);
        assertEquals(2, detail.getImmuneNpcs().size());
        assertEquals(576L, detail.getImmuneNpcs().get(0).getId());
        assertEquals(577L, detail.getImmuneNpcs().get(1).getId());
    }

    @Test
    void shouldPreferExactNpcIdentityOverSamePageExpansion() {
        Buff buff = new Buff();
        buff.setId(31L);
        buff.setSourceId(31);
        buff.setInternalName("Confused");
        buff.setEnglishName("Confused");
        buff.setBuffType("debuff");
        buff.setStatus(1);

        when(buffMapper.selectById(31L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_buffs`"), eq(31))).thenReturn(List.of(Map.of(
            "source_items_json",
            "[]",
            "inflicting_npcs_json",
            "[]",
            "immune_npcs_json",
            "[{\"sourceId\":576,\"internalName\":\"DD2OgreT2\",\"name\":\"Ogre\",\"pageTitle\":\"Ogre\"}]",
            "source_evidence_json",
            "{\"parseStatus\":\"parsed\"}"
        )));
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`item_buff_relations`"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`npc_buff_relations`"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("FROM npcs"), any(Object[].class))).thenReturn(List.of(
            Map.of(
                "id", 576L,
                "sourceId", 576,
                "rawSourceId", 576,
                "gameId", 576,
                "internalName", "DD2OgreT2",
                "name", "Ogre",
                "imageUrl", CDN_NPC_IMAGE_URL
            ),
            Map.of(
                "id", 577L,
                "sourceId", 577,
                "rawSourceId", 577,
                "gameId", 577,
                "internalName", "DD2OgreT3",
                "name", "Ogre",
                "imageUrl", "https://cdn.example.com/terrapedia-images/npcs/wiki/ab/ogre-t3.png"
            )
        ));

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy(), jdbcTemplate, new ObjectMapper());
        PublicBuffDetailDTO detail = service.getPublicBuffDetail(31L);

        assertNotNull(detail);
        assertEquals(1, detail.getImmuneNpcs().size());
        PublicBuffDetailDTO.FactSummary ogre = detail.getImmuneNpcs().get(0);
        assertEquals(576L, ogre.getId());
        assertEquals(576, ogre.getSourceId());
        assertEquals("DD2OgreT2", ogre.getInternalName());
        assertEquals(CDN_NPC_IMAGE_URL, ogre.getImageUrl());
        assertEquals(1, detail.getImmuneNpcCount());
    }

    private ManagedImageUrlPolicy managedImageUrlPolicy() {
        return new ManagedImageUrlPolicy() {
            @Override
            public boolean isManagedImageUrl(String value) {
                return value != null && value.startsWith("https://cdn.example.com/terrapedia-images/");
            }

            @Override
            public List<String> trustedManagedImageUrlPrefixes() {
                return List.of(
                    "https://cdn.example.com/terrapedia-images/buffs/",
                    "https://cdn.example.com/terrapedia-images/npcs/",
                    "https://cdn.example.com/terrapedia-images/items/"
                );
            }
        };
    }
}

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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_buffs`"), eq(39L))).thenReturn(List.of(Map.of(
            "immune_npcs_json",
            "[{\"sourceId\":68,\"internalName\":\"DungeonGuardian\",\"name\":\"Dungeon Guardian\"},{\"sourceId\":101,\"internalName\":\"Clinger\",\"name\":\"Clinger\"}]"
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
        assertEquals(25, detail.getImmuneNpcCount());
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
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_buffs`"), eq(20L))).thenReturn(List.of());
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
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_buffs`"), eq(39L))).thenReturn(List.of(Map.of(
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

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
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PublicBuffServiceImplTest {

    private static final String CDN_BUFF_IMAGE_URL = "https://cdn.example.com/terrapedia-images/buffs/wiki/ab/sharpened.png";

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

    private ManagedImageUrlPolicy managedImageUrlPolicy() {
        return new ManagedImageUrlPolicy() {
            @Override
            public boolean isManagedImageUrl(String value) {
                return value != null && value.startsWith("https://cdn.example.com/terrapedia-images/");
            }

            @Override
            public List<String> trustedManagedImageUrlPrefixes() {
                return List.of("https://cdn.example.com/terrapedia-images/buffs/");
            }
        };
    }
}

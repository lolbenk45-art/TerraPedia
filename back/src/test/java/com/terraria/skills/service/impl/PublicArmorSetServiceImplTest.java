package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.PublicArmorSetListDTO;
import com.terraria.skills.dto.PublicArmorSetQuery;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static java.util.Map.entry;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isA;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PublicArmorSetServiceImplTest {

    private static final String MANAGED_ITEM_IMAGE =
        "http://localhost:9000/terrapedia-images/items/wiki/item-images/cc/beetle-helmet.png";

    @Mock
    private JdbcTemplate jdbcTemplate;

    @Mock
    private ManagedImageUrlPolicy managedImageUrlPolicy;

    @Test
    void shouldExposeManagedItemFallbackImagesWhenArmorSetImagesAreMissing() {
        when(managedImageUrlPolicy.isManagedImageUrl(MANAGED_ITEM_IMAGE)).thenReturn(true);
        when(jdbcTemplate.queryForObject(contains("SELECT COUNT(*)"), eq(Long.class), any(Object[].class))).thenReturn(1L);
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_armor_sets`"), isA(Integer.class), isA(Integer.class))).thenReturn(List.of(Map.ofEntries(
            entry("id", 158677909L),
            entry("text_key", "ArmorSetBonus.BeetleDamage"),
            entry("source_key", "ArmorSetBonus.BeetleDamage"),
            entry("name", "ArmorSetBonus.BeetleDamage"),
            entry("name_zh", "ArmorSetBonus.BeetleDamage"),
            entry("name_en", "ArmorSetBonus.BeetleDamage"),
            entry("primary_part", "head"),
            entry("set_count", 1),
            entry("unique_item_count", 3),
            entry("male_images", ""),
            entry("female_images", ""),
            entry("special_images", ""),
            entry("related_items_json", "[{\"id\":2199,\"itemId\":2199,\"sourceId\":2199,\"internalName\":\"BeetleHelmet\"}]")
        )));
        when(jdbcTemplate.queryForList(contains("FROM item_images"), isA(Long.class))).thenReturn(List.of(Map.of(
            "item_id", 2199L,
            "cached_url", MANAGED_ITEM_IMAGE
        )));

        PublicArmorSetServiceImpl service = new PublicArmorSetServiceImpl(jdbcTemplate, new ObjectMapper(), managedImageUrlPolicy);
        Page<PublicArmorSetListDTO> result = service.getPublicArmorSets(new PublicArmorSetQuery());

        assertEquals(1, result.getRecords().size());
        PublicArmorSetListDTO armorSet = result.getRecords().get(0);
        assertEquals(List.of(), armorSet.getMaleImages());
        assertEquals(List.of(), armorSet.getFemaleImages());
        assertEquals(List.of(), armorSet.getSpecialImages());
        assertEquals(List.of(MANAGED_ITEM_IMAGE), armorSet.getFallbackImages());
    }
}

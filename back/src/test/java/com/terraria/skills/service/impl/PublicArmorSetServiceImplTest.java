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

import java.math.BigDecimal;
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
            entry("benefit_zh", "套装奖励：+20% 移动速度"),
            entry("benefit_en", "Set bonus: +20% movement speed"),
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
        when(jdbcTemplate.queryForList(contains("projection_equipment_effect_attributes"), isA(Long.class))).thenReturn(List.of(Map.ofEntries(
            entry("owner_id", 158677909L),
            entry("stat_key", "move_speed"),
            entry("stat_label_zh", "移动速度"),
            entry("class_scope", "all"),
            entry("operation", "add"),
            entry("value_decimal", BigDecimal.valueOf(20)),
            entry("unit", "percent"),
            entry("apply_scope", "set_bonus"),
            entry("raw_text", "套装奖励：+20% 移动速度"),
            entry("parse_status", "parsed")
        )));

        PublicArmorSetServiceImpl service = new PublicArmorSetServiceImpl(jdbcTemplate, new ObjectMapper(), managedImageUrlPolicy);
        Page<PublicArmorSetListDTO> result = service.getPublicArmorSets(new PublicArmorSetQuery());

        assertEquals(1, result.getRecords().size());
        PublicArmorSetListDTO armorSet = result.getRecords().get(0);
        assertEquals(List.of(), armorSet.getMaleImages());
        assertEquals(List.of(), armorSet.getFemaleImages());
        assertEquals(List.of(), armorSet.getSpecialImages());
        assertEquals(List.of(MANAGED_ITEM_IMAGE), armorSet.getFallbackImages());
        assertEquals("套装奖励：+20% 移动速度", armorSet.getBenefitZh());
        assertEquals("Set bonus: +20% movement speed", armorSet.getBenefitEn());
        assertEquals(1, armorSet.getEffects().size());
        assertEquals("move_speed", armorSet.getEffects().get(0).getStatKey());
        assertEquals(BigDecimal.valueOf(20), armorSet.getEffects().get(0).getValueDecimal());
    }

    @Test
    void shouldExposeArmorSetDetailByIdWithFallbackImagesAndEffects() {
        when(managedImageUrlPolicy.isManagedImageUrl(MANAGED_ITEM_IMAGE)).thenReturn(true);
        when(jdbcTemplate.queryForList(contains("FROM `terria_v1_relation`.`projection_armor_sets`"), isA(Long.class))).thenReturn(List.of(Map.ofEntries(
            entry("id", 158677909L),
            entry("text_key", "ArmorSetBonus.BeetleDamage"),
            entry("source_key", "ArmorSetBonus.BeetleDamage"),
            entry("name", "ArmorSetBonus.BeetleDamage"),
            entry("name_zh", "甲虫盔甲"),
            entry("name_en", "Beetle armor"),
            entry("benefit_zh", "套装奖励：甲虫力量"),
            entry("benefit_en", "Set bonus: Beetle Might"),
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
        when(jdbcTemplate.queryForList(contains("projection_equipment_effect_attributes"), isA(Long.class))).thenReturn(List.of(Map.ofEntries(
            entry("owner_id", 158677909L),
            entry("stat_key", "defense"),
            entry("stat_label_zh", "防御"),
            entry("class_scope", "all"),
            entry("operation", "add"),
            entry("value_decimal", BigDecimal.valueOf(10)),
            entry("unit", "flat"),
            entry("apply_scope", "set_bonus"),
            entry("raw_text", "套装奖励：+10 防御"),
            entry("parse_status", "parsed")
        )));

        PublicArmorSetServiceImpl service = new PublicArmorSetServiceImpl(jdbcTemplate, new ObjectMapper(), managedImageUrlPolicy);
        PublicArmorSetListDTO armorSet = service.getPublicArmorSetById(158677909L);

        assertEquals(158677909L, armorSet.getId());
        assertEquals("甲虫盔甲", armorSet.getNameZh());
        assertEquals(List.of(MANAGED_ITEM_IMAGE), armorSet.getFallbackImages());
        assertEquals(1, armorSet.getEffects().size());
        assertEquals("defense", armorSet.getEffects().get(0).getStatKey());
    }
}

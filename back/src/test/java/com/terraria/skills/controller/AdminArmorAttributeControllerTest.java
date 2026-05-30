package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AdminArmorAttributeControllerTest {

    private JdbcTemplate jdbcTemplate;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        jdbcTemplate = mock(JdbcTemplate.class);
        mockMvc = MockMvcBuilders
            .standaloneSetup(new AdminArmorAttributeController(jdbcTemplate, new ObjectMapper()))
            .build();
    }

    @Test
    void shouldReturnArmorAttributeSummary() throws Exception {
        when(jdbcTemplate.queryForObject(anyString(), any(Class.class))).thenReturn(230L, 230L, 0L, 292L, 228L, 115L);
        when(jdbcTemplate.queryForList(anyString())).thenReturn(
            List.of(Map.of("slot_group", "head", "total", 86L)),
            List.of(Map.of("section_code", "hardmode", "total", 110L))
        );

        mockMvc.perform(get("/admin/armor-attributes/summary"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.totalRows").value(230))
            .andExpect(jsonPath("$.data.effectRows").value(292))
            .andExpect(jsonPath("$.data.rowsWithEffects").value(115))
            .andExpect(jsonPath("$.data.slotCounts.head").value(86))
            .andExpect(jsonPath("$.data.sectionCounts.hardmode").value(110));
    }

    @Test
    void shouldReturnPagedArmorAttributeRowsWithRawCellsAndEffectCount() throws Exception {
        when(jdbcTemplate.queryForObject(anyString(), any(Class.class), any(Object[].class))).thenReturn(1L);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(hallowedMaskAttributeRow()));

        mockMvc.perform(get("/admin/armor-attributes")
                .param("search", "神圣面具")
                .param("slotGroup", "head")
                .param("sectionCode", "hardmode")
                .param("hasEffects", "true")
                .param("hasDefense", "true")
                .param("page", "1")
                .param("limit", "20"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].itemInternalName").value("HallowedMask"))
            .andExpect(jsonPath("$.data[0].itemNameZh").value("神圣面具"))
            .andExpect(jsonPath("$.data[0].defenseValue").value(24))
            .andExpect(jsonPath("$.data[0].rawCells.meleeDamage").value("10%"))
            .andExpect(jsonPath("$.data[0].rawCells.meleeCritChance").value("10%"))
            .andExpect(jsonPath("$.data[0].effectCount").value(3))
            .andExpect(jsonPath("$.pagination.total").value(1))
            .andExpect(jsonPath("$.pagination.page").value(1))
            .andExpect(jsonPath("$.pagination.limit").value(20));
    }

    @Test
    void shouldReturnArmorAttributeDetailWithStructuredEffects() throws Exception {
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(
            List.of(hallowedMaskAttributeRow()),
            List.of(
                effectRow("damage_bonus", "近战伤害", "melee", "10%", "10.0000"),
                effectRow("crit_chance", "暴击率", "all", "10%", "10.0000"),
                effectRow("melee_speed", "近战速度", "melee", "10%", "10.0000")
            )
        );

        mockMvc.perform(get("/admin/armor-attributes/559"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.attribute.itemInternalName").value("HallowedMask"))
            .andExpect(jsonPath("$.data.attribute.itemNameZh").value("神圣面具"))
            .andExpect(jsonPath("$.data.attribute.defenseValue").value(24))
            .andExpect(jsonPath("$.data.effects.length()").value(3))
            .andExpect(jsonPath("$.data.effects[0].ownerId").value(559))
            .andExpect(jsonPath("$.data.effects[0].statKey").value("damage_bonus"))
            .andExpect(jsonPath("$.data.effects[0].valueDecimal").value(10.0000))
            .andExpect(jsonPath("$.data.effects[0].unit").value("percent"))
            .andExpect(jsonPath("$.data.effects[1].statKey").value("crit_chance"))
            .andExpect(jsonPath("$.data.effects[2].statKey").value("melee_speed"));
    }

    @Test
    void shouldUseAttributeRowIdWhenLoadingDetailForVariantRows() throws Exception {
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(
            List.of(hallowedMaskAttributeRow()),
            List.of()
        );

        mockMvc.perform(get("/admin/armor-attributes/559").param("attributeRowId", "197"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.attribute.id").value(197))
            .andExpect(jsonPath("$.data.attribute.itemInternalName").value("HallowedMask"));

        verify(jdbcTemplate).queryForList(contains("AND a.id = ?"), eq(559L), eq(197L));
    }

    @Test
    void shouldReturnNotFoundWhenNoActiveArmorAttributeRowExists() throws Exception {
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());

        mockMvc.perform(get("/admin/armor-attributes/999999"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.statusCode").value(404));
    }

    private static Map<String, Object> hallowedMaskAttributeRow() {
        return Map.ofEntries(
            Map.entry("id", 197L),
            Map.entry("item_id", 559L),
            Map.entry("item_internal_name", "HallowedMask"),
            Map.entry("item_name_zh", "神圣面具"),
            Map.entry("item_page_title", "神圣面具"),
            Map.entry("item_href", "/zh/wiki/%E7%A5%9E%E5%9C%A3%E9%9D%A2%E5%85%B7"),
            Map.entry("slot_group", "head"),
            Map.entry("section_code", "hardmode"),
            Map.entry("defense_value", 24),
            Map.entry("raw_cells_json", "{\"meleeDamage\":\"10%\",\"meleeCritChance\":\"10%\",\"classSpecific\":\"10%\"}"),
            Map.entry("effect_count", 3L),
            Map.entry("source_provider", "terraria.wiki.gg"),
            Map.entry("source_page", "盔甲属性表"),
            Map.entry("source_revision_timestamp", Timestamp.from(Instant.parse("2023-10-23T04:15:47Z")))
        );
    }

    private static Map<String, Object> effectRow(String statKey, String label, String classScope, String rawText, String value) {
        return Map.ofEntries(
            Map.entry("id", Math.abs(statKey.hashCode())),
            Map.entry("owner_id", 559L),
            Map.entry("item_internal_name", "HallowedMask"),
            Map.entry("owner_kind", "item"),
            Map.entry("owner_key", "HallowedMask"),
            Map.entry("source_kind", "armor_attribute_cell"),
            Map.entry("source_line", rawText),
            Map.entry("source_line_index", 0),
            Map.entry("effect_index", 0),
            Map.entry("apply_scope", "single_piece"),
            Map.entry("slot_type", "head"),
            Map.entry("stat_key", statKey),
            Map.entry("stat_label_zh", label),
            Map.entry("class_scope", classScope),
            Map.entry("operation", "add"),
            Map.entry("value_decimal", value),
            Map.entry("value_max_decimal", "10.0000"),
            Map.entry("unit", "percent"),
            Map.entry("condition_text", ""),
            Map.entry("raw_text", rawText),
            Map.entry("parse_status", "parsed")
        );
    }
}

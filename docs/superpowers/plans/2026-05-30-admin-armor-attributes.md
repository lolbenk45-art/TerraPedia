# Admin Armor Attributes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only后台管理端 surface for wiki-sourced armor-piece attributes so operators can search, filter, inspect, and verify concrete fields such as `神圣面具` defense `24` and item-owned structured equipment effects.

**Architecture:** Reuse the data already loaded into relation projections instead of adding another import path. The backend exposes read-only `/admin/armor-attributes` APIs backed by `terria_v1_relation.projection_item_armor_attributes` and `terria_v1_relation.projection_equipment_effect_attributes`; the Nuxt admin app adds an operations page with typed fetches, summary cards, filters, a table, and a detail drawer/modal. No manual edit flow is added in this phase because the source of truth is wiki API data.

**Tech Stack:** Spring Boot + JdbcTemplate + MockMvc tests, MySQL relation projection tables, Nuxt 3 admin app (`data-query-app`), TypeScript, Node test runner contract tests.

---

## Current Facts

- The armor attribute database chain is already implemented on branch `feat/wiki-armor-attributes-chain-2026-05-30`.
- Execute implementation in worktree `/home/lolben/.config/superpowers/worktrees/TerraPedia/feat-wiki-armor-attributes-chain-2026-05-30` on branch `feat/wiki-armor-attributes-chain-2026-05-30`; do not implement from the main worktree that only holds planning docs.
- Local DB load has already verified:
  - `projection_item_armor_attributes`: `230` active rows.
  - `projection_equipment_effect_attributes` with `owner_kind='item'` and `source_kind='armor_attribute_cell'`: `292` active rows.
  - `神圣面具` resolves to `item_internal_name='HallowedMask'`, `slot_group='head'`, `section_code='hardmode'`, `defense_value=24`.
  - `HallowedMask` has structured effects:
    - `damage_bonus / melee / 10 / percent`
    - `crit_chance / all / 10 / percent`
    - `melee_speed / melee / 10 / percent`
- Existing public APIs already read these projections through `PublicItemServiceImpl`.
- Existing admin app is `data-query-app`.
- Existing admin operations pages live under `data-query-app/pages/operations`.
- Existing admin navigation is in `data-query-app/layouts/default.vue`.

## Scope

In scope:

- Add read-only backend admin API for list, detail, and summary.
- Add typed admin frontend API calls and page-local types.
- Add a new admin operations page: `/operations/armor-attributes`.
- Add a sidebar navigation item under Operations.
- Render searchable/filterable armor-piece rows with concrete fields.
- Render raw wiki cell fields as key/value rows.
- Render structured equipment effects as normalized rows.
- Add contract tests preventing this feature from regressing into prose-only display.

Out of scope:

- Editing armor attribute rows from the admin UI.
- Adding manual override tables.
- Re-running the wiki fetch or DB load.
- Changing public item detail UI.
- Replacing existing armor set management.
- Starting/stopping the main local stack unless the executor is specifically asked to verify live UI.

## Data Contract

Backend list row shape:

```json
{
  "id": 197,
  "itemId": 559,
  "itemInternalName": "HallowedMask",
  "itemNameZh": "神圣面具",
  "itemPageTitle": "神圣面具",
  "itemHref": "/zh/wiki/%E7%A5%9E%E5%9C%A3%E9%9D%A2%E5%85%B7",
  "slotGroup": "head",
  "sectionCode": "hardmode",
  "defenseValue": 24,
  "rawCells": {
    "meleeDamage": "10%",
    "meleeCritChance": "10%",
    "classSpecific": "10%"
  },
  "effectCount": 3,
  "sourceProvider": "terraria.wiki.gg",
  "sourcePage": "盔甲属性表",
  "sourceRevisionTimestamp": "2023-10-23T04:15:47"
}
```

Backend detail lookup:

- `GET /admin/armor-attributes/{itemId}` remains the stable route.
- Frontend should pass `attributeRowId=<row.id>` when opening a row detail so duplicate or variant wiki rows for the same item do not collapse into the first row.

Backend effect row shape:

```json
{
  "id": 1,
  "ownerId": 559,
  "itemInternalName": "HallowedMask",
  "ownerKind": "item",
  "sourceKind": "armor_attribute_cell",
  "sourceLine": "meleeDamage=10%",
  "sourceLineIndex": 0,
  "effectIndex": 0,
  "applyScope": "single_piece",
  "slotType": "head",
  "statKey": "damage_bonus",
  "statLabelZh": "近战伤害",
  "classScope": "melee",
  "operation": "add",
  "valueDecimal": 10,
  "unit": "percent",
  "rawText": "10%",
  "parseStatus": "parsed"
}
```

Backend summary shape:

```json
{
  "totalRows": 230,
  "matchedItemRows": 230,
  "unmatchedItemRows": 0,
  "effectRows": 292,
  "rowsWithDefense": 228,
  "rowsWithEffects": 115,
  "slotCounts": {
    "head": 86,
    "body": 72,
    "legs": 72
  },
  "sectionCounts": {
    "pre-hardmode": 120,
    "hardmode": 110
  }
}
```

Exact counts above are examples except `totalRows`, `effectRows`, and `神圣面具` sample values. Tests must assert the sample contract, not hard-code all summary count examples unless the fixture creates those exact counts.

## Task 1: Backend Admin API Contract

**Files:**

- Create: `back/src/main/java/com/terraria/skills/controller/AdminArmorAttributeController.java`
- Create: `back/src/test/java/com/terraria/skills/controller/AdminArmorAttributeControllerTest.java`

**Implementation boundary:** Work only in the execution worktree and only on the two backend files above for this task. The summary query must count effect-owning armor items with `COUNT(DISTINCT owner_id)`, because `projection_equipment_effect_attributes` stores item ownership in `owner_id`, not `item_id`.

- [ ] **Step 1: Add failing MockMvc tests for summary, list, and detail**

Create `back/src/test/java/com/terraria/skills/controller/AdminArmorAttributeControllerTest.java`:

```java
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
import static org.mockito.Mockito.mock;
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
            .andExpect(jsonPath("$.data.slotCounts.head").value(86))
            .andExpect(jsonPath("$.data.sectionCounts.hardmode").value(110));
    }

    @Test
    void shouldReturnPagedArmorAttributeRowsWithRawCellsAndEffectCount() throws Exception {
        when(jdbcTemplate.queryForObject(anyString(), any(Class.class), any(Object[].class))).thenReturn(1L);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(Map.ofEntries(
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
        )));

        mockMvc.perform(get("/admin/armor-attributes")
                .param("search", "神圣面具")
                .param("slotGroup", "head")
                .param("sectionCode", "hardmode")
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
            .andExpect(jsonPath("$.pagination.total").value(1));
    }

    @Test
    void shouldReturnArmorAttributeDetailWithStructuredEffects() throws Exception {
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(
            List.of(Map.ofEntries(
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
            )),
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
            .andExpect(jsonPath("$.data.attribute.defenseValue").value(24))
            .andExpect(jsonPath("$.data.effects.length()").value(3))
            .andExpect(jsonPath("$.data.effects[0].statKey").value("damage_bonus"))
            .andExpect(jsonPath("$.data.effects[1].statKey").value("crit_chance"))
            .andExpect(jsonPath("$.data.effects[2].statKey").value("melee_speed"));
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
            Map.entry("unit", "percent"),
            Map.entry("raw_text", rawText),
            Map.entry("parse_status", "parsed")
        );
    }
}
```

- [ ] **Step 2: Run the failing backend test**

Run:

```bash
cd back && mvn "-Dtest=AdminArmorAttributeControllerTest" test
```

Expected: fail because `AdminArmorAttributeController` does not exist.

- [ ] **Step 3: Implement the read-only controller**

Create `back/src/main/java/com/terraria/skills/controller/AdminArmorAttributeController.java`:

```java
package com.terraria.skills.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/admin/armor-attributes")
@RequiredArgsConstructor
@Tag(name = "AdminArmorAttributes", description = "Read-only wiki armor attribute inspection")
@SecurityRequirement(name = "bearerAuth")
public class AdminArmorAttributeController {

    private static final String RELATION_DB = "terria_v1_relation";
    private static final String ARMOR_TABLE = "`" + RELATION_DB + "`.`projection_item_armor_attributes`";
    private static final String EFFECT_TABLE = "`" + RELATION_DB + "`.`projection_equipment_effect_attributes`";
    private static final TypeReference<Map<String, Object>> RAW_CELLS_TYPE = new TypeReference<>() {};

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    @GetMapping("/summary")
    @Operation(summary = "Get armor attribute projection summary")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getSummary() {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalRows", scalar("SELECT COUNT(*) FROM " + ARMOR_TABLE + " WHERE deleted = 0"));
        summary.put("matchedItemRows", scalar("SELECT COUNT(*) FROM " + ARMOR_TABLE + " WHERE deleted = 0 AND item_id IS NOT NULL"));
        summary.put("unmatchedItemRows", scalar("SELECT COUNT(*) FROM " + ARMOR_TABLE + " WHERE deleted = 0 AND item_id IS NULL"));
        summary.put("effectRows", scalar("SELECT COUNT(*) FROM " + EFFECT_TABLE + " WHERE deleted = 0 AND owner_kind = 'item' AND source_kind = 'armor_attribute_cell'"));
        summary.put("rowsWithDefense", scalar("SELECT COUNT(*) FROM " + ARMOR_TABLE + " WHERE deleted = 0 AND defense_value IS NOT NULL"));
        summary.put("rowsWithEffects", scalar("""
            SELECT COUNT(DISTINCT owner_id)
            FROM """ + EFFECT_TABLE + """
            WHERE deleted = 0 AND owner_kind = 'item' AND source_kind = 'armor_attribute_cell' AND owner_id IS NOT NULL
            """));
        summary.put("slotCounts", groupedCounts("slot_group"));
        summary.put("sectionCounts", groupedCounts("section_code"));
        return ResponseEntity.ok(ApiResponse.success(summary));
    }

    @GetMapping
    @Operation(summary = "List wiki armor attribute rows")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> list(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) String slotGroup,
        @RequestParam(required = false) String sectionCode,
        @RequestParam(required = false) Boolean hasEffects,
        @RequestParam(required = false) Boolean hasDefense
    ) {
        int safePage = PaginationParams.resolvePage(page);
        int safeLimit = PaginationParams.resolveLimit(limit, size, 20, 100);
        int offset = (safePage - 1) * safeLimit;
        List<Object> args = new ArrayList<>();
        String where = buildWhere(search, slotGroup, sectionCode, hasDefense, args);
        String effectFilter = buildEffectFilter(hasEffects);

        Long total = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM " + ARMOR_TABLE + " a" + where + effectFilter,
            Long.class,
            args.toArray()
        );

        List<Object> queryArgs = new ArrayList<>(args);
        queryArgs.add(offset);
        queryArgs.add(safeLimit);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
            SELECT a.id, a.item_id, a.item_internal_name, a.item_name_zh, a.item_page_title, a.item_href,
                   a.slot_group, a.section_code, a.defense_value, a.raw_cells_json,
                   a.source_provider, a.source_page, a.source_revision_timestamp,
                   (
                     SELECT COUNT(*)
                     FROM """ + EFFECT_TABLE + """ e
                     WHERE e.deleted = 0
                       AND e.owner_kind = 'item'
                       AND e.source_kind = 'armor_attribute_cell'
                       AND e.owner_id = a.item_id
                   ) AS effect_count
            FROM """ + ARMOR_TABLE + """ a
            """ + where + effectFilter + """
            ORDER BY a.section_code ASC, a.slot_group ASC, a.item_name_zh ASC, a.id ASC
            LIMIT ?, ?
            """,
            queryArgs.toArray()
        );

        ApiResponse<List<Map<String, Object>>> response = ApiResponse.success(rows.stream().map(this::toAttributePayload).toList());
        response.setPagination(new Pagination(total == null ? 0 : total, safePage, safeLimit));
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{itemId}")
    @Operation(summary = "Get wiki armor attribute detail by item id")
    public ResponseEntity<ApiResponse<Map<String, Object>>> detail(@PathVariable Long itemId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
            SELECT a.id, a.item_id, a.item_internal_name, a.item_name_zh, a.item_page_title, a.item_href,
                   a.slot_group, a.section_code, a.defense_value, a.raw_cells_json,
                   a.source_provider, a.source_page, a.source_revision_timestamp,
                   (
                     SELECT COUNT(*)
                     FROM """ + EFFECT_TABLE + """ e
                     WHERE e.deleted = 0
                       AND e.owner_kind = 'item'
                       AND e.source_kind = 'armor_attribute_cell'
                       AND e.owner_id = a.item_id
                   ) AS effect_count
            FROM """ + ARMOR_TABLE + """ a
            WHERE a.deleted = 0 AND a.item_id = ?
            ORDER BY a.id ASC
            """,
            itemId
        );

        if (rows.isEmpty()) {
            return ResponseEntity.status(404).body(ApiResponse.error(404, "Armor attribute row not found"));
        }

        List<Map<String, Object>> effects = jdbcTemplate.queryForList(
            """
            SELECT id, owner_id, item_internal_name, owner_kind, owner_key, source_kind, source_line, source_line_index,
                   effect_index, apply_scope, slot_type, stat_key, stat_label_zh, class_scope, operation,
                   value_decimal, value_max_decimal, unit, condition_text, raw_text, parse_status
            FROM """ + EFFECT_TABLE + """
            WHERE deleted = 0
              AND owner_kind = 'item'
              AND source_kind = 'armor_attribute_cell'
              AND owner_id = ?
            ORDER BY effect_index ASC, id ASC
            """,
            itemId
        );

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("attribute", toAttributePayload(rows.get(0)));
        payload.put("effects", effects.stream().map(this::toEffectPayload).toList());
        return ResponseEntity.ok(ApiResponse.success(payload));
    }

    private long scalar(String sql) {
        Long value = jdbcTemplate.queryForObject(sql, Long.class);
        return value == null ? 0L : value;
    }

    private Map<String, Long> groupedCounts(String columnName) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            "SELECT " + columnName + ", COUNT(*) AS total FROM " + ARMOR_TABLE + " WHERE deleted = 0 GROUP BY " + columnName + " ORDER BY " + columnName
        );
        Map<String, Long> result = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            result.put(String.valueOf(row.get(columnName)), toLong(row.get("total")));
        }
        return result;
    }

    private String buildWhere(String search, String slotGroup, String sectionCode, Boolean hasDefense, List<Object> args) {
        List<String> filters = new ArrayList<>();
        filters.add(" a.deleted = 0 ");
        if (hasText(search)) {
            filters.add(" (a.item_name_zh LIKE ? OR a.item_internal_name LIKE ? OR a.item_page_title LIKE ?) ");
            String keyword = "%" + search.trim() + "%";
            args.add(keyword);
            args.add(keyword);
            args.add(keyword);
        }
        if (hasText(slotGroup)) {
            filters.add(" a.slot_group = ? ");
            args.add(slotGroup.trim());
        }
        if (hasText(sectionCode)) {
            filters.add(" a.section_code = ? ");
            args.add(sectionCode.trim());
        }
        if (Boolean.TRUE.equals(hasDefense)) {
            filters.add(" a.defense_value IS NOT NULL ");
        } else if (Boolean.FALSE.equals(hasDefense)) {
            filters.add(" a.defense_value IS NULL ");
        }
        return " WHERE " + String.join(" AND ", filters);
    }

    private String buildEffectFilter(Boolean hasEffects) {
        if (hasEffects == null) {
            return "";
        }
        String existsSql = """
             EXISTS (
               SELECT 1 FROM """ + EFFECT_TABLE + """ e
               WHERE e.deleted = 0
                 AND e.owner_kind = 'item'
                 AND e.source_kind = 'armor_attribute_cell'
                 AND e.owner_id = a.item_id
             )
            """;
        return Boolean.TRUE.equals(hasEffects) ? " AND " + existsSql : " AND NOT " + existsSql;
    }

    private Map<String, Object> toAttributePayload(Map<String, Object> row) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", toLongObject(row.get("id")));
        payload.put("itemId", toLongObject(row.get("item_id")));
        payload.put("itemInternalName", text(row.get("item_internal_name")));
        payload.put("itemNameZh", text(row.get("item_name_zh")));
        payload.put("itemPageTitle", text(row.get("item_page_title")));
        payload.put("itemHref", text(row.get("item_href")));
        payload.put("slotGroup", text(row.get("slot_group")));
        payload.put("sectionCode", text(row.get("section_code")));
        payload.put("defenseValue", toIntegerObject(row.get("defense_value")));
        payload.put("rawCells", parseRawCells(row.get("raw_cells_json")));
        payload.put("effectCount", toLong(row.get("effect_count")));
        payload.put("sourceProvider", text(row.get("source_provider")));
        payload.put("sourcePage", text(row.get("source_page")));
        payload.put("sourceRevisionTimestamp", timestampText(row.get("source_revision_timestamp")));
        return payload;
    }

    private Map<String, Object> toEffectPayload(Map<String, Object> row) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", toLongObject(row.get("id")));
        payload.put("ownerId", toLongObject(row.get("owner_id")));
        payload.put("itemInternalName", text(row.get("item_internal_name")));
        payload.put("ownerKind", text(row.get("owner_kind")));
        payload.put("ownerKey", text(row.get("owner_key")));
        payload.put("sourceKind", text(row.get("source_kind")));
        payload.put("sourceLine", text(row.get("source_line")));
        payload.put("sourceLineIndex", toIntegerObject(row.get("source_line_index")));
        payload.put("effectIndex", toIntegerObject(row.get("effect_index")));
        payload.put("applyScope", text(row.get("apply_scope")));
        payload.put("slotType", text(row.get("slot_type")));
        payload.put("statKey", text(row.get("stat_key")));
        payload.put("statLabelZh", text(row.get("stat_label_zh")));
        payload.put("classScope", text(row.get("class_scope")));
        payload.put("operation", text(row.get("operation")));
        payload.put("valueDecimal", decimalObject(row.get("value_decimal")));
        payload.put("valueMaxDecimal", decimalObject(row.get("value_max_decimal")));
        payload.put("unit", text(row.get("unit")));
        payload.put("conditionText", text(row.get("condition_text")));
        payload.put("rawText", text(row.get("raw_text")));
        payload.put("parseStatus", text(row.get("parse_status")));
        return payload;
    }

    private Map<String, Object> parseRawCells(Object raw) {
        if (raw == null) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(String.valueOf(raw), RAW_CELLS_TYPE);
        } catch (Exception exception) {
            log.debug("Failed to parse armor raw cells json", exception);
            return Map.of("parseError", true, "raw", String.valueOf(raw));
        }
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String text(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private String timestampText(Object value) {
        if (value instanceof Timestamp timestamp) {
            Instant instant = timestamp.toInstant();
            return instant.toString().replace("Z", "");
        }
        return value == null ? null : String.valueOf(value);
    }

    private Long toLongObject(Object value) {
        if (value == null) return null;
        if (value instanceof Number number) return number.longValue();
        return Long.parseLong(String.valueOf(value));
    }

    private long toLong(Object value) {
        Long result = toLongObject(value);
        return result == null ? 0L : result;
    }

    private Integer toIntegerObject(Object value) {
        if (value == null) return null;
        if (value instanceof Number number) return number.intValue();
        return Integer.parseInt(String.valueOf(value));
    }

    private BigDecimal decimalObject(Object value) {
        if (value == null) return null;
        if (value instanceof BigDecimal decimal) return decimal;
        if (value instanceof Number number) return BigDecimal.valueOf(number.doubleValue());
        return new BigDecimal(String.valueOf(value));
    }
}
```

- [ ] **Step 4: Run backend tests**

Run:

```bash
cd back && mvn "-Dtest=AdminArmorAttributeControllerTest" test
```

Expected: pass.

- [ ] **Step 5: Commit backend API**

Run:

```bash
git status --short
git diff --check
git add back/src/main/java/com/terraria/skills/controller/AdminArmorAttributeController.java \
  back/src/test/java/com/terraria/skills/controller/AdminArmorAttributeControllerTest.java
git commit -m "feat: expose admin armor attributes"
```

## Task 2: Admin Frontend Contract Tests

**Files:**

- Create: `data-query-app/tests/admin-armor-attributes-page-contract.test.mjs`
- Modify: `data-query-app/layouts/default.vue`
- Create: `data-query-app/pages/operations/armor-attributes.vue`

**Implementation boundary:** Work only in the execution worktree and only on the three frontend files above for this task. The page should load the full first page by default with an empty search filter; use `神圣面具 / HallowedMask / 页面名` as the placeholder and contract sample token, not as the default filter value.

- [ ] **Step 1: Add failing contract test**

Create `data-query-app/tests/admin-armor-attributes-page-contract.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test('armor attributes admin page consumes read-only admin APIs', () => {
  const page = read('data-query-app/pages/operations/armor-attributes.vue')

  assert.match(page, /definePageMeta\(\{\s*title:\s*'盔甲属性表'/)
  assert.match(page, /navSection:\s*'\/operations\/armor-attributes'/)
  assert.match(page, /get<ArmorAttributeSummaryResponse>\('\/admin\/armor-attributes\/summary'\)/)
  assert.match(page, /get<ArmorAttributeListResponse>\('\/admin\/armor-attributes'/)
  assert.match(page, /get<ArmorAttributeDetailResponse>\(`\/admin\/armor-attributes\/\$\{row\.itemId\}`,\s*\{/)
  assert.match(page, /attributeRowId:\s*row\.id/)
  assert.doesNotMatch(page, /\b(post|put|patch|del)\s*\(/)
})

test('armor attributes admin page renders concrete fields instead of prose-only data', () => {
  const page = read('data-query-app/pages/operations/armor-attributes.vue')

  for (const token of [
    'defenseValue',
    'rawCells',
    'meleeDamage',
    'meleeCritChance',
    'classSpecific',
    'statKey',
    'classScope',
    'valueDecimal',
    'unit',
    'rawText',
    'parseStatus',
    'effectCount',
    'slotGroup',
    'sectionCode',
    'itemInternalName',
    'itemNameZh',
    'sourceRevisionTimestamp',
  ]) {
    assert.match(page, new RegExp(escapeRegExp(token)))
  }

  assert.match(page, /raw-cell-grid/)
  assert.match(page, /effect-table/)
  assert.match(page, /detail-drawer/)
  assert.match(page, /神圣面具/)
  assert.match(page, /HallowedMask/)
})

test('armor attributes admin navigation is registered under operations', () => {
  const layout = read('data-query-app/layouts/default.vue')

  assert.match(layout, /盔甲属性表/)
  assert.match(layout, /\/operations\/armor-attributes/)
  assert.match(layout, /核验单件装备字段/)
})
```

- [ ] **Step 2: Run failing frontend contract test**

Run:

```bash
cd data-query-app && node --test tests/admin-armor-attributes-page-contract.test.mjs
```

Expected: fail because the page and navigation do not exist.

## Task 3: Admin Frontend Page

**Files:**

- Create: `data-query-app/pages/operations/armor-attributes.vue`

- [ ] **Step 1: Create the page implementation**

Create `data-query-app/pages/operations/armor-attributes.vue`:

```vue
<template>
  <div class="page-wrap armor-attributes-admin">
    <section class="workspace-hero workspace-hero--unified hero-card">
      <div class="workspace-hero__copy">
        <p class="hero-card__eyebrow">Wiki Armor Attribute Audit</p>
        <h1 class="page-head__title hero-card__title">盔甲属性表</h1>
        <p class="page-head__subtitle hero-card__subtitle">按单件装备核验防御、职业加成、暴击、速度等结构化字段。</p>
      </div>
      <div class="hero-stats workspace-summary-grid">
        <article class="hero-stat">
          <span class="hero-stat__label">属性行</span>
          <strong class="hero-stat__value">{{ summary?.totalRows ?? '--' }}</strong>
        </article>
        <article class="hero-stat">
          <span class="hero-stat__label">结构化效果</span>
          <strong class="hero-stat__value">{{ summary?.effectRows ?? '--' }}</strong>
        </article>
        <article class="hero-stat">
          <span class="hero-stat__label">已匹配物品</span>
          <strong class="hero-stat__value">{{ summary?.matchedItemRows ?? '--' }}</strong>
        </article>
      </div>
    </section>

    <section class="section-card">
      <form class="toolbar" @submit.prevent="handleSearch">
        <label class="field field--search">
          <span class="field__label">关键词</span>
          <input v-model.trim="filters.search" class="input" type="text" placeholder="神圣面具 / HallowedMask / 页面名" />
        </label>
        <label class="field">
          <span class="field__label">部位</span>
          <select v-model="filters.slotGroup" class="input">
            <option value="">全部</option>
            <option value="head">头部 head</option>
            <option value="body">身体 body</option>
            <option value="legs">腿部 legs</option>
          </select>
        </label>
        <label class="field">
          <span class="field__label">阶段</span>
          <select v-model="filters.sectionCode" class="input">
            <option value="">全部</option>
            <option value="pre-hardmode">困难模式前</option>
            <option value="hardmode">困难模式</option>
          </select>
        </label>
        <label class="field">
          <span class="field__label">结构化效果</span>
          <select v-model="filters.hasEffects" class="input">
            <option value="">全部</option>
            <option value="true">有</option>
            <option value="false">无</option>
          </select>
        </label>
        <label class="field">
          <span class="field__label">防御字段</span>
          <select v-model="filters.hasDefense" class="input">
            <option value="">全部</option>
            <option value="true">有</option>
            <option value="false">无</option>
          </select>
        </label>
        <div class="toolbar__actions">
          <button type="submit" class="btn btn-primary">搜索</button>
          <button type="button" class="btn btn-secondary" @click="resetFilters">重置</button>
        </div>
      </form>
    </section>

    <section class="section-card table-card">
      <div class="table-card__head">
        <div>
          <h2 class="section-card__title">单件装备属性</h2>
          <p class="section-card__subtitle">展示 wiki 盔甲属性表解析后的字段，不使用描述文本替代结构化数据。</p>
        </div>
        <div class="table-card__summary">
          <span>{{ pagination.total }} 条</span>
          <span>第 {{ pagination.page }} 页</span>
        </div>
      </div>

      <div v-if="loadError" class="empty-state" role="alert">{{ loadError }}</div>
      <div v-else-if="loading" class="empty-state">加载中...</div>
      <div v-else-if="!rows.length" class="empty-state">暂无盔甲属性数据</div>
      <div v-else class="table-scroll">
        <table class="data-table armor-attribute-table">
          <thead>
            <tr>
              <th>装备</th>
              <th>部位</th>
              <th>阶段</th>
              <th>防御</th>
              <th>近战伤害</th>
              <th>暴击</th>
              <th>职业字段</th>
              <th>效果数</th>
              <th>来源</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td>
                <strong>{{ row.itemNameZh || row.itemPageTitle }}</strong>
                <small>{{ row.itemInternalName || row.itemPageTitle }}</small>
              </td>
              <td>{{ slotLabel(row.slotGroup) }}</td>
              <td>{{ sectionLabel(row.sectionCode) }}</td>
              <td>{{ valueOrDash(row.defenseValue) }}</td>
              <td>{{ rawCell(row, 'meleeDamage') }}</td>
              <td>{{ rawCell(row, 'meleeCritChance') }}</td>
              <td>{{ rawCell(row, 'classSpecific') }}</td>
              <td>{{ row.effectCount }}</td>
              <td>
                <span>{{ row.sourcePage }}</span>
                <small>{{ row.sourceRevisionTimestamp }}</small>
              </td>
              <td>
                <button type="button" class="btn-link" @click="openDetail(row)">详情</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pagination-row">
        <button type="button" class="btn btn-secondary" :disabled="pagination.page <= 1" @click="goPage(pagination.page - 1)">上一页</button>
        <span>第 {{ pagination.page }} / {{ pagination.totalPages || 1 }} 页</span>
        <button type="button" class="btn btn-secondary" :disabled="pagination.page >= pagination.totalPages" @click="goPage(pagination.page + 1)">下一页</button>
      </div>
    </section>

    <div v-if="detailOpen" class="detail-drawer" role="dialog" aria-modal="true">
      <div class="detail-drawer__panel">
        <header class="detail-drawer__head">
          <div>
            <p class="hero-card__eyebrow">Armor Attribute Detail</p>
            <h2>{{ detail?.attribute.itemNameZh || activeRow?.itemNameZh || '装备详情' }}</h2>
            <p>{{ detail?.attribute.itemInternalName || activeRow?.itemInternalName || 'HallowedMask' }}</p>
          </div>
          <button type="button" class="btn btn-secondary" @click="closeDetail">关闭</button>
        </header>

        <section v-if="detail?.attribute" class="detail-section">
          <h3>基础字段</h3>
          <div class="fact-grid">
            <span>防御 <strong>{{ valueOrDash(detail.attribute.defenseValue) }}</strong></span>
            <span>部位 <strong>{{ slotLabel(detail.attribute.slotGroup) }}</strong></span>
            <span>阶段 <strong>{{ sectionLabel(detail.attribute.sectionCode) }}</strong></span>
            <span>来源 <strong>{{ detail.attribute.sourcePage }}</strong></span>
          </div>
        </section>

        <section v-if="detail?.attribute" class="detail-section">
          <h3>Raw Cells</h3>
          <div class="raw-cell-grid">
            <div v-for="[key, value] in rawCellEntries(detail.attribute)" :key="key" class="raw-cell">
              <span>{{ key }}</span>
              <strong>{{ value || '--' }}</strong>
            </div>
          </div>
        </section>

        <section class="detail-section">
          <h3>结构化效果</h3>
          <table class="data-table effect-table">
            <thead>
              <tr>
                <th>statKey</th>
                <th>标签</th>
                <th>classScope</th>
                <th>valueDecimal</th>
                <th>unit</th>
                <th>rawText</th>
                <th>parseStatus</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="effect in detail?.effects || []" :key="effect.id">
                <td>{{ effect.statKey }}</td>
                <td>{{ effect.statLabelZh }}</td>
                <td>{{ effect.classScope }}</td>
                <td>{{ valueOrDash(effect.valueDecimal) }}</td>
                <td>{{ effect.unit }}</td>
                <td>{{ effect.rawText }}</td>
                <td>{{ effect.parseStatus }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="detail && !detail.effects.length" class="empty-state">暂无结构化效果</p>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { get } from '~/composables/useApi'

definePageMeta({ title: '盔甲属性表', navSection: '/operations/armor-attributes', headerVariant: 'compact' })

interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
  statusCode?: number
  pagination?: Pagination
}

interface Pagination {
  total: number
  page: number
  limit: number
  size: number
  totalPages: number
}

interface ArmorAttributeSummary {
  totalRows: number
  matchedItemRows: number
  unmatchedItemRows: number
  effectRows: number
  rowsWithDefense: number
  rowsWithEffects: number
  slotCounts: Record<string, number>
  sectionCounts: Record<string, number>
}

interface ArmorAttributeRow {
  id: number
  itemId: number | null
  itemInternalName: string | null
  itemNameZh: string | null
  itemPageTitle: string | null
  itemHref: string | null
  slotGroup: string | null
  sectionCode: string | null
  defenseValue: number | null
  rawCells: Record<string, string | number | null>
  effectCount: number
  sourceProvider: string | null
  sourcePage: string | null
  sourceRevisionTimestamp: string | null
}

interface ArmorAttributeEffect {
  id: number
  ownerId: number | null
  itemInternalName: string | null
  ownerKind: string | null
  ownerKey: string | null
  sourceKind: string | null
  sourceLine: string | null
  sourceLineIndex: number | null
  effectIndex: number | null
  applyScope: string | null
  slotType: string | null
  statKey: string | null
  statLabelZh: string | null
  classScope: string | null
  operation: string | null
  valueDecimal: number | string | null
  valueMaxDecimal: number | string | null
  unit: string | null
  conditionText: string | null
  rawText: string | null
  parseStatus: string | null
}

interface ArmorAttributeDetail {
  attribute: ArmorAttributeRow
  effects: ArmorAttributeEffect[]
}

type ArmorAttributeSummaryResponse = ApiResponse<ArmorAttributeSummary>
type ArmorAttributeListResponse = ApiResponse<ArmorAttributeRow[]>
type ArmorAttributeDetailResponse = ApiResponse<ArmorAttributeDetail>

const summary = ref<ArmorAttributeSummary | null>(null)
const rows = ref<ArmorAttributeRow[]>([])
const detail = ref<ArmorAttributeDetail | null>(null)
const activeRow = ref<ArmorAttributeRow | null>(null)
const detailOpen = ref(false)
const loading = ref(false)
const loadError = ref('')
const pagination = reactive<Pagination>({ total: 0, page: 1, limit: 20, size: 20, totalPages: 1 })
const filters = reactive({
  search: '',
  slotGroup: '',
  sectionCode: '',
  hasEffects: '',
  hasDefense: '',
})

const queryParams = computed(() => ({
  page: pagination.page,
  limit: pagination.limit,
  search: filters.search || undefined,
  slotGroup: filters.slotGroup || undefined,
  sectionCode: filters.sectionCode || undefined,
  hasEffects: filters.hasEffects || undefined,
  hasDefense: filters.hasDefense || undefined,
}))

async function fetchSummary() {
  const response = await get<ArmorAttributeSummaryResponse>('/admin/armor-attributes/summary')
  summary.value = response.data
}

async function fetchRows(page = pagination.page) {
  loading.value = true
  loadError.value = ''
  try {
    pagination.page = page
    const response = await get<ArmorAttributeListResponse>('/admin/armor-attributes', queryParams.value)
    rows.value = response.data || []
    if (response.pagination) {
      Object.assign(pagination, response.pagination)
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '盔甲属性加载失败'
  } finally {
    loading.value = false
  }
}

async function openDetail(row: ArmorAttributeRow) {
  if (!row.itemId) return
  activeRow.value = row
  detailOpen.value = true
  const response = await get<ArmorAttributeDetailResponse>(`/admin/armor-attributes/${row.itemId}`, {
    attributeRowId: row.id,
  })
  detail.value = response.data
}

function closeDetail() {
  detailOpen.value = false
  detail.value = null
  activeRow.value = null
}

async function handleSearch() {
  await fetchRows(1)
}

async function resetFilters() {
  filters.search = ''
  filters.slotGroup = ''
  filters.sectionCode = ''
  filters.hasEffects = ''
  filters.hasDefense = ''
  await fetchRows(1)
}

async function goPage(page: number) {
  await fetchRows(Math.max(1, page))
}

function rawCell(row: ArmorAttributeRow, key: string) {
  const value = row.rawCells?.[key]
  return value == null || value === '' ? '--' : String(value)
}

function rawCellEntries(row: ArmorAttributeRow) {
  return Object.entries(row.rawCells || {})
}

function valueOrDash(value: unknown) {
  return value == null || value === '' ? '--' : String(value)
}

function slotLabel(value: string | null) {
  if (value === 'head') return '头部 head'
  if (value === 'body') return '身体 body'
  if (value === 'legs') return '腿部 legs'
  return value || '--'
}

function sectionLabel(value: string | null) {
  if (value === 'pre-hardmode') return '困难模式前'
  if (value === 'hardmode') return '困难模式'
  return value || '--'
}

onMounted(async () => {
  await Promise.all([fetchSummary(), fetchRows(1)])
})
</script>

<style scoped>
.armor-attributes-admin {
  display: grid;
  gap: 18px;
}

.armor-attribute-table td strong,
.armor-attribute-table td small {
  display: block;
}

.armor-attribute-table td small {
  color: var(--color-text-muted);
  margin-top: 4px;
}

.detail-drawer {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  justify-content: flex-end;
  background: rgba(0, 0, 0, 0.38);
}

.detail-drawer__panel {
  width: min(960px, 100%);
  height: 100%;
  overflow: auto;
  background: var(--color-bg);
  padding: 24px;
}

.detail-drawer__head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 20px;
}

.detail-section {
  margin-top: 18px;
}

.fact-grid,
.raw-cell-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.fact-grid span,
.raw-cell {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--color-bg-secondary);
}

.raw-cell span,
.fact-grid span {
  color: var(--color-text-secondary);
}

.raw-cell strong,
.fact-grid strong {
  display: block;
  margin-top: 4px;
  color: var(--color-text);
}

.pagination-row {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}
</style>
```

- [ ] **Step 2: Add the navigation item**

Modify `data-query-app/layouts/default.vue`.

Add `ShieldCheck` or `FileSearch` is already imported in this file. If neither is available in the icon import list, add `TableProperties` from `lucide-vue-next`.

In the `Operations` section, add:

```ts
{ name: '盔甲属性表', path: '/operations/armor-attributes', hint: '核验单件装备字段', icon: FileSearch },
```

Place it after `数据源验收` and before `B 档域验收`.

- [ ] **Step 3: Run frontend contract test**

Run:

```bash
cd data-query-app && node --test tests/admin-armor-attributes-page-contract.test.mjs
```

Expected: pass.

- [ ] **Step 4: Commit frontend page**

Run:

```bash
git status --short
git diff --check
git add data-query-app/pages/operations/armor-attributes.vue \
  data-query-app/layouts/default.vue \
  data-query-app/tests/admin-armor-attributes-page-contract.test.mjs
git commit -m "feat: add admin armor attributes page"
```

## Task 4: Integration Verification

**Files:**

- No code edits expected.

- [ ] **Step 1: Run focused backend and frontend tests**

Run:

```bash
cd back && mvn "-Dtest=AdminArmorAttributeControllerTest" test
cd ../data-query-app && node --test tests/admin-armor-attributes-page-contract.test.mjs
```

Expected: both pass.

- [ ] **Step 2: Run related regression tests**

Run:

```bash
cd data-query-app && node --test \
  tests/admin-armor-attributes-page-contract.test.mjs \
  tests/armor-sets-data-quality-contract.test.mjs \
  tests/domain-acceptance-page-contract.test.mjs
```

Expected: pass.

- [ ] **Step 3: Verify live DB contract with read-only SQL**

Use the local DB connection from `scripts/lib/local-runtime-config.mjs` and run:

```bash
NODE_PATH=/home/lolben/TerraPedia/data-query-app/node_modules node - <<'NODE'
const { createRequire } = require('module');
(async () => {
  const m = await import('./scripts/lib/local-runtime-config.mjs');
  const c = m.loadLocalStackConfig(process.cwd());
  const db = c.database || {};
  const mysql = createRequire('/home/lolben/TerraPedia/data-query-app/package.json')('mysql2/promise');
  const conn = await mysql.createConnection({
    host: db.host || '127.0.0.1',
    port: Number(db.port || 3306),
    user: db.username || 'root',
    password: db.password || 'root',
  });
  const [rows] = await conn.query(`
    SELECT a.item_id, a.item_internal_name, a.item_name_zh, a.slot_group, a.section_code, a.defense_value,
           COUNT(e.id) AS effect_count
    FROM terria_v1_relation.projection_item_armor_attributes a
    LEFT JOIN terria_v1_relation.projection_equipment_effect_attributes e
      ON e.deleted = 0
     AND e.owner_kind = 'item'
     AND e.source_kind = 'armor_attribute_cell'
     AND e.owner_id = a.item_id
    WHERE a.deleted = 0 AND a.item_name_zh = '神圣面具'
    GROUP BY a.item_id, a.item_internal_name, a.item_name_zh, a.slot_group, a.section_code, a.defense_value
  `);
  console.log(JSON.stringify(rows, null, 2));
  await conn.end();
  if (!rows[0] || rows[0].defense_value !== 24 || Number(rows[0].effect_count) !== 3) process.exit(1);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
```

Expected output includes:

```json
{
  "item_internal_name": "HallowedMask",
  "item_name_zh": "神圣面具",
  "slot_group": "head",
  "section_code": "hardmode",
  "defense_value": 24,
  "effect_count": 3
}
```

- [ ] **Step 4: Optional live admin verification**

Only run this if the local stack is intended to be restarted for this task.

Preferred command:

```bash
bash scripts/dev/stop-local-stack.sh
bash scripts/dev/start-local-stack.sh
bash scripts/dev/verify-local-stack.sh
```

Then open:

```text
http://127.0.0.1:<admin-port>/operations/armor-attributes
```

Verify:

- Searching `神圣面具` shows one row.
- Row defense displays `24`.
- Row internal name displays `HallowedMask`.
- Detail drawer raw cells include `meleeDamage`, `meleeCritChance`, `classSpecific`.
- Detail drawer structured effects include `damage_bonus`, `crit_chance`, `melee_speed`.

- [ ] **Step 5: Final status and commit check**

Run:

```bash
git status --short --branch
git log --oneline -3
```

Expected:

- Worktree has no unstaged implementation changes.
- Recent commits include:
  - `feat: expose admin armor attributes`
  - `feat: add admin armor attributes page`

## Acceptance Checklist

- [ ] Admin backend has read-only armor attribute summary/list/detail APIs.
- [ ] Admin frontend has `/operations/armor-attributes`.
- [ ] Sidebar includes `盔甲属性表`.
- [ ] Page shows concrete fields, not prose-only descriptions.
- [ ] `神圣面具` sample shows defense `24`.
- [ ] Detail view shows raw cells and structured equipment effects.
- [ ] No admin edit/write action exists for this data.
- [ ] Focused backend and frontend tests pass.
- [ ] Live DB read-only verification passes.

## Risks And Notes

- The backend controller uses cross-database reads from `terria_v1_relation`. If a local environment uses a different relation DB name, this controller should be extended later to read a config property, but this plan keeps the first implementation aligned with the current relation scripts and public service queries.
- The admin page is intentionally read-only. Manual correction should be a separate override-table feature, not a direct edit of wiki projection rows.
- Current `18088` backend may be an older process from the main worktree. If live API returns 404 for the new admin route, restart the local stack on the branch containing these commits.

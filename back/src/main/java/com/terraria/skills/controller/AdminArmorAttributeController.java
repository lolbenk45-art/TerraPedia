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
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/admin/armor-attributes")
@RequiredArgsConstructor
@Tag(name = "AdminArmorAttributes", description = "Read-only wiki armor attribute inspection")
@SecurityRequirement(name = "bearerAuth")
public class AdminArmorAttributeController {

    private static final String ARMOR_TABLE = "`terria_v1_relation`.`projection_item_armor_attributes`";
    private static final String EFFECT_TABLE = "`terria_v1_relation`.`projection_equipment_effect_attributes`";
    private static final TypeReference<Map<String, Object>> RAW_CELLS_TYPE = new TypeReference<>() {
    };

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    @GetMapping("/summary")
    @Operation(summary = "Get armor attribute projection summary")
    public ResponseEntity<ApiResponse<Map<String, Object>>> summary() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("totalRows", scalar("SELECT COUNT(*) FROM " + ARMOR_TABLE + " WHERE deleted = 0"));
        data.put("matchedItemRows", scalar("SELECT COUNT(*) FROM " + ARMOR_TABLE + " WHERE deleted = 0 AND item_id IS NOT NULL"));
        data.put("unmatchedItemRows", scalar("SELECT COUNT(*) FROM " + ARMOR_TABLE + " WHERE deleted = 0 AND item_id IS NULL"));
        data.put("effectRows", scalar("SELECT COUNT(*) FROM " + EFFECT_TABLE + " WHERE deleted = 0 AND owner_kind = 'item' AND source_kind = 'armor_attribute_cell'"));
        data.put("rowsWithDefense", scalar("SELECT COUNT(*) FROM " + ARMOR_TABLE + " WHERE deleted = 0 AND defense_value IS NOT NULL"));
        data.put("rowsWithEffects", scalar("""
            SELECT COUNT(DISTINCT owner_id)
            FROM """ + EFFECT_TABLE + """
            WHERE deleted = 0
              AND owner_kind = 'item'
              AND source_kind = 'armor_attribute_cell'
              AND owner_id IS NOT NULL
            """));
        data.put("slotCounts", groupedCounts("slot_group"));
        data.put("sectionCounts", groupedCounts("section_code"));
        return ResponseEntity.ok(ApiResponse.success(data));
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
        List<Object> args = new ArrayList<>();
        String where = buildWhere(search, slotGroup, sectionCode, hasDefense, args);
        String effectsFilter = buildEffectsFilter(hasEffects);

        Long total = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM " + ARMOR_TABLE + " a" + where + effectsFilter,
            Long.class,
            args.toArray()
        );

        List<Object> rowArgs = new ArrayList<>(args);
        rowArgs.add((safePage - 1) * safeLimit);
        rowArgs.add(safeLimit);
        String listSql = "SELECT a.id, a.item_id, a.item_internal_name, a.item_name_zh, a.item_page_title, a.item_href, "
            + "a.slot_group, a.section_code, a.defense_value, a.raw_cells_json, "
            + "a.source_provider, a.source_page, a.source_revision_timestamp, "
            + "(SELECT COUNT(*) FROM " + EFFECT_TABLE + " e "
            + "WHERE e.deleted = 0 AND e.owner_kind = 'item' "
            + "AND e.source_kind = 'armor_attribute_cell' AND e.owner_id = a.item_id) AS effect_count "
            + "FROM " + ARMOR_TABLE + " a"
            + where + effectsFilter
            + " ORDER BY a.section_code ASC, a.slot_group ASC, a.item_name_zh ASC, a.id ASC "
            + "LIMIT ?, ?";
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(listSql, rowArgs.toArray());

        ApiResponse<List<Map<String, Object>>> response = ApiResponse.success(rows.stream()
            .map(this::toAttributePayload)
            .toList());
        response.setPagination(new Pagination(total == null ? 0L : total, safePage, safeLimit));
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{itemId}")
    @Operation(summary = "Get wiki armor attribute detail by item id")
    public ResponseEntity<ApiResponse<Map<String, Object>>> detail(
        @PathVariable Long itemId,
        @RequestParam(required = false) Long attributeRowId
    ) {
        String detailSql = "SELECT a.id, a.item_id, a.item_internal_name, a.item_name_zh, a.item_page_title, a.item_href, "
            + "a.slot_group, a.section_code, a.defense_value, a.raw_cells_json, "
            + "a.source_provider, a.source_page, a.source_revision_timestamp, "
            + "(SELECT COUNT(*) FROM " + EFFECT_TABLE + " e "
            + "WHERE e.deleted = 0 AND e.owner_kind = 'item' "
            + "AND e.source_kind = 'armor_attribute_cell' AND e.owner_id = a.item_id) AS effect_count "
            + "FROM " + ARMOR_TABLE + " a "
            + "WHERE a.deleted = 0 AND a.item_id = ? "
            + (attributeRowId == null ? "" : "AND a.id = ? ")
            + "ORDER BY a.id ASC";
        List<Map<String, Object>> rows = attributeRowId == null
            ? jdbcTemplate.queryForList(detailSql, itemId)
            : jdbcTemplate.queryForList(detailSql, itemId, attributeRowId);
        if (rows.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error(404, "Armor attribute row not found"));
        }

        String effectsSql = "SELECT id, owner_id, item_internal_name, owner_kind, owner_key, source_kind, source_line, "
            + "source_line_index, effect_index, apply_scope, slot_type, stat_key, stat_label_zh, "
            + "class_scope, operation, value_decimal, value_max_decimal, unit, condition_text, raw_text, parse_status "
            + "FROM " + EFFECT_TABLE + " "
            + "WHERE deleted = 0 AND owner_kind = 'item' AND source_kind = 'armor_attribute_cell' AND owner_id = ? "
            + "ORDER BY effect_index ASC, id ASC";
        List<Map<String, Object>> effects = jdbcTemplate.queryForList(effectsSql, itemId);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("attribute", toAttributePayload(rows.get(0)));
        data.put("effects", effects.stream().map(this::toEffectPayload).toList());
        return ResponseEntity.ok(ApiResponse.success(data));
    }

    private long scalar(String sql) {
        Long value = jdbcTemplate.queryForObject(sql, Long.class);
        return value == null ? 0L : value;
    }

    private Map<String, Long> groupedCounts(String columnName) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            "SELECT " + columnName + ", COUNT(*) AS total FROM " + ARMOR_TABLE
                + " WHERE deleted = 0 GROUP BY " + columnName + " ORDER BY " + columnName
        );
        Map<String, Long> counts = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            counts.put(text(row.get(columnName)), toLong(row.get("total")));
        }
        return counts;
    }

    private String buildWhere(
        String search,
        String slotGroup,
        String sectionCode,
        Boolean hasDefense,
        List<Object> args
    ) {
        List<String> filters = new ArrayList<>();
        filters.add("a.deleted = 0");
        if (hasText(search)) {
            filters.add("(a.item_name_zh LIKE ? OR a.item_internal_name LIKE ? OR a.item_page_title LIKE ?)");
            String keyword = "%" + search.trim() + "%";
            args.add(keyword);
            args.add(keyword);
            args.add(keyword);
        }
        if (hasText(slotGroup)) {
            filters.add("a.slot_group = ?");
            args.add(slotGroup.trim());
        }
        if (hasText(sectionCode)) {
            filters.add("a.section_code = ?");
            args.add(sectionCode.trim());
        }
        if (Boolean.TRUE.equals(hasDefense)) {
            filters.add("a.defense_value IS NOT NULL");
        } else if (Boolean.FALSE.equals(hasDefense)) {
            filters.add("a.defense_value IS NULL");
        }
        return " WHERE " + String.join(" AND ", filters);
    }

    private String buildEffectsFilter(Boolean hasEffects) {
        if (hasEffects == null) {
            return "";
        }
        String exists = "EXISTS (SELECT 1 FROM " + EFFECT_TABLE + " e "
            + "WHERE e.deleted = 0 AND e.owner_kind = 'item' "
            + "AND e.source_kind = 'armor_attribute_cell' AND e.owner_id = a.item_id)";
        return Boolean.TRUE.equals(hasEffects) ? " AND " + exists : " AND NOT " + exists;
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

    private Map<String, Object> parseRawCells(Object rawCellsJson) {
        if (rawCellsJson == null) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(String.valueOf(rawCellsJson), RAW_CELLS_TYPE);
        } catch (Exception exception) {
            log.debug("Failed to parse armor raw cells JSON", exception);
            return Map.of("parseError", true, "raw", String.valueOf(rawCellsJson));
        }
    }

    private static boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private static String text(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static String timestampText(Object value) {
        if (value instanceof Timestamp timestamp) {
            return timestamp.toInstant().toString().replace("Z", "");
        }
        return text(value);
    }

    private static Long toLongObject(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        return Long.parseLong(String.valueOf(value));
    }

    private static long toLong(Object value) {
        Long result = toLongObject(value);
        return result == null ? 0L : result;
    }

    private static Integer toIntegerObject(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        return Integer.parseInt(String.valueOf(value));
    }

    private static BigDecimal decimalObject(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof BigDecimal decimal) {
            return decimal;
        }
        if (value instanceof Number number) {
            return BigDecimal.valueOf(number.doubleValue());
        }
        return new BigDecimal(String.valueOf(value));
    }
}

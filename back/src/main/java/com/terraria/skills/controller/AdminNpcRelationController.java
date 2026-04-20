package com.terraria.skills.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.entity.Npc;
import com.terraria.skills.entity.NpcBuffRelation;
import com.terraria.skills.entity.NpcLootEntry;
import com.terraria.skills.entity.NpcShopCondition;
import com.terraria.skills.entity.NpcShopEntry;
import com.terraria.skills.mapper.NpcBuffRelationMapper;
import com.terraria.skills.mapper.NpcLootEntryMapper;
import com.terraria.skills.mapper.NpcMapper;
import com.terraria.skills.mapper.NpcShopConditionMapper;
import com.terraria.skills.mapper.NpcShopEntryMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/admin/npcs")
@RequiredArgsConstructor
@Tag(name = "AdminNpcRelations", description = "Admin NPC relation management")
@SecurityRequirement(name = "bearerAuth")
public class AdminNpcRelationController {

    private final NpcMapper npcMapper;
    private final NpcLootEntryMapper npcLootEntryMapper;
    private final NpcBuffRelationMapper npcBuffRelationMapper;
    private final NpcShopEntryMapper npcShopEntryMapper;
    private final NpcShopConditionMapper npcShopConditionMapper;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    @GetMapping("/{id}/loot")
    @Operation(summary = "Get NPC loot entries")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getNpcLoot(@PathVariable("id") Long npcId) {
        if (npcMapper.selectById(npcId) == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Npc not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(loadLoot(npcId)));
    }

    @GetMapping("/{id}/derived-loot")
    @Operation(summary = "Get derived NPC loot entries from item acquisition sources")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getNpcDerivedLoot(@PathVariable("id") Long npcId) {
        Npc npc = npcMapper.selectById(npcId);
        if (npc == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Npc not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(loadDerivedLoot(npc.getGameId(), npc.getName())));
    }

    @PutMapping("/{id}/loot")
    @Transactional
    @Operation(summary = "Replace NPC loot entries")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> replaceNpcLoot(
        @PathVariable("id") Long npcId,
        @RequestBody(required = false) Object request
    ) {
        if (npcMapper.selectById(npcId) == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Npc not found"));
        }
        npcLootEntryMapper.delete(new LambdaQueryWrapper<NpcLootEntry>().eq(NpcLootEntry::getNpcId, npcId));
        List<Map<String, Object>> rows = normalizeObjectList(request);
        for (int index = 0; index < rows.size(); index += 1) {
            Map<String, Object> row = rows.get(index);
            Long itemId = toLong(row.get("itemId"));
            Integer sourceItemId = toInteger(row.get("sourceItemId"));
            if (itemId == null && sourceItemId == null) {
                continue;
            }
            NpcLootEntry entry = new NpcLootEntry();
            entry.setNpcId(npcId);
            entry.setItemId(itemId);
            entry.setSourceItemId(sourceItemId);
            entry.setDropSourceKind(trimToNull(row.get("dropSourceKind")));
            entry.setQuantityMin(toInteger(row.get("quantityMin")));
            entry.setQuantityMax(toInteger(row.get("quantityMax")));
            entry.setQuantityText(trimToNull(row.get("quantityText")));
            entry.setChanceValue(toDecimal(row.get("chanceValue")));
            entry.setChanceText(trimToNull(row.get("chanceText")));
            entry.setConditions(trimToNull(row.get("conditions")));
            entry.setNotes(trimToNull(row.get("notes")));
            entry.setSortOrder(resolveSortOrder(row.get("sortOrder"), index));
            entry.setStatus(1);
            entry.setDeleted(0);
            npcLootEntryMapper.insert(entry);
        }
        return ResponseEntity.ok(ApiResponse.success(loadLoot(npcId), "Npc loot updated"));
    }

    @GetMapping("/{id}/buff-relations")
    @Operation(summary = "Get NPC buff relations")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getNpcBuffRelations(@PathVariable("id") Long npcId) {
        if (npcMapper.selectById(npcId) == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Npc not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(loadBuffRelations(npcId)));
    }

    @PutMapping("/{id}/buff-relations")
    @Transactional
    @Operation(summary = "Replace NPC buff relations")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> replaceNpcBuffRelations(
        @PathVariable("id") Long npcId,
        @RequestBody(required = false) Object request
    ) {
        if (npcMapper.selectById(npcId) == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Npc not found"));
        }
        npcBuffRelationMapper.delete(new LambdaQueryWrapper<NpcBuffRelation>().eq(NpcBuffRelation::getNpcId, npcId));
        List<Map<String, Object>> rows = normalizeObjectList(request);
        for (int index = 0; index < rows.size(); index += 1) {
            Map<String, Object> row = rows.get(index);
            Long buffId = toLong(row.get("buffId"));
            Integer buffSourceId = toInteger(row.get("buffSourceId"));
            if (buffId == null && buffSourceId == null) {
                continue;
            }
            NpcBuffRelation relation = new NpcBuffRelation();
            relation.setNpcId(npcId);
            relation.setBuffId(buffId);
            relation.setBuffSourceId(buffSourceId);
            relation.setRelationType(defaultIfBlank(trimToNull(row.get("relationType")), "inflicts"));
            relation.setDurationTicks(toInteger(row.get("durationTicks")));
            relation.setChanceValue(toDecimal(row.get("chanceValue")));
            relation.setChanceText(trimToNull(row.get("chanceText")));
            relation.setConditions(trimToNull(row.get("conditions")));
            relation.setNotes(trimToNull(row.get("notes")));
            relation.setSortOrder(resolveSortOrder(row.get("sortOrder"), index));
            relation.setStatus(1);
            relation.setDeleted(0);
            npcBuffRelationMapper.insert(relation);
        }
        return ResponseEntity.ok(ApiResponse.success(loadBuffRelations(npcId), "Npc buff relations updated"));
    }

    @GetMapping("/{id}/shop-entries")
    @Operation(summary = "Get NPC shop entries")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getNpcShopEntries(@PathVariable("id") Long npcId) {
        if (npcMapper.selectById(npcId) == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Npc not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(loadShopEntries(npcId)));
    }

    @PutMapping("/{id}/shop-entries")
    @Transactional
    @Operation(summary = "Replace NPC shop entries")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> replaceNpcShopEntries(
        @PathVariable("id") Long npcId,
        @RequestBody(required = false) Object request
    ) {
        if (npcMapper.selectById(npcId) == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Npc not found"));
        }
        List<NpcShopEntry> existingEntries = npcShopEntryMapper.selectList(new LambdaQueryWrapper<NpcShopEntry>().eq(NpcShopEntry::getNpcId, npcId));
        List<Long> existingIds = existingEntries.stream().map(NpcShopEntry::getId).filter(Objects::nonNull).toList();
        if (!existingIds.isEmpty()) {
            npcShopConditionMapper.delete(new LambdaQueryWrapper<NpcShopCondition>().in(NpcShopCondition::getShopEntryId, existingIds));
        }
        npcShopEntryMapper.delete(new LambdaQueryWrapper<NpcShopEntry>().eq(NpcShopEntry::getNpcId, npcId));

        List<Map<String, Object>> rows = normalizeObjectList(request);
        for (int index = 0; index < rows.size(); index += 1) {
            Map<String, Object> row = rows.get(index);
            Long itemId = toLong(row.get("itemId"));
            Integer sourceItemId = toInteger(row.get("sourceItemId"));
            if (itemId == null && sourceItemId == null) {
                continue;
            }
            NpcShopEntry entry = new NpcShopEntry();
            entry.setNpcId(npcId);
            entry.setItemId(itemId);
            entry.setSourceItemId(sourceItemId);
            entry.setPriceText(trimToNull(row.get("priceText")));
            entry.setNotes(trimToNull(row.get("notes")));
            entry.setSortOrder(resolveSortOrder(row.get("sortOrder"), index));
            entry.setStatus(1);
            entry.setDeleted(0);
            npcShopEntryMapper.insert(entry);

            List<Map<String, Object>> conditions = normalizeObjectList(row.get("conditions"));
            for (int conditionIndex = 0; conditionIndex < conditions.size(); conditionIndex += 1) {
                Map<String, Object> conditionRow = conditions.get(conditionIndex);
                String refType = normalizeConditionRefType(trimToNull(conditionRow.get("refType")));
                Long refId = toLong(conditionRow.get("refId"));
                if (refType == null || refId == null || refId <= 0) {
                    continue;
                }
                NpcShopCondition condition = new NpcShopCondition();
                condition.setShopEntryId(entry.getId());
                condition.setRefType(refType);
                condition.setRefId(refId);
                condition.setConditionRole(defaultIfBlank(trimToNull(conditionRow.get("conditionRole")), "required"));
                condition.setNotes(trimToNull(conditionRow.get("notes")));
                condition.setSortOrder(resolveSortOrder(conditionRow.get("sortOrder"), conditionIndex));
                npcShopConditionMapper.insert(condition);
            }
        }

        return ResponseEntity.ok(ApiResponse.success(loadShopEntries(npcId), "Npc shop entries updated"));
    }

    private List<Map<String, Object>> loadLoot(Long npcId) {
        return jdbcTemplate.queryForList(
            """
            SELECT
              nle.id,
              nle.item_id AS itemId,
              nle.source_item_id AS sourceItemId,
              nle.drop_source_kind AS dropSourceKind,
              nle.quantity_min AS quantityMin,
              nle.quantity_max AS quantityMax,
              nle.quantity_text AS quantityText,
              nle.chance_value AS chanceValue,
              nle.chance_text AS chanceText,
              nle.conditions,
              nle.notes,
              nle.sort_order AS sortOrder,
              i.name AS itemName,
              i.name_zh AS itemNameZh,
              i.internal_name AS itemInternalName,
              i.image AS itemImage
            FROM npc_loot_entries nle
            LEFT JOIN items i ON i.id = nle.item_id AND i.deleted = 0
            WHERE nle.npc_id = ? AND nle.deleted = 0
            ORDER BY nle.sort_order ASC, nle.id ASC
            """,
            npcId
        );
    }

    private List<Map<String, Object>> loadDerivedLoot(Long npcSourceId, String npcName) {
        if (jdbcTemplate == null) {
            return List.of();
        }
        if (npcSourceId != null && countDerivedLootBySourceId(npcSourceId) > 0) {
            return loadDerivedLootBySourceId(npcSourceId);
        }
        String normalizedNpcName = trimToNull(npcName);
        if (normalizedNpcName == null) {
            return List.of();
        }
        return loadDerivedLootByName(normalizedNpcName);
    }

    private List<Map<String, Object>> loadDerivedLootBySourceId(Long npcSourceId) {
        return jdbcTemplate.queryForList(
            """
            SELECT
              ias.id,
              ias.item_id AS itemId,
              ias.source_ref_id AS sourceRefId,
              ias.source_ref_name AS sourceRefName,
              ias.quantity_min AS quantityMin,
              ias.quantity_max AS quantityMax,
              ias.quantity_text AS quantityText,
              ias.chance_value AS chanceValue,
              ias.chance_text AS chanceText,
              ias.conditions,
              ias.notes,
              ias.source_page AS sourcePage,
              ias.source_revision_timestamp AS sourceRevisionTimestamp,
              ias.sort_order AS sortOrder,
              i.name AS itemName,
              i.name_zh AS itemNameZh,
              i.internal_name AS itemInternalName,
              i.image AS itemImage
            FROM item_acquisition_sources ias
            LEFT JOIN items i ON i.id = ias.item_id AND i.deleted = 0
            WHERE ias.source_type = 'drop'
              AND ias.source_ref_type = 'npc'
              AND ias.source_ref_id = ?
              AND ias.status = 1
              AND ias.deleted = 0
            ORDER BY ias.sort_order ASC, ias.id ASC
            """,
            npcSourceId
        );
    }

    private List<Map<String, Object>> loadDerivedLootByName(String npcName) {
        return jdbcTemplate.queryForList(
            """
            SELECT
              ias.id,
              ias.item_id AS itemId,
              ias.source_ref_id AS sourceRefId,
              ias.source_ref_name AS sourceRefName,
              ias.quantity_min AS quantityMin,
              ias.quantity_max AS quantityMax,
              ias.quantity_text AS quantityText,
              ias.chance_value AS chanceValue,
              ias.chance_text AS chanceText,
              ias.conditions,
              ias.notes,
              ias.source_page AS sourcePage,
              ias.source_revision_timestamp AS sourceRevisionTimestamp,
              ias.sort_order AS sortOrder,
              i.name AS itemName,
              i.name_zh AS itemNameZh,
              i.internal_name AS itemInternalName,
              i.image AS itemImage
            FROM item_acquisition_sources ias
            LEFT JOIN items i ON i.id = ias.item_id AND i.deleted = 0
            WHERE ias.source_type = 'drop'
              AND ias.source_ref_type = 'npc'
              AND ias.source_ref_id IS NULL
              AND LOWER(TRIM(ias.source_ref_name)) = LOWER(TRIM(?))
              AND ias.status = 1
              AND ias.deleted = 0
            ORDER BY ias.sort_order ASC, ias.id ASC
            """,
            npcName
        );
    }

    private int countDerivedLootBySourceId(Long npcSourceId) {
        if (npcSourceId == null || jdbcTemplate == null) {
            return 0;
        }
        Integer total = jdbcTemplate.queryForObject(
            """
            SELECT COUNT(*)
            FROM item_acquisition_sources
            WHERE source_type = 'drop'
              AND source_ref_type = 'npc'
              AND source_ref_id = ?
              AND status = 1
              AND deleted = 0
            """,
            Integer.class,
            npcSourceId
        );
        return total == null ? 0 : total;
    }

    private List<Map<String, Object>> loadBuffRelations(Long npcId) {
        return jdbcTemplate.queryForList(
            """
            SELECT
              nbr.id,
              nbr.buff_id AS buffId,
              nbr.buff_source_id AS buffSourceId,
              nbr.relation_type AS relationType,
              nbr.duration_ticks AS durationTicks,
              nbr.chance_value AS chanceValue,
              nbr.chance_text AS chanceText,
              nbr.conditions,
              nbr.notes,
              nbr.sort_order AS sortOrder,
              b.internal_name AS buffInternalName,
              b.english_name AS buffNameEn,
              b.name_zh AS buffNameZh,
              b.image AS buffImage
            FROM npc_buff_relations nbr
            LEFT JOIN buffs b ON b.id = nbr.buff_id AND b.deleted = 0
            WHERE nbr.npc_id = ? AND nbr.deleted = 0
            ORDER BY nbr.sort_order ASC, nbr.id ASC
            """,
            npcId
        );
    }

    private List<Map<String, Object>> loadShopEntries(Long npcId) {
        List<Map<String, Object>> entries = jdbcTemplate.queryForList(
            """
            SELECT
              nse.id,
              nse.item_id AS itemId,
              nse.source_item_id AS sourceItemId,
              nse.price_text AS priceText,
              nse.notes,
              nse.sort_order AS sortOrder,
              i.name AS itemName,
              i.name_zh AS itemNameZh,
              i.internal_name AS itemInternalName,
              i.image AS itemImage
            FROM npc_shop_entries nse
            LEFT JOIN items i ON i.id = nse.item_id AND i.deleted = 0
            WHERE nse.npc_id = ? AND nse.deleted = 0
            ORDER BY nse.sort_order ASC, nse.id ASC
            """,
            npcId
        );
        List<Long> entryIds = entries.stream().map(row -> toLong(row.get("id"))).filter(Objects::nonNull).toList();
        Map<Long, List<Map<String, Object>>> conditionMap = loadShopConditions(entryIds);
        for (Map<String, Object> entry : entries) {
            Long entryId = toLong(entry.get("id"));
            entry.put("conditions", conditionMap.getOrDefault(entryId, List.of()));
        }
        return entries;
    }

    private Map<Long, List<Map<String, Object>>> loadShopConditions(List<Long> entryIds) {
        if (entryIds == null || entryIds.isEmpty()) {
            return Collections.emptyMap();
        }
        String placeholders = entryIds.stream().map(id -> "?").collect(Collectors.joining(","));
        List<Object> args = new ArrayList<>(entryIds);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
            SELECT
              nsc.id,
              nsc.shop_entry_id AS shopEntryId,
              nsc.ref_type AS refType,
              nsc.ref_id AS refId,
              nsc.condition_role AS conditionRole,
              nsc.notes,
              nsc.sort_order AS sortOrder,
              b.code AS biomeCode,
              b.name_en AS biomeNameEn,
              b.name_zh AS biomeNameZh,
              wc.code AS contextCode,
              wc.name_en AS contextNameEn,
              wc.name_zh AS contextNameZh,
              wc.context_type AS contextType,
              gp.code AS gamePeriodCode,
              gp.display_name_en AS gamePeriodNameEn,
              gp.display_name_zh AS gamePeriodNameZh,
              ri.name AS refItemName,
              ri.name_zh AS refItemNameZh,
              ri.internal_name AS refItemInternalName
            FROM npc_shop_conditions nsc
            LEFT JOIN biomes b ON nsc.ref_type = 'BIOME' AND b.id = nsc.ref_id AND b.deleted = 0
            LEFT JOIN world_contexts wc ON nsc.ref_type = 'WORLD_CONTEXT' AND wc.id = nsc.ref_id AND wc.deleted = 0
            LEFT JOIN game_period gp ON nsc.ref_type = 'GAME_PERIOD' AND gp.id = nsc.ref_id AND gp.deleted = 0
            LEFT JOIN items ri ON nsc.ref_type = 'ITEM' AND ri.id = nsc.ref_id AND ri.deleted = 0
            WHERE nsc.shop_entry_id IN (%s)
            ORDER BY nsc.sort_order ASC, nsc.id ASC
            """.formatted(placeholders),
            args.toArray()
        );
        Map<Long, List<Map<String, Object>>> grouped = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            Long entryId = toLong(row.get("shopEntryId"));
            grouped.computeIfAbsent(entryId, ignored -> new ArrayList<>()).add(row);
        }
        return grouped;
    }

    private List<Map<String, Object>> normalizeObjectList(Object raw) {
        if (raw == null) {
            return List.of();
        }
        Object source = raw;
        if (raw instanceof String text) {
            try {
                source = objectMapper.readValue(text, new TypeReference<>() {});
            } catch (Exception exception) {
                return List.of();
            }
        }
        if (!(source instanceof List<?> list)) {
            return List.of();
        }
        List<Map<String, Object>> normalized = new ArrayList<>();
        for (Object entry : list) {
            if (entry instanceof Map<?, ?> map) {
                Map<String, Object> casted = new LinkedHashMap<>();
                map.forEach((key, value) -> casted.put(String.valueOf(key), value));
                normalized.add(casted);
            }
        }
        return normalized;
    }

    private int resolveSortOrder(Object rawSortOrder, int index) {
        Integer sortOrder = toInteger(rawSortOrder);
        return sortOrder == null ? index + 1 : sortOrder;
    }

    private String normalizeConditionRefType(String rawType) {
        if (rawType == null) {
            return null;
        }
        String normalized = rawType.trim().toUpperCase();
        return switch (normalized) {
            case "BIOME" -> "BIOME";
            case "WORLD_CONTEXT", "CONTEXT", "ENVIRONMENT", "MOON_PHASE" -> "WORLD_CONTEXT";
            case "GAME_PERIOD", "PERIOD" -> "GAME_PERIOD";
            case "ITEM" -> "ITEM";
            default -> null;
        };
    }

    private String defaultIfBlank(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private Integer toInteger(Object raw) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(raw).trim());
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private Long toLong(Object raw) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(raw).trim());
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private BigDecimal toDecimal(Object raw) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof BigDecimal decimal) {
            return decimal;
        }
        if (raw instanceof Number number) {
            return BigDecimal.valueOf(number.doubleValue());
        }
        try {
            return new BigDecimal(String.valueOf(raw).trim());
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private String trimToNull(Object raw) {
        if (raw == null) {
            return null;
        }
        String text = String.valueOf(raw).trim();
        return text.isEmpty() ? null : text;
    }
}

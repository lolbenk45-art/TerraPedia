package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.EquipmentEffectAttributeDTO;
import com.terraria.skills.dto.PublicArmorSetListDTO;
import com.terraria.skills.dto.PublicArmorSetQuery;
import com.terraria.skills.dto.PublicArmorSetRelatedItemDTO;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import com.terraria.skills.service.PublicArmorSetService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class PublicArmorSetServiceImpl implements PublicArmorSetService {

    private static final String RELATION_DATABASE_NAME = "terria_v1_relation";
    private static final String PROJECTION_ARMOR_SETS_TABLE = "projection_armor_sets";
    private static final String PROJECTION_EQUIPMENT_EFFECT_ATTRIBUTES_TABLE = "projection_equipment_effect_attributes";

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final ManagedImageUrlPolicy managedImageUrlPolicy;

    @Override
    public Page<PublicArmorSetListDTO> getPublicArmorSets(PublicArmorSetQuery query) {
        PublicArmorSetQuery safeQuery = query == null ? new PublicArmorSetQuery() : query;
        int page = Math.max(1, safeQuery.getPage());
        int limit = Math.max(1, safeQuery.getLimit());
        int offset = (page - 1) * limit;

        List<Object> args = new ArrayList<>();
        String where = buildWhereClause(safeQuery.getSearch(), args);
        String projectionTable = qualifiedProjectionTable();

        Long total = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM " + projectionTable + where,
            Long.class,
            args.toArray()
        );

        List<Object> queryArgs = new ArrayList<>(args);
        queryArgs.add(offset);
        queryArgs.add(limit);
        String listSql = """
            SELECT id, text_key, source_key, name, name_zh, name_en, primary_part, set_count, unique_item_count,
                   benefit_zh, benefit_en, male_images, female_images, special_images, related_items_json
            FROM %s
            %s
            ORDER BY id ASC
            LIMIT ?, ?
            """.formatted(projectionTable, where);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            listSql,
            queryArgs.toArray()
        );

        Page<PublicArmorSetListDTO> result = new Page<>(page, limit, total == null ? 0 : total);
        Map<Long, String> fallbackImagesByItemId = resolveFallbackImagesByItemId(rows);
        Map<Long, List<EquipmentEffectAttributeDTO>> effectsByArmorSetId = resolveEffectsByArmorSetId(rows);
        result.setRecords(rows.stream().map(row -> toListDto(row, fallbackImagesByItemId, effectsByArmorSetId)).toList());
        return result;
    }

    @Override
    public PublicArmorSetListDTO getPublicArmorSetById(Long id) {
        if (id == null || id <= 0) {
            return null;
        }

        String detailSql = """
            SELECT id, text_key, source_key, name, name_zh, name_en, primary_part, set_count, unique_item_count,
                   benefit_zh, benefit_en, male_images, female_images, special_images, related_items_json
            FROM %s
            WHERE id = ?
            LIMIT 1
            """.formatted(qualifiedProjectionTable());
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(detailSql, id);
        if (rows.isEmpty()) {
            return null;
        }

        Map<Long, String> fallbackImagesByItemId = resolveFallbackImagesByItemId(rows);
        Map<Long, List<EquipmentEffectAttributeDTO>> effectsByArmorSetId = resolveEffectsByArmorSetId(rows);
        return toListDto(rows.get(0), fallbackImagesByItemId, effectsByArmorSetId);
    }

    private String buildWhereClause(String search, List<Object> args) {
        if (search == null || search.isBlank()) {
            return "";
        }
        String pattern = "%" + search.trim() + "%";
        for (int index = 0; index < 5; index += 1) {
            args.add(pattern);
        }
        return """
            WHERE (
              text_key LIKE ? OR source_key LIKE ? OR name LIKE ? OR name_zh LIKE ? OR name_en LIKE ?
            )
            """;
    }

    private String qualifiedProjectionTable() {
        return "`" + RELATION_DATABASE_NAME + "`.`" + PROJECTION_ARMOR_SETS_TABLE + "`";
    }

    private String qualifiedEquipmentEffectTable() {
        return "`" + RELATION_DATABASE_NAME + "`.`" + PROJECTION_EQUIPMENT_EFFECT_ATTRIBUTES_TABLE + "`";
    }

    private PublicArmorSetListDTO toListDto(
        Map<String, Object> row,
        Map<Long, String> fallbackImagesByItemId,
        Map<Long, List<EquipmentEffectAttributeDTO>> effectsByArmorSetId
    ) {
        PublicArmorSetListDTO dto = new PublicArmorSetListDTO();
        dto.setId(toLong(row.get("id")));
        dto.setTextKey(trimToNull(row.get("text_key")));
        dto.setSourceKey(trimToNull(row.get("source_key")));
        dto.setName(firstNonBlank(trimToNull(row.get("name_zh")), trimToNull(row.get("name")), trimToNull(row.get("name_en")), trimToNull(row.get("text_key"))));
        dto.setNameZh(trimToNull(row.get("name_zh")));
        dto.setNameEn(trimToNull(row.get("name_en")));
        dto.setBenefitZh(trimToNull(row.get("benefit_zh")));
        dto.setBenefitEn(trimToNull(row.get("benefit_en")));
        dto.setPrimaryPart(trimToNull(row.get("primary_part")));
        dto.setSetCount(toInteger(row.get("set_count")));
        dto.setUniqueItemCount(toInteger(row.get("unique_item_count")));
        dto.setMaleImages(filterManagedImages(parseJsonArray(row.get("male_images"))));
        dto.setFemaleImages(filterManagedImages(parseJsonArray(row.get("female_images"))));
        dto.setSpecialImages(filterManagedImages(parseJsonArray(row.get("special_images"))));
        if (dto.getMaleImages().isEmpty() && dto.getFemaleImages().isEmpty() && dto.getSpecialImages().isEmpty()) {
            dto.setFallbackImages(resolveFallbackImages(row, fallbackImagesByItemId));
        }
        dto.setRelatedItems(parseRelatedItems(row.get("related_items_json")));
        dto.setEffects(effectsByArmorSetId.getOrDefault(dto.getId(), List.of()));
        return dto;
    }

    private Map<Long, List<EquipmentEffectAttributeDTO>> resolveEffectsByArmorSetId(List<Map<String, Object>> rows) {
        Set<Long> armorSetIds = new LinkedHashSet<>();
        for (Map<String, Object> row : rows) {
            Long id = toLong(row.get("id"));
            if (id != null && id > 0) {
                armorSetIds.add(id);
            }
        }
        if (armorSetIds.isEmpty()) {
            return Map.of();
        }

        String placeholders = String.join(",", armorSetIds.stream().map(id -> "?").toList());
        String effectSql = """
            SELECT owner_id, stat_key, stat_label_zh, class_scope, operation, value_decimal, value_max_decimal,
                   unit, apply_scope, variant_label, item_internal_name, slot_type, condition_text,
                   raw_text, parse_status
            FROM %s
            WHERE deleted = 0
              AND status = 1
              AND owner_kind = 'armor_set'
              AND owner_id IN (%s)
            ORDER BY owner_id ASC, id ASC
            """.formatted(qualifiedEquipmentEffectTable(), placeholders);
        List<Map<String, Object>> effectRows = jdbcTemplate.queryForList(
            effectSql,
            armorSetIds.toArray()
        );

        Map<Long, List<EquipmentEffectAttributeDTO>> result = new LinkedHashMap<>();
        for (Map<String, Object> effectRow : effectRows) {
            Long ownerId = toLong(effectRow.get("owner_id"));
            if (ownerId == null) {
                continue;
            }
            result.computeIfAbsent(ownerId, ignored -> new ArrayList<>()).add(toEffectDto(effectRow));
        }
        return result;
    }

    private EquipmentEffectAttributeDTO toEffectDto(Map<String, Object> row) {
        EquipmentEffectAttributeDTO dto = new EquipmentEffectAttributeDTO();
        dto.setStatKey(trimToNull(row.get("stat_key")));
        dto.setStatLabelZh(trimToNull(row.get("stat_label_zh")));
        dto.setClassScope(trimToNull(row.get("class_scope")));
        dto.setOperation(trimToNull(row.get("operation")));
        dto.setValueDecimal(toBigDecimal(row.get("value_decimal")));
        dto.setValueMaxDecimal(toBigDecimal(row.get("value_max_decimal")));
        dto.setUnit(trimToNull(row.get("unit")));
        dto.setApplyScope(trimToNull(row.get("apply_scope")));
        dto.setVariantLabel(trimToNull(row.get("variant_label")));
        dto.setItemInternalName(trimToNull(row.get("item_internal_name")));
        dto.setSlotType(trimToNull(row.get("slot_type")));
        dto.setConditionText(trimToNull(row.get("condition_text")));
        dto.setRawText(trimToNull(row.get("raw_text")));
        dto.setParseStatus(trimToNull(row.get("parse_status")));
        return dto;
    }

    private Map<Long, String> resolveFallbackImagesByItemId(List<Map<String, Object>> rows) {
        Set<Long> itemIds = new LinkedHashSet<>();
        for (Map<String, Object> row : rows) {
            itemIds.addAll(extractRelatedItemIds(row.get("related_items_json")));
        }
        if (itemIds.isEmpty()) {
            return Map.of();
        }

        String placeholders = String.join(",", itemIds.stream().map(id -> "?").toList());
        List<Map<String, Object>> imageRows = jdbcTemplate.queryForList(
            """
            SELECT item_id, cached_url
            FROM item_images
            WHERE deleted = 0
              AND status = 1
              AND cached_url IS NOT NULL
              AND item_id IN (""" + placeholders + """
              )
            ORDER BY item_id ASC, is_primary DESC, sort_order ASC, id ASC
            """,
            itemIds.toArray()
        );

        Map<Long, String> result = new LinkedHashMap<>();
        for (Map<String, Object> imageRow : imageRows) {
            Long itemId = toLong(imageRow.get("item_id"));
            String imageUrl = trimToNull(imageRow.get("cached_url"));
            if (itemId != null && !result.containsKey(itemId) && imageUrl != null && managedImageUrlPolicy.isManagedImageUrl(imageUrl)) {
                result.put(itemId, imageUrl);
            }
        }
        return result;
    }

    private List<String> resolveFallbackImages(Map<String, Object> row, Map<Long, String> fallbackImagesByItemId) {
        if (fallbackImagesByItemId == null || fallbackImagesByItemId.isEmpty()) {
            return List.of();
        }
        List<String> images = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (Long itemId : extractRelatedItemIds(row.get("related_items_json"))) {
            String imageUrl = fallbackImagesByItemId.get(itemId);
            if (imageUrl != null && seen.add(imageUrl)) {
                images.add(imageUrl);
            }
        }
        return images;
    }

    private List<Long> extractRelatedItemIds(Object raw) {
        String text = trimToNull(raw);
        if (text == null) {
            return List.of();
        }
        try {
            Object parsed = objectMapper.readValue(text, Object.class);
            if (parsed instanceof List<?> list) {
                List<Long> ids = new ArrayList<>();
                for (Object entry : list) {
                    if (entry instanceof Map<?, ?> map) {
                        Long id = firstLong(map.get("itemId"), map.get("item_id"), map.get("id"), map.get("sourceId"), map.get("source_id"));
                        if (id != null && id > 0) {
                            ids.add(id);
                        }
                    }
                }
                return ids;
            }
        } catch (Exception ignored) {
        }
        return List.of();
    }

    private List<PublicArmorSetRelatedItemDTO> parseRelatedItems(Object raw) {
        String text = trimToNull(raw);
        if (text == null) {
            return List.of();
        }
        try {
            Object parsed = objectMapper.readValue(text, Object.class);
            if (parsed instanceof List<?> list) {
                List<PublicArmorSetRelatedItemDTO> items = new ArrayList<>();
                for (Object entry : list) {
                    if (!(entry instanceof Map<?, ?> map)) {
                        continue;
                    }
                    PublicArmorSetRelatedItemDTO item = new PublicArmorSetRelatedItemDTO();
                    item.setId(firstLong(map.get("id"), map.get("itemId"), map.get("item_id"), map.get("sourceId"), map.get("source_id")));
                    item.setItemId(firstLong(map.get("itemId"), map.get("item_id"), map.get("id"), map.get("sourceId"), map.get("source_id")));
                    item.setSourceId(firstLong(map.get("sourceId"), map.get("source_id"), map.get("itemId"), map.get("item_id"), map.get("id")));
                    item.setInternalName(trimToNull(firstValue(map, "internalName", "internal_name")));
                    item.setName(trimToNull(map.get("name")));
                    item.setNameZh(trimToNull(firstValue(map, "nameZh", "name_zh")));
                    item.setImage(managedImageOrNull(firstValue(map, "image", "imageUrl", "image_url", "cachedUrl", "cached_url")));
                    item.setPartRole(trimToNull(firstValue(map, "partRole", "part_role")));
                    item.setSlotType(trimToNull(firstValue(map, "slotType", "slot_type")));
                    items.add(item);
                }
                return items;
            }
        } catch (Exception ignored) {
        }
        return List.of();
    }

    private Object firstValue(Map<?, ?> map, String... keys) {
        for (String key : keys) {
            Object value = map.get(key);
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private String managedImageOrNull(Object value) {
        String imageUrl = trimToNull(value);
        return imageUrl != null && managedImageUrlPolicy.isManagedImageUrl(imageUrl) ? imageUrl : null;
    }

    private List<String> filterManagedImages(List<String> values) {
        return values.stream()
            .map(this::trimToNull)
            .filter(value -> value != null && managedImageUrlPolicy.isManagedImageUrl(value))
            .toList();
    }

    private List<String> parseJsonArray(Object raw) {
        String text = trimToNull(raw);
        if (text == null) {
            return List.of();
        }
        try {
            Object parsed = objectMapper.readValue(text, Object.class);
            if (parsed instanceof List<?> list) {
                return list.stream().map(this::stringify).filter(value -> value != null && !value.isBlank()).toList();
            }
        } catch (Exception ignored) {
        }
        return List.of(text);
    }

    private Long toLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        String text = trimToNull(value);
        if (text == null) {
            return null;
        }
        try {
            return Long.parseLong(text);
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private Integer toInteger(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        String text = trimToNull(value);
        if (text == null) {
            return null;
        }
        try {
            return Integer.parseInt(text);
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private BigDecimal toBigDecimal(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof BigDecimal decimal) {
            return decimal;
        }
        if (value instanceof Number number) {
            return BigDecimal.valueOf(number.doubleValue());
        }
        String text = trimToNull(value);
        if (text == null) {
            return null;
        }
        try {
            return new BigDecimal(text);
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private String stringify(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private Long firstLong(Object... values) {
        if (values == null) {
            return null;
        }
        for (Object value : values) {
            Long parsed = toLong(value);
            if (parsed != null) {
                return parsed;
            }
        }
        return null;
    }

    private String trimToNull(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }
}

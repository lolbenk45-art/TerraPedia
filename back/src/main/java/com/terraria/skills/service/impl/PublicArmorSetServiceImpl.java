package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.PublicArmorSetListDTO;
import com.terraria.skills.dto.PublicArmorSetQuery;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import com.terraria.skills.service.PublicArmorSetService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class PublicArmorSetServiceImpl implements PublicArmorSetService {

    private static final String RELATION_DATABASE_NAME = "terria_v1_relation";
    private static final String PROJECTION_ARMOR_SETS_TABLE = "projection_armor_sets";

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
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
            SELECT id, text_key, source_key, name, name_zh, name_en, primary_part, set_count, unique_item_count,
                   male_images, female_images, special_images
            FROM """ + projectionTable + where + """
            ORDER BY id ASC
            LIMIT ?, ?
            """,
            queryArgs.toArray()
        );

        Page<PublicArmorSetListDTO> result = new Page<>(page, limit, total == null ? 0 : total);
        result.setRecords(rows.stream().map(this::toListDto).toList());
        return result;
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

    private PublicArmorSetListDTO toListDto(Map<String, Object> row) {
        PublicArmorSetListDTO dto = new PublicArmorSetListDTO();
        dto.setId(toLong(row.get("id")));
        dto.setTextKey(trimToNull(row.get("text_key")));
        dto.setSourceKey(trimToNull(row.get("source_key")));
        dto.setName(firstNonBlank(trimToNull(row.get("name_zh")), trimToNull(row.get("name")), trimToNull(row.get("name_en")), trimToNull(row.get("text_key"))));
        dto.setNameZh(trimToNull(row.get("name_zh")));
        dto.setNameEn(trimToNull(row.get("name_en")));
        dto.setPrimaryPart(trimToNull(row.get("primary_part")));
        dto.setSetCount(toInteger(row.get("set_count")));
        dto.setUniqueItemCount(toInteger(row.get("unique_item_count")));
        dto.setMaleImages(filterManagedImages(parseJsonArray(row.get("male_images"))));
        dto.setFemaleImages(filterManagedImages(parseJsonArray(row.get("female_images"))));
        dto.setSpecialImages(filterManagedImages(parseJsonArray(row.get("special_images"))));
        return dto;
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

    private String stringify(Object value) {
        return value == null ? null : String.valueOf(value);
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

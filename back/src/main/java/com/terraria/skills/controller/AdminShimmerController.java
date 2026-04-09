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
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/admin/shimmer")
@RequiredArgsConstructor
@Tag(name = "AdminShimmer", description = "Admin shimmer dataset management")
@SecurityRequirement(name = "bearerAuth")
public class AdminShimmerController {

    private static final String SOURCE_PROVIDER = "wiki_zh";
    private static final String SOURCE_PAGE = "\u5fae\u5149";

    private static final Map<String, DatasetSpec> DATASETS = Map.of(
        "item-transforms",
        new DatasetSpec(
            "item-transforms",
            "shimmer_item_transforms",
            List.of("input_name_zh", "input_name_en", "input_internal_name", "output_name_zh", "output_name_en", "output_internal_name", "notes"),
            List.of(
                new ColumnDef("inputKind", "input_kind", ValueType.TEXT, true),
                new ColumnDef("inputNameZh", "input_name_zh", ValueType.TEXT, true),
                new ColumnDef("inputNameEn", "input_name_en", ValueType.TEXT, false),
                new ColumnDef("inputInternalName", "input_internal_name", ValueType.TEXT, false),
                new ColumnDef("outputKind", "output_kind", ValueType.TEXT, true),
                new ColumnDef("outputNameZh", "output_name_zh", ValueType.TEXT, true),
                new ColumnDef("outputNameEn", "output_name_en", ValueType.TEXT, false),
                new ColumnDef("outputInternalName", "output_internal_name", ValueType.TEXT, false),
                new ColumnDef("conditionsJson", "conditions_json", ValueType.JSON, false),
                new ColumnDef("notes", "notes", ValueType.TEXT, false),
                new ColumnDef("sortOrder", "sort_order", ValueType.NUMBER, false),
                new ColumnDef("status", "status", ValueType.NUMBER, false)
            )
        ),
        "decraft-rules",
        new DatasetSpec(
            "decraft-rules",
            "shimmer_decraft_rules",
            List.of("rule_type", "group_label", "input_name_zh", "input_name_en", "notes"),
            List.of(
                new ColumnDef("ruleType", "rule_type", ValueType.TEXT, true),
                new ColumnDef("groupLabel", "group_label", ValueType.TEXT, false),
                new ColumnDef("inputKind", "input_kind", ValueType.TEXT, true),
                new ColumnDef("inputNameZh", "input_name_zh", ValueType.TEXT, true),
                new ColumnDef("inputNameEn", "input_name_en", ValueType.TEXT, false),
                new ColumnDef("inputInternalName", "input_internal_name", ValueType.TEXT, false),
                new ColumnDef("outputsJson", "outputs_json", ValueType.JSON, false),
                new ColumnDef("conditionsJson", "conditions_json", ValueType.JSON, false),
                new ColumnDef("notes", "notes", ValueType.TEXT, false),
                new ColumnDef("sortOrder", "sort_order", ValueType.NUMBER, false),
                new ColumnDef("status", "status", ValueType.NUMBER, false)
            )
        ),
        "entity-transforms",
        new DatasetSpec(
            "entity-transforms",
            "shimmer_entity_transforms",
            List.of("transform_group", "input_name_zh", "input_name_en", "output_name_zh", "output_name_en"),
            List.of(
                new ColumnDef("transformGroup", "transform_group", ValueType.TEXT, true),
                new ColumnDef("inputEntityType", "input_entity_type", ValueType.TEXT, false),
                new ColumnDef("inputNameZh", "input_name_zh", ValueType.TEXT, true),
                new ColumnDef("inputNameEn", "input_name_en", ValueType.TEXT, false),
                new ColumnDef("inputInternalName", "input_internal_name", ValueType.TEXT, false),
                new ColumnDef("outputEntityType", "output_entity_type", ValueType.TEXT, false),
                new ColumnDef("outputNameZh", "output_name_zh", ValueType.TEXT, true),
                new ColumnDef("outputNameEn", "output_name_en", ValueType.TEXT, false),
                new ColumnDef("outputInternalName", "output_internal_name", ValueType.TEXT, false),
                new ColumnDef("sortOrder", "sort_order", ValueType.NUMBER, false),
                new ColumnDef("status", "status", ValueType.NUMBER, false)
            )
        ),
        "npc-transforms",
        new DatasetSpec(
            "npc-transforms",
            "shimmer_npc_transforms",
            List.of("npc_name_zh", "npc_name_en", "npc_internal_name", "notes"),
            List.of(
                new ColumnDef("npcNameZh", "npc_name_zh", ValueType.TEXT, true),
                new ColumnDef("npcNameEn", "npc_name_en", ValueType.TEXT, false),
                new ColumnDef("npcInternalName", "npc_internal_name", ValueType.TEXT, false),
                new ColumnDef("appearanceVariant", "appearance_variant", ValueType.TEXT, false),
                new ColumnDef("effectType", "effect_type", ValueType.TEXT, false),
                new ColumnDef("variantImageUrl", "variant_image_url", ValueType.TEXT, false),
                new ColumnDef("variantImageAlt", "variant_image_alt", ValueType.TEXT, false),
                new ColumnDef("notes", "notes", ValueType.TEXT, false),
                new ColumnDef("sortOrder", "sort_order", ValueType.NUMBER, false),
                new ColumnDef("status", "status", ValueType.NUMBER, false)
            )
        )
    );

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    @GetMapping("/overview")
    @Operation(summary = "Get shimmer admin overview")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getOverview() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("context", loadShimmerContext());
        payload.put("datasets", loadDatasetCounts());
        payload.put("manifest", loadManifestSnapshot());
        return ResponseEntity.ok(ApiResponse.success(payload));
    }

    @GetMapping("/context")
    @Operation(summary = "Get shimmer world context")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getContext() {
        Map<String, Object> context = loadShimmerContext();
        if (context == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Shimmer context not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(context));
    }

    @PutMapping("/context")
    @Transactional
    @Operation(summary = "Update shimmer world context")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateContext(@RequestBody Map<String, Object> request) {
        Map<String, Object> existing = loadShimmerContext();
        if (existing == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Shimmer context not found"));
        }

        String nameEn = firstValue(request, "nameEn", "name_en", trimToNull(existing.get("nameEn")));
        String nameZh = firstValue(request, "nameZh", "name_zh", trimToNull(existing.get("nameZh")));
        String contextType = firstValue(request, "contextType", "context_type", trimToNull(existing.get("contextType")));
        String description = firstValue(request, "description", null, trimToNull(existing.get("description")));
        String iconUrl = firstValue(request, "iconUrl", "icon_url", trimToNull(existing.get("iconUrl")));
        Integer sortOrder = firstInteger(request, "sortOrder", "sort_order", toInteger(existing.get("sortOrder"), 30));
        Integer status = firstInteger(request, "status", null, toInteger(existing.get("status"), 1));

        jdbcTemplate.update(
            """
                UPDATE world_contexts
                   SET name_en = ?,
                       name_zh = ?,
                       context_type = ?,
                       description = ?,
                       icon_url = ?,
                       sort_order = ?,
                       status = ?,
                       updated_at = NOW()
                 WHERE code = ?
                """,
            nameEn,
            nameZh,
            contextType,
            description,
            iconUrl,
            sortOrder,
            status,
            "SHIMMER"
        );

        return ResponseEntity.ok(ApiResponse.success(loadShimmerContext(), "Shimmer context updated"));
    }

    @GetMapping("/datasets/{dataset}")
    @Operation(summary = "Get shimmer dataset rows")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listDatasetRows(
        @PathVariable String dataset,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String search
    ) {
        DatasetSpec spec = requireDataset(dataset);
        int safePage = PaginationParams.resolvePage(page);
        int safeLimit = PaginationParams.resolveLimit(limit, size, 20, 200);
        String keyword = trimToNull(search);

        String whereSql = buildWhereSql(spec, keyword);
        List<Object> params = buildParams(spec, keyword);
        Long total = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM " + spec.tableName + " " + whereSql,
            Long.class,
            params.toArray()
        );

        List<Object> pageParams = new ArrayList<>(params);
        pageParams.add((safePage - 1L) * safeLimit);
        pageParams.add(safeLimit);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            "SELECT " + buildSelectColumns(spec) + " FROM " + spec.tableName + " " + whereSql + " ORDER BY sort_order ASC, id ASC LIMIT ?, ?",
            pageParams.toArray()
        );

        ApiResponse<List<Map<String, Object>>> response = ApiResponse.success(rows);
        response.setPagination(new Pagination(total == null ? 0 : total, safePage, safeLimit));
        return ResponseEntity.ok(response);
    }

    @GetMapping("/datasets/{dataset}/{id}")
    @Operation(summary = "Get shimmer dataset detail")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getDatasetRow(@PathVariable String dataset, @PathVariable Long id) {
        DatasetSpec spec = requireDataset(dataset);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            "SELECT " + buildSelectColumns(spec) + " FROM " + spec.tableName + " WHERE id = ? AND deleted = 0 AND source_provider = ? AND source_page = ? LIMIT 1",
            id,
            SOURCE_PROVIDER,
            SOURCE_PAGE
        );
        if (rows.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Shimmer row not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(rows.get(0)));
    }

    @PostMapping("/datasets/{dataset}")
    @Transactional
    @Operation(summary = "Create shimmer dataset row")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createDatasetRow(@PathVariable String dataset, @RequestBody Map<String, Object> request) {
        DatasetSpec spec = requireDataset(dataset);
        validatePayload(spec, request);

        List<Object> values = buildColumnValues(spec, request, true);
        jdbcTemplate.update(
            "INSERT INTO " + spec.tableName + " (" + buildInsertColumns(spec) + ", source_provider, source_page, source_revision_timestamp, deleted, created_at, updated_at) VALUES (" + buildInsertPlaceholders(spec) + ", ?, ?, ?, 0, NOW(), NOW())",
            appendCommonValues(values, request)
        );

        Long createdId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(loadDatasetRow(spec, createdId), "Shimmer row created"));
    }

    @PutMapping("/datasets/{dataset}/{id}")
    @Transactional
    @Operation(summary = "Update shimmer dataset row")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateDatasetRow(@PathVariable String dataset, @PathVariable Long id, @RequestBody Map<String, Object> request) {
        DatasetSpec spec = requireDataset(dataset);
        Map<String, Object> existing = loadDatasetRow(spec, id);
        if (existing == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Shimmer row not found"));
        }
        validatePayload(spec, mergeWithExisting(spec, existing, request));

        List<Object> values = buildColumnValues(spec, request, false, existing);
        List<Object> params = new ArrayList<>(values);
        String sourceRevisionTimestamp = firstValue(request, "sourceRevisionTimestamp", "source_revision_timestamp", trimToNull(existing.get("sourceRevisionTimestamp")));
        params.add(sourceRevisionTimestamp);
        params.add(id);
        jdbcTemplate.update(
            "UPDATE " + spec.tableName + " SET " + buildUpdateSql(spec) + ", source_revision_timestamp = ?, updated_at = NOW() WHERE id = ?",
            params.toArray()
        );
        return ResponseEntity.ok(ApiResponse.success(loadDatasetRow(spec, id), "Shimmer row updated"));
    }

    @DeleteMapping("/datasets/{dataset}/{id}")
    @Transactional
    @Operation(summary = "Delete shimmer dataset row")
    public ResponseEntity<ApiResponse<Void>> deleteDatasetRow(@PathVariable String dataset, @PathVariable Long id) {
        DatasetSpec spec = requireDataset(dataset);
        Map<String, Object> existing = loadDatasetRow(spec, id);
        if (existing == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Shimmer row not found"));
        }
        jdbcTemplate.update("UPDATE " + spec.tableName + " SET deleted = 1, updated_at = NOW() WHERE id = ?", id);
        return ResponseEntity.ok(ApiResponse.success(null, "Shimmer row deleted"));
    }

    private DatasetSpec requireDataset(String dataset) {
        DatasetSpec spec = DATASETS.get(trimToNull(dataset));
        if (spec == null) {
            throw new IllegalArgumentException("Unsupported shimmer dataset: " + dataset);
        }
        return spec;
    }

    private Map<String, Object> loadShimmerContext() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
                SELECT id,
                       code,
                       name_en AS nameEn,
                       name_zh AS nameZh,
                       context_type AS contextType,
                       description,
                       icon_url AS iconUrl,
                       sort_order AS sortOrder,
                       status,
                       updated_at AS updatedAt
                  FROM world_contexts
                 WHERE code = 'SHIMMER'
                   AND deleted = 0
                 LIMIT 1
                """
        );
        return rows.isEmpty() ? null : rows.get(0);
    }

    private List<Map<String, Object>> loadDatasetCounts() {
        List<Map<String, Object>> counts = new ArrayList<>();
        for (DatasetSpec spec : DATASETS.values()) {
            Long count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM " + spec.tableName + " WHERE deleted = 0 AND source_provider = ? AND source_page = ?",
                Long.class,
                SOURCE_PROVIDER,
                SOURCE_PAGE
            );
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("dataset", spec.key);
            row.put("count", count == null ? 0 : count);
            counts.add(row);
        }
        return counts;
    }

    private Map<String, Object> loadManifestSnapshot() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
                SELECT id, payload_json AS payloadJson, parse_status AS parseStatus, updated_at AS updatedAt
                  FROM entity_source_snapshots
                 WHERE entity_type = 'wiki_shimmer_manifest'
                   AND provider = ?
                   AND source_page = ?
                   AND is_current = 1
                 ORDER BY id DESC
                 LIMIT 1
                """,
            SOURCE_PROVIDER,
            SOURCE_PAGE
        );
        if (rows.isEmpty()) {
            return Map.of("parseStatus", "missing", "unresolvedCount", 0);
        }

        Map<String, Object> row = new LinkedHashMap<>(rows.get(0));
        try {
            Map<String, Object> payload = objectMapper.readValue(String.valueOf(row.get("payloadJson")), new TypeReference<>() {});
            Object resolution = payload.get("resolution");
            if (resolution instanceof Map<?, ?> resolutionMap) {
                row.put("unresolvedCount", toInteger(resolutionMap.get("unresolvedCount"), 0));
            } else {
                row.put("unresolvedCount", 0);
            }
        } catch (Exception ignored) {
            row.put("unresolvedCount", 0);
        }
        return row;
    }

    private String buildWhereSql(DatasetSpec spec, String keyword) {
        StringBuilder builder = new StringBuilder("WHERE deleted = 0 AND source_provider = ? AND source_page = ?");
        if (keyword != null) {
            builder.append(" AND (");
            for (int index = 0; index < spec.searchableColumns.size(); index += 1) {
                if (index > 0) {
                    builder.append(" OR ");
                }
                builder.append(spec.searchableColumns.get(index)).append(" LIKE ?");
            }
            builder.append(')');
        }
        return builder.toString();
    }

    private List<Object> buildParams(DatasetSpec spec, String keyword) {
        List<Object> params = new ArrayList<>();
        params.add(SOURCE_PROVIDER);
        params.add(SOURCE_PAGE);
        if (keyword != null) {
            String like = "%" + keyword + "%";
            for (int index = 0; index < spec.searchableColumns.size(); index += 1) {
                params.add(like);
            }
        }
        return params;
    }

    private String buildSelectColumns(DatasetSpec spec) {
        List<String> columns = new ArrayList<>();
        columns.add("id");
        for (ColumnDef column : spec.columns) {
            columns.add(column.columnName + " AS " + column.requestKey);
        }
        columns.add("source_provider AS sourceProvider");
        columns.add("source_page AS sourcePage");
        columns.add("source_revision_timestamp AS sourceRevisionTimestamp");
        columns.add("updated_at AS updatedAt");
        return String.join(", ", columns);
    }

    private String buildInsertColumns(DatasetSpec spec) {
        List<String> columns = new ArrayList<>();
        columns.add("context_code");
        for (ColumnDef column : spec.columns) {
            columns.add(column.columnName);
        }
        return String.join(", ", columns);
    }

    private String buildInsertPlaceholders(DatasetSpec spec) {
        List<String> placeholders = new ArrayList<>();
        placeholders.add("?");
        placeholders.addAll(spec.columns.stream().map(column -> "?").toList());
        return String.join(", ", placeholders);
    }

    private String buildUpdateSql(DatasetSpec spec) {
        return String.join(", ", spec.columns.stream().map(column -> column.columnName + " = ?").toList());
    }

    private List<Object> buildColumnValues(DatasetSpec spec, Map<String, Object> request, boolean creating) {
        return buildColumnValues(spec, request, creating, Map.of());
    }

    private List<Object> buildColumnValues(DatasetSpec spec, Map<String, Object> request, boolean creating, Map<String, Object> existing) {
        List<Object> values = new ArrayList<>();
        for (ColumnDef column : spec.columns) {
            Object rawValue = request.containsKey(column.requestKey)
                ? request.get(column.requestKey)
                : existing.get(column.requestKey);
            values.add(normalizeValue(column.type, rawValue, column.required, creating));
        }
        return values;
    }

    private Object[] appendCommonValues(List<Object> values, Map<String, Object> request) {
        List<Object> payload = new ArrayList<>(values);
        payload.add(0, "SHIMMER");
        payload.add(SOURCE_PROVIDER);
        payload.add(SOURCE_PAGE);
        payload.add(firstValue(request, "sourceRevisionTimestamp", "source_revision_timestamp"));
        return payload.toArray();
    }

    private void validatePayload(DatasetSpec spec, Map<String, Object> payload) {
        for (ColumnDef column : spec.columns) {
            Object value = payload.get(column.requestKey);
            if (column.required && trimToNull(value) == null) {
                throw new IllegalArgumentException(column.requestKey + " is required");
            }
            if (column.type == ValueType.JSON && trimToNull(value) != null) {
                try {
                    objectMapper.readTree(String.valueOf(value));
                } catch (Exception error) {
                    throw new IllegalArgumentException(column.requestKey + " must be valid JSON");
                }
            }
        }
    }

    private Map<String, Object> mergeWithExisting(DatasetSpec spec, Map<String, Object> existing, Map<String, Object> request) {
        Map<String, Object> merged = new LinkedHashMap<>();
        for (ColumnDef column : spec.columns) {
            merged.put(column.requestKey, request.containsKey(column.requestKey) ? request.get(column.requestKey) : existing.get(column.requestKey));
        }
        return merged;
    }

    private Object normalizeValue(ValueType type, Object rawValue, boolean required, boolean creating) {
        return switch (type) {
            case NUMBER -> rawValue == null || trimToNull(rawValue) == null
                ? (required && creating ? 0 : null)
                : toInteger(rawValue, 0);
            case JSON -> trimToNull(rawValue);
            case TEXT -> trimToNull(rawValue);
        };
    }

    private Map<String, Object> loadDatasetRow(DatasetSpec spec, Long id) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            "SELECT " + buildSelectColumns(spec) + " FROM " + spec.tableName + " WHERE id = ? AND deleted = 0 AND source_provider = ? AND source_page = ? LIMIT 1",
            id,
            SOURCE_PROVIDER,
            SOURCE_PAGE
        );
        return rows.isEmpty() ? null : rows.get(0);
    }

    private String firstValue(Map<String, Object> source, String primaryKey, String fallbackKey) {
        return firstValue(source, primaryKey, fallbackKey, null);
    }

    private String firstValue(Map<String, Object> source, String primaryKey, String fallbackKey, String fallback) {
        String primary = trimToNull(source == null ? null : source.get(primaryKey));
        if (primary != null) {
            return primary;
        }
        String alternate = fallbackKey == null ? null : trimToNull(source == null ? null : source.get(fallbackKey));
        return alternate != null ? alternate : fallback;
    }

    private Integer firstInteger(Map<String, Object> source, String primaryKey, String fallbackKey, Integer fallback) {
        if (source != null && source.containsKey(primaryKey)) {
            return toInteger(source.get(primaryKey), fallback == null ? 0 : fallback);
        }
        if (fallbackKey != null && source != null && source.containsKey(fallbackKey)) {
            return toInteger(source.get(fallbackKey), fallback == null ? 0 : fallback);
        }
        return fallback;
    }

    private Integer toInteger(Object value, int fallback) {
        if (value == null) {
            return fallback;
        }
        try {
            return Integer.parseInt(String.valueOf(value).trim());
        } catch (NumberFormatException error) {
            return fallback;
        }
    }

    private String trimToNull(Object value) {
        if (value == null) {
            return null;
        }
        String trimmed = String.valueOf(value).trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private record DatasetSpec(
        String key,
        String tableName,
        List<String> searchableColumns,
        List<ColumnDef> columns
    ) {
    }

    private record ColumnDef(
        String requestKey,
        String columnName,
        ValueType type,
        boolean required
    ) {
    }

    private enum ValueType {
        TEXT,
        NUMBER,
        JSON
    }
}

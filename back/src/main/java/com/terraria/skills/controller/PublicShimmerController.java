package com.terraria.skills.controller;

import com.terraria.skills.common.AdminTextUtils;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/public/shimmer")
@RequiredArgsConstructor
@Tag(name = "Public Shimmer", description = "Public read-only shimmer transformation data")
public class PublicShimmerController {

    private static final Set<String> VALID_DATASETS = Set.of(
        "item-transforms", "decraft-rules", "entity-transforms", "npc-transforms"
    );

    private static final Map<String, String> DATASET_TABLES = Map.of(
        "item-transforms",    "shimmer_item_transforms",
        "decraft-rules",      "shimmer_decraft_rules",
        "entity-transforms",  "shimmer_entity_transforms",
        "npc-transforms",     "shimmer_npc_transforms"
    );

    private static final Map<String, String> DATASET_SELECT = Map.of(
        "item-transforms",
            "id, input_kind AS inputKind, input_name_zh AS inputNameZh,"
            + " input_name_en AS inputNameEn, input_internal_name AS inputInternalName,"
            + " output_kind AS outputKind, output_name_zh AS outputNameZh,"
            + " output_name_en AS outputNameEn, output_internal_name AS outputInternalName,"
            + " conditions_json AS conditionsJson, notes, sort_order AS sortOrder",
        "decraft-rules",
            "id, rule_type AS ruleType, group_label AS groupLabel,"
            + " input_kind AS inputKind, input_name_zh AS inputNameZh,"
            + " input_name_en AS inputNameEn, input_internal_name AS inputInternalName,"
            + " outputs_json AS outputsJson, conditions_json AS conditionsJson,"
            + " notes, sort_order AS sortOrder",
        "entity-transforms",
            "id, transform_group AS transformGroup,"
            + " input_entity_type AS inputEntityType,"
            + " input_name_zh AS inputNameZh, input_name_en AS inputNameEn,"
            + " input_internal_name AS inputInternalName,"
            + " output_entity_type AS outputEntityType,"
            + " output_name_zh AS outputNameZh, output_name_en AS outputNameEn,"
            + " output_internal_name AS outputInternalName, sort_order AS sortOrder",
        "npc-transforms",
            "id, npc_name_zh AS npcNameZh, npc_name_en AS npcNameEn,"
            + " npc_internal_name AS npcInternalName,"
            + " appearance_variant AS appearanceVariant, effect_type AS effectType,"
            + " variant_image_url AS variantImageUrl, variant_image_alt AS variantImageAlt,"
            + " notes, sort_order AS sortOrder"
    );

    private static final Map<String, List<String>> DATASET_SEARCH_COLS = Map.of(
        "item-transforms",   List.of("input_name_zh", "input_name_en", "output_name_zh", "output_name_en"),
        "decraft-rules",     List.of("rule_type", "group_label", "input_name_zh", "input_name_en"),
        "entity-transforms", List.of("transform_group", "input_name_zh", "input_name_en", "output_name_zh", "output_name_en"),
        "npc-transforms",    List.of("npc_name_zh", "npc_name_en", "npc_internal_name")
    );

    private final JdbcTemplate jdbcTemplate;

    @GetMapping("/context")
    @Operation(summary = "Get shimmer world context")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getContext() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
                SELECT id, code, name_en AS nameEn, name_zh AS nameZh,
                       context_type AS contextType, description,
                       icon_url AS iconUrl, sort_order AS sortOrder
                  FROM world_contexts
                 WHERE code = 'SHIMMER'
                   AND deleted = 0
                   AND status = 1
                 LIMIT 1
                """
        );
        if (rows.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error(404, "Shimmer context not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(rows.get(0)));
    }

    @GetMapping("/overview")
    @Operation(summary = "Get shimmer dataset overview")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getOverview() {
        Map<String, Object> payload = new LinkedHashMap<>();
        List<Map<String, Object>> datasets = new ArrayList<>();
        for (String key : List.of("item-transforms", "decraft-rules", "entity-transforms", "npc-transforms")) {
            Long count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM " + DATASET_TABLES.get(key) + " WHERE deleted = 0 AND status = 1",
                Long.class
            );
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("dataset", key);
            entry.put("count", count == null ? 0L : count);
            datasets.add(entry);
        }
        payload.put("datasets", datasets);
        return ResponseEntity.ok(ApiResponse.success(payload));
    }

    @GetMapping("/datasets/{dataset}")
    @Operation(summary = "Get shimmer dataset rows (paginated)")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listDataset(
        @PathVariable String dataset,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String search
    ) {
        String key = AdminTextUtils.trimToNull(dataset);
        if (key == null || !VALID_DATASETS.contains(key)) {
            throw new IllegalArgumentException("Unsupported shimmer dataset: " + dataset);
        }

        String table    = DATASET_TABLES.get(key);
        String cols     = DATASET_SELECT.get(key);
        String keyword  = AdminTextUtils.trimToNull(search);
        int safePage    = PaginationParams.resolvePage(page);
        int safeLimit   = PaginationParams.resolveLimit(limit, size, 20, 200);

        List<Object> params = new ArrayList<>();
        String whereSql = buildWhere(key, keyword, params);

        Long total = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM " + table + " " + whereSql,
            Long.class,
            params.toArray()
        );

        List<Object> pageParams = new ArrayList<>(params);
        pageParams.add((long) (safePage - 1) * safeLimit);
        pageParams.add(safeLimit);

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            "SELECT " + cols + " FROM " + table + " " + whereSql
                + " ORDER BY sort_order ASC, id ASC LIMIT ?, ?",
            pageParams.toArray()
        );

        ApiResponse<List<Map<String, Object>>> response = ApiResponse.success(rows);
        response.setPagination(new Pagination(total == null ? 0L : total, safePage, safeLimit));
        return ResponseEntity.ok(response);
    }

    private String buildWhere(String datasetKey, String keyword, List<Object> params) {
        StringBuilder builder = new StringBuilder("WHERE deleted = 0 AND status = 1");
        if (keyword != null) {
            List<String> searchCols = DATASET_SEARCH_COLS.get(datasetKey);
            builder.append(" AND (");
            for (int i = 0; i < searchCols.size(); i++) {
                if (i > 0) {
                    builder.append(" OR ");
                }
                builder.append(searchCols.get(i)).append(" LIKE ?");
            }
            builder.append(")");
            String like = "%" + keyword + "%";
            for (String ignored : searchCols) {
                params.add(like);
            }
        }
        return builder.toString();
    }
}

package com.terraria.skills.controller;

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

import java.sql.Timestamp;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/public/audio")
@RequiredArgsConstructor
@Tag(name = "Public Audio", description = "Public read-only audio asset metadata APIs")
public class PublicAudioAssetController {

    // Columns safe to expose publicly: no local_path, source_url, mime, size_bytes
    private static final String LIST_SELECT =
        "id, asset_id AS assetId, shard, kind, source_key AS sourceKey,"
        + " display_name_zh AS displayNameZh, display_name_en AS displayNameEn,"
        + " file_title AS fileTitle, wiki_file_url AS wikiFileUrl,"
        + " sha256, status, last_verified_at AS lastVerifiedAt";

    private static final String DETAIL_SELECT =
        "id, asset_id AS assetId, shard, kind, source_key AS sourceKey,"
        + " display_name_zh AS displayNameZh, display_name_en AS displayNameEn,"
        + " file_title AS fileTitle, wiki_file_url AS wikiFileUrl,"
        + " sha256, status, provider, last_verified_at AS lastVerifiedAt,"
        + " created_at AS createdAt";

    private static final List<String> ACTIVE_STATUSES = List.of("active", "downloaded");

    private final JdbcTemplate jdbcTemplate;

    @GetMapping
    @Operation(summary = "List public audio assets (paginated)")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listAudioAssets(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String kind,
        @RequestParam(required = false) String shard,
        @RequestParam(required = false) String search
    ) {
        int safePage  = PaginationParams.resolvePage(page);
        int safeLimit = PaginationParams.resolveLimit(limit, size, 20, 100);

        List<Object> params  = new ArrayList<>();
        String whereSql = buildWhere(kind, shard, search, params);

        Long total = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM audio_assets " + whereSql,
            Long.class,
            params.toArray()
        );

        List<Object> pageParams = new ArrayList<>(params);
        pageParams.add((long) (safePage - 1) * safeLimit);
        pageParams.add(safeLimit);

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            "SELECT " + LIST_SELECT + " FROM audio_assets " + whereSql
                + " ORDER BY shard ASC, kind ASC, source_key ASC, id ASC LIMIT ?, ?",
            pageParams.toArray()
        );

        ApiResponse<List<Map<String, Object>>> response =
            ApiResponse.success(rows.stream().map(this::toPublicPayload).toList());
        response.setPagination(new Pagination(total == null ? 0L : total, safePage, safeLimit));
        return ResponseEntity.ok(response);
    }

    @GetMapping("/kinds")
    @Operation(summary = "List distinct audio asset kinds (active assets only)")
    public ResponseEntity<ApiResponse<List<String>>> listKinds() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            "SELECT DISTINCT kind FROM audio_assets"
                + " WHERE deleted = 0 AND status IN ('active','downloaded')"
                + " ORDER BY kind ASC"
        );
        List<String> kinds = rows.stream()
            .map(row -> String.valueOf(row.get("kind")))
            .filter(k -> !k.isBlank())
            .toList();
        return ResponseEntity.ok(ApiResponse.success(kinds));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get a single public audio asset by id")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getAudioAsset(@PathVariable Long id) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            "SELECT " + DETAIL_SELECT + " FROM audio_assets"
                + " WHERE id = ? AND deleted = 0 AND status IN ('active','downloaded')"
                + " LIMIT 1",
            id
        );
        if (rows.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error(404, "Audio asset not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(toPublicPayload(rows.get(0))));
    }

    private String buildWhere(String kind, String shard, String search, List<Object> params) {
        List<String> filters = new ArrayList<>();
        filters.add("deleted = 0");
        filters.add("status IN ('active','downloaded')");

        if (hasText(kind)) {
            filters.add("kind = ?");
            params.add(kind.trim());
        }
        if (hasText(shard)) {
            filters.add("shard = ?");
            params.add(shard.trim());
        }
        if (hasText(search)) {
            filters.add("(asset_id LIKE ? OR source_key LIKE ?"
                + " OR display_name_zh LIKE ? OR display_name_en LIKE ? OR file_title LIKE ?)");
            String like = "%" + search.trim() + "%";
            params.add(like);
            params.add(like);
            params.add(like);
            params.add(like);
            params.add(like);
        }
        return "WHERE " + String.join(" AND ", filters);
    }

    private Map<String, Object> toPublicPayload(Map<String, Object> row) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id",            toLongObject(row.get("id")));
        payload.put("assetId",       text(row.get("assetId")));
        payload.put("shard",         text(row.get("shard")));
        payload.put("kind",          text(row.get("kind")));
        payload.put("sourceKey",     text(row.get("sourceKey")));
        payload.put("displayNameZh", text(row.get("displayNameZh")));
        payload.put("displayNameEn", text(row.get("displayNameEn")));
        payload.put("fileTitle",     text(row.get("fileTitle")));
        payload.put("wikiFileUrl",   text(row.get("wikiFileUrl")));
        payload.put("sha256",        text(row.get("sha256")));
        payload.put("status",        text(row.get("status")));
        payload.put("lastVerifiedAt", timestampText(row.get("lastVerifiedAt")));
        // Detail-only fields
        if (row.containsKey("provider"))  { payload.put("provider",   text(row.get("provider"))); }
        if (row.containsKey("createdAt")) { payload.put("createdAt",  timestampText(row.get("createdAt"))); }
        return payload;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String text(Object value) {
        return value == null ? null : String.valueOf(value).trim().isEmpty() ? null : String.valueOf(value).trim();
    }

    private Long toLongObject(Object value) {
        if (value == null) { return null; }
        if (value instanceof Number n) { return n.longValue(); }
        try { return Long.valueOf(String.valueOf(value)); } catch (NumberFormatException e) { return null; }
    }

    private String timestampText(Object value) {
        if (value == null) { return null; }
        if (value instanceof Timestamp ts) {
            return DateTimeFormatter.ISO_INSTANT.format(ts.toInstant().atOffset(ZoneOffset.UTC));
        }
        return String.valueOf(value);
    }
}

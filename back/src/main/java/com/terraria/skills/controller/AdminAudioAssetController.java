package com.terraria.skills.controller;

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

@Slf4j
@RestController
@RequestMapping("/admin/audio-assets")
@RequiredArgsConstructor
@Tag(name = "AdminAudioAssets", description = "Read-only wiki audio asset inspection")
@SecurityRequirement(name = "bearerAuth")
public class AdminAudioAssetController {

    private final JdbcTemplate jdbcTemplate;

    @GetMapping("/summary")
    @Operation(summary = "Get audio asset import summary")
    public ResponseEntity<ApiResponse<Map<String, Object>>> summary() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("totalAssets", scalar("SELECT COUNT(*) FROM audio_assets WHERE deleted = 0"));
        data.put("totalLinks", scalar("SELECT COUNT(*) FROM audio_asset_links WHERE deleted = 0"));
        data.put("shardCounts", groupedCounts(
            "SELECT shard, COUNT(*) AS total FROM audio_assets WHERE deleted = 0 GROUP BY shard ORDER BY shard",
            "shard"
        ));
        data.put("matchStatusCounts", groupedCounts(
            "SELECT match_status, COUNT(*) AS total FROM audio_asset_links WHERE deleted = 0 GROUP BY match_status ORDER BY match_status",
            "match_status"
        ));
        return ResponseEntity.ok(ApiResponse.success(data));
    }

    @GetMapping
    @Operation(summary = "List wiki audio assets")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> list(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) String shard,
        @RequestParam(required = false) String kind,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String matchStatus
    ) {
        int safePage = PaginationParams.resolvePage(page);
        int safeLimit = PaginationParams.resolveLimit(limit, size, 20, 100);
        List<Object> args = new ArrayList<>();
        String where = buildWhere(search, shard, kind, status, matchStatus, args);

        Long total = jdbcTemplate.queryForObject(
            "SELECT COUNT(DISTINCT aa.id) FROM audio_assets aa "
                + "LEFT JOIN audio_asset_links aal ON aal.audio_asset_id = aa.id AND aal.deleted = 0"
                + where,
            Long.class,
            args.toArray()
        );

        List<Object> rowArgs = new ArrayList<>(args);
        rowArgs.add((safePage - 1) * safeLimit);
        rowArgs.add(safeLimit);
        String listSql = """
            SELECT aa.id,
                   aa.asset_id,
                   aa.shard,
                   aa.kind,
                   aa.source_key,
                   aa.file_title,
                   aa.wiki_file_url,
                   aa.source_url,
                   aa.local_path,
                   aa.mime,
                   aa.size_bytes,
                   aa.sha256,
                   aa.status,
                   aa.last_verified_at,
                   COUNT(aal.id) AS link_count,
                   GROUP_CONCAT(DISTINCT aal.match_status ORDER BY aal.match_status SEPARATOR ',') AS match_statuses
            FROM audio_assets aa
            LEFT JOIN audio_asset_links aal ON aal.audio_asset_id = aa.id AND aal.deleted = 0
            """
            + where
            + """
             GROUP BY aa.id, aa.asset_id, aa.shard, aa.kind, aa.source_key, aa.file_title,
                      aa.wiki_file_url, aa.source_url, aa.local_path, aa.mime, aa.size_bytes,
                      aa.sha256, aa.status, aa.last_verified_at
             ORDER BY aa.shard ASC, aa.kind ASC, aa.source_key ASC, aa.id ASC
             LIMIT ?, ?
            """;

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(listSql, rowArgs.toArray());
        ApiResponse<List<Map<String, Object>>> response = ApiResponse.success(rows.stream()
            .map(this::toAudioAssetPayload)
            .toList());
        response.setPagination(new Pagination(total == null ? 0L : total, safePage, safeLimit));
        return ResponseEntity.ok(response);
    }

    private long scalar(String sql) {
        Long value = jdbcTemplate.queryForObject(sql, Long.class);
        return value == null ? 0L : value;
    }

    private Map<String, Long> groupedCounts(String sql, String keyColumn) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql);
        Map<String, Long> counts = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            counts.put(text(row.get(keyColumn)), toLong(row.get("total")));
        }
        return counts;
    }

    private String buildWhere(
        String search,
        String shard,
        String kind,
        String status,
        String matchStatus,
        List<Object> args
    ) {
        List<String> filters = new ArrayList<>();
        filters.add("aa.deleted = 0");
        if (hasText(search)) {
            filters.add("(aa.asset_id LIKE ? OR aa.source_key LIKE ? OR aa.file_title LIKE ?)");
            String keyword = "%" + search.trim() + "%";
            args.add(keyword);
            args.add(keyword);
            args.add(keyword);
        }
        if (hasText(shard)) {
            filters.add("aa.shard = ?");
            args.add(shard.trim());
        }
        if (hasText(kind)) {
            filters.add("aa.kind = ?");
            args.add(kind.trim());
        }
        if (hasText(status)) {
            filters.add("aa.status = ?");
            args.add(status.trim());
        }
        if (hasText(matchStatus)) {
            filters.add("aal.match_status = ?");
            args.add(matchStatus.trim());
        }
        return " WHERE " + String.join(" AND ", filters);
    }

    private Map<String, Object> toAudioAssetPayload(Map<String, Object> row) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", toLongObject(row.get("id")));
        payload.put("assetId", text(row.get("asset_id")));
        payload.put("shard", text(row.get("shard")));
        payload.put("kind", text(row.get("kind")));
        payload.put("sourceKey", text(row.get("source_key")));
        payload.put("fileTitle", text(row.get("file_title")));
        payload.put("wikiFileUrl", text(row.get("wiki_file_url")));
        payload.put("sourceUrl", text(row.get("source_url")));
        payload.put("localPath", safeLocalPath(row.get("local_path")));
        payload.put("mime", text(row.get("mime")));
        payload.put("sizeBytes", toLongObject(row.get("size_bytes")));
        payload.put("sha256", text(row.get("sha256")));
        payload.put("status", text(row.get("status")));
        payload.put("lastVerifiedAt", timestampText(row.get("last_verified_at")));
        payload.put("linkCount", toLong(row.get("link_count")));
        payload.put("matchStatuses", text(row.get("match_statuses")));
        return payload;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String text(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private String safeLocalPath(Object value) {
        String path = text(value).trim();
        if (path.isEmpty()
            || path.startsWith("/")
            || path.startsWith("\\\\")
            || path.matches("^[A-Za-z]:[\\\\/].*")) {
            return "";
        }
        return path;
    }

    private Long toLongObject(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        return Long.valueOf(String.valueOf(value));
    }

    private long toLong(Object value) {
        Long number = toLongObject(value);
        return number == null ? 0L : number;
    }

    private String timestampText(Object value) {
        if (value == null) {
            return "";
        }
        if (value instanceof Timestamp timestamp) {
            return DateTimeFormatter.ISO_INSTANT.format(timestamp.toInstant().atOffset(ZoneOffset.UTC));
        }
        return String.valueOf(value);
    }
}

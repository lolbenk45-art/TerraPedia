package com.terraria.skills.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.common.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

@RestController
@RequestMapping("/admin/recipe-imports")
@RequiredArgsConstructor
@Tag(name = "AdminWikiZhRecipeImport", description = "Admin zh recipe import overview")
@SecurityRequirement(name = "bearerAuth")
public class AdminWikiZhRecipeImportController {

    private static final String RECIPE_SOURCE_PROVIDER = "wiki_zh";
    private static final String PLACEHOLDER_ITEM_SOURCE_PROVIDER = "wiki_zh_recipe_import";

    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbcTemplate;

    @GetMapping("/wiki-zh")
    @Operation(summary = "Get zh recipe import overview")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getWikiZhRecipeImportOverview() {
        Path repoRoot = resolveRepoRoot();
        Path reportsDir = repoRoot.resolve("reports");
        Path latestReportPath = findLatestReport(reportsDir);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("sourceProvider", RECIPE_SOURCE_PROVIDER);
        payload.put("repoRoot", repoRoot.toString());
        payload.put("reportFound", latestReportPath != null);
        payload.put("reportFileName", latestReportPath == null ? null : latestReportPath.getFileName().toString());
        payload.put("reportPath", latestReportPath == null ? null : relativizeSafely(repoRoot, latestReportPath));
        payload.put("reportUpdatedAt", latestReportPath == null ? null : readLastModifiedIso(latestReportPath));
        payload.put("latestReport", latestReportPath == null ? Collections.emptyMap() : readReport(latestReportPath));
        payload.put("database", buildDatabaseSnapshot());
        payload.put("topSourcePages", loadTopSourcePages());
        payload.put("placeholderItems", loadPlaceholderItems());
        return ResponseEntity.ok(ApiResponse.success(payload));
    }

    private Map<String, Object> buildDatabaseSnapshot() {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("recipeCount", queryForLong(
            "SELECT COUNT(*) FROM recipes WHERE COALESCE(source_provider, '') = ?",
            RECIPE_SOURCE_PROVIDER
        ));
        snapshot.put("resultItemCount", queryForLong(
            "SELECT COUNT(DISTINCT result_item_id) FROM recipes WHERE COALESCE(source_provider, '') = ?",
            RECIPE_SOURCE_PROVIDER
        ));
        snapshot.put("placeholderItemCount", queryForLong(
            "SELECT COUNT(*) FROM items WHERE deleted = 0 AND COALESCE(source_provider, '') = ?",
            PLACEHOLDER_ITEM_SOURCE_PROVIDER
        ));
        snapshot.put("referencedStationCount", queryForLong(
            """
                SELECT COUNT(DISTINCT rs.station_id)
                  FROM recipe_stations rs
                  JOIN recipes r ON r.id = rs.recipe_id
                 WHERE COALESCE(r.source_provider, '') = ?
                   AND rs.station_id IS NOT NULL
                """,
            RECIPE_SOURCE_PROVIDER
        ));
        snapshot.put("unresolvedIngredientRows", queryForLong(
            """
                SELECT COUNT(*)
                  FROM recipe_ingredients ri
                  JOIN recipes r ON r.id = ri.recipe_id
                 WHERE COALESCE(r.source_provider, '') = ?
                   AND COALESCE(ri.ingredient_group_type, 'item') = 'item'
                   AND ri.ingredient_item_id IS NULL
                """,
            RECIPE_SOURCE_PROVIDER
        ));
        snapshot.put("unresolvedStationRows", queryForLong(
            """
                SELECT COUNT(*)
                  FROM recipe_stations rs
                  JOIN recipes r ON r.id = rs.recipe_id
                 WHERE COALESCE(r.source_provider, '') = ?
                   AND rs.station_id IS NULL
                """,
            RECIPE_SOURCE_PROVIDER
        ));
        return snapshot;
    }

    private List<Map<String, Object>> loadTopSourcePages() {
        return jdbcTemplate.query(
            """
                SELECT source_page AS sourcePage,
                       COUNT(*) AS recipeCount,
                       COUNT(DISTINCT result_item_id) AS resultItemCount
                  FROM recipes
                 WHERE COALESCE(source_provider, '') = ?
                   AND source_page IS NOT NULL
                   AND TRIM(source_page) <> ''
                 GROUP BY source_page
                 ORDER BY recipeCount DESC, source_page ASC
                 LIMIT 20
                """,
            (rs, rowNum) -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("sourcePage", rs.getString("sourcePage"));
                row.put("recipeCount", rs.getLong("recipeCount"));
                row.put("resultItemCount", rs.getLong("resultItemCount"));
                return row;
            },
            RECIPE_SOURCE_PROVIDER
        );
    }

    private List<Map<String, Object>> loadPlaceholderItems() {
        return jdbcTemplate.query(
            """
                SELECT id, internal_name AS internalName, name, name_zh AS nameZh, updated_at AS updatedAt
                  FROM items
                 WHERE deleted = 0
                   AND COALESCE(source_provider, '') = ?
                 ORDER BY id ASC
                 LIMIT 50
                """,
            (rs, rowNum) -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", rs.getLong("id"));
                row.put("internalName", rs.getString("internalName"));
                row.put("name", rs.getString("name"));
                row.put("nameZh", rs.getString("nameZh"));
                row.put("updatedAt", rs.getTimestamp("updatedAt") == null ? null : rs.getTimestamp("updatedAt").toInstant().toString());
                return row;
            },
            PLACEHOLDER_ITEM_SOURCE_PROVIDER
        );
    }

    private Long queryForLong(String sql, Object... args) {
        Long value = jdbcTemplate.queryForObject(sql, Long.class, args);
        return value == null ? 0L : value;
    }

    private Map<String, Object> readReport(Path reportPath) {
        if (reportPath == null || !Files.exists(reportPath)) {
            return Collections.emptyMap();
        }
        try {
            return objectMapper.readValue(reportPath.toFile(), new TypeReference<>() {});
        } catch (IOException ignored) {
            return Collections.emptyMap();
        }
    }

    private Path findLatestReport(Path reportsDir) {
        if (reportsDir == null || !Files.isDirectory(reportsDir)) {
            return null;
        }
        try (Stream<Path> stream = Files.list(reportsDir)) {
            return stream
                .filter(path -> Files.isRegularFile(path))
                .filter(path -> {
                    String fileName = path.getFileName().toString();
                    return fileName.startsWith("wiki-zh-recipe-import-") && fileName.endsWith(".json");
                })
                .max(Comparator.comparing(this::safeLastModifiedMillis))
                .orElse(null);
        } catch (IOException ignored) {
            return null;
        }
    }

    private long safeLastModifiedMillis(Path path) {
        try {
            return Files.getLastModifiedTime(path).toMillis();
        } catch (IOException ignored) {
            return Long.MIN_VALUE;
        }
    }

    private String readLastModifiedIso(Path path) {
        try {
            FileTime fileTime = Files.getLastModifiedTime(path);
            return fileTime.toInstant().toString();
        } catch (IOException ignored) {
            return null;
        }
    }

    private Path resolveRepoRoot() {
        List<Path> candidates = new ArrayList<>();
        Path cwd = Path.of("").toAbsolutePath().normalize();
        Path current = cwd;
        while (current != null) {
            candidates.add(current);
            current = current.getParent();
        }

        return candidates.stream()
            .filter(this::looksLikeRepoRoot)
            .findFirst()
            .orElse(cwd);
    }

    private boolean looksLikeRepoRoot(Path path) {
        return path != null
            && Files.exists(path.resolve("back"))
            && Files.exists(path.resolve("data-query-app"))
            && Files.exists(path.resolve("scripts"));
    }

    private String relativizeSafely(Path repoRoot, Path target) {
        if (repoRoot == null || target == null) {
            return null;
        }
        try {
            return repoRoot.relativize(target).toString().replace('\\', '/');
        } catch (IllegalArgumentException ignored) {
            return target.toString();
        }
    }
}

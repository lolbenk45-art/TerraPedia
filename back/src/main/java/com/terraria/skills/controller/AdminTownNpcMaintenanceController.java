package com.terraria.skills.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.TownNpcOverviewDTO;
import com.terraria.skills.service.SupportDomainService;
import com.terraria.skills.service.TownNpcMaintenanceDomainMapper;
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
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Stream;

@RestController
@RequestMapping("/admin/town-npcs")
@RequiredArgsConstructor
@Tag(name = "AdminTownNpcMaintenance", description = "Admin town NPC maintenance overview")
@SecurityRequirement(name = "bearerAuth")
public class AdminTownNpcMaintenanceController {

    private static final String REPORT_LATEST_FILE = "wiki-town-npc-maintenance.latest.json";
    private static final String REPORT_SNAPSHOT_PREFIX = "wiki-town-npc-maintenance-";
    private static final String REPORT_SNAPSHOT_SUFFIX = ".json";
    private static final String IMPORT_REPORT_LATEST_FILE = "wiki-town-npc-import.latest.json";
    private static final String IMPORT_REPORT_SNAPSHOT_PREFIX = "wiki-town-npc-import-";
    private static final String IMPORT_REPORT_SNAPSHOT_SUFFIX = ".json";

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final SupportDomainService supportDomainService;

    @GetMapping("/maintenance")
    @Operation(summary = "Get town NPC maintenance overview")
    public ResponseEntity<ApiResponse<TownNpcOverviewDTO>> getMaintenanceOverview() {
        Path repoRoot = resolveRepoRoot();
        ReportArtifact artifact = findLatestReportArtifact(
            repoRoot,
            REPORT_LATEST_FILE,
            REPORT_SNAPSHOT_PREFIX,
            REPORT_SNAPSHOT_SUFFIX
        );
        ReportArtifact importArtifact = findLatestReportArtifact(
            repoRoot,
            IMPORT_REPORT_LATEST_FILE,
            IMPORT_REPORT_SNAPSHOT_PREFIX,
            IMPORT_REPORT_SNAPSHOT_SUFFIX
        );
        Map<String, Object> report = artifact == null ? Collections.emptyMap() : readReport(artifact.path);
        Map<String, Object> importReport = importArtifact == null ? Collections.emptyMap() : readReport(importArtifact.path);
        Map<Long, Map<String, Object>> scrapedByGameId = buildScrapedRecordMap(report);
        Map<String, Map<String, Object>> itemLookup = loadItemLookup();
        List<Map<String, Object>> rows = loadTownNpcRows();

        for (Map<String, Object> row : rows) {
            enrichTownNpcRow(row, scrapedByGameId.get(toLong(row.get("gameId"))), itemLookup);
            row.put("imageUrl", loadNpcImageUrl(toLong(row.get("gameId"))));
            row.put("currentShopItems", loadCurrentShopItems(toLong(row.get("id"))));
            row.put("baseStats", loadNpcBaseStats(toLong(row.get("gameId"))));
        }

        TownNpcOverviewDTO payload = TownNpcMaintenanceDomainMapper.toOverview(
            artifact != null,
            artifact == null ? null : artifact.path.getFileName().toString(),
            artifact == null ? null : artifact.relativePath,
            artifact == null ? null : artifact.updatedAt,
            normalizeObject(report.getOrDefault("summary", Collections.emptyMap())),
            trimToNull(report.get("generatedAt")),
            trimToNull(report.get("sourceMode")),
            importArtifact != null,
            importArtifact == null ? null : importArtifact.path.getFileName().toString(),
            importArtifact == null ? null : importArtifact.relativePath,
            importArtifact == null ? null : importArtifact.updatedAt,
            normalizeObject(importReport),
            loadCoinIcons(),
            rows,
            buildSummary(rows)
        );
        return ResponseEntity.ok(ApiResponse.success(payload));
    }

    private List<Map<String, Object>> loadTownNpcRows() {
        return jdbcTemplate.query(
            """
                SELECT
                  n.id,
                  n.game_id AS gameId,
                  n.internal_name AS internalName,
                  n.name,
                  n.name_zh AS nameZh,
                  n.game_period_id AS gamePeriodId,
                  n.behavior_notes AS behaviorNotes,
                  n.updated_at AS updatedAt,
                  NULL AS categoryName,
                  (
                    SELECT COUNT(*)
                    FROM npc_shop_entries nse
                    WHERE nse.npc_id = n.id AND nse.deleted = 0
                  ) AS shopEntryCount
                FROM npcs n
                WHERE COALESCE(n.is_town_npc, 0) = 1
                ORDER BY COALESCE(n.game_period_id, 0) ASC, n.id ASC
                """,
            (rs, rowNum) -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", rs.getLong("id"));
                row.put("gameId", rs.getLong("gameId"));
                row.put("internalName", rs.getString("internalName"));
                row.put("name", rs.getString("name"));
                row.put("nameZh", rs.getString("nameZh"));
                row.put("gamePeriodId", rs.getObject("gamePeriodId"));
                row.put("behaviorNotes", rs.getString("behaviorNotes"));
                Timestamp updatedAt = rs.getTimestamp("updatedAt");
                row.put("updatedAt", updatedAt == null ? null : updatedAt.toInstant().toString());
                row.put("categoryName", rs.getString("categoryName"));
                row.put("shopEntryCount", rs.getLong("shopEntryCount"));
                return row;
            }
        );
    }

    private void enrichTownNpcRow(
        Map<String, Object> row,
        Map<String, Object> scraped,
        Map<String, Map<String, Object>> itemLookup
    ) {
        Long currentGamePeriodId = toLong(row.get("gamePeriodId"));
        String behaviorNotes = trimToNull(row.get("behaviorNotes"));
        int shopEntryCount = toInteger(row.get("shopEntryCount"), 0);

        row.put("gamePeriodLabel", supportDomainService.getGamePeriodLabel(currentGamePeriodId));
        row.put("hasBehaviorNotes", behaviorNotes != null);
        row.put("behaviorNotesPreview", previewText(behaviorNotes, 96));
        row.put("hasShopEntries", shopEntryCount > 0);
        row.put("wikiDetails", scraped == null ? Map.of() : normalizeObject(scraped.get("wikiDetails")));

        if (scraped == null || scraped.isEmpty()) {
            row.put("scrapeAvailable", false);
            row.put("scrapedFunctionSummary", null);
            row.put("scrapedMoveInSummary", null);
            row.put("scrapedMoveInConditions", List.of());
            row.put("scrapedShopItems", List.of());
            row.put("scrapedShopItemCount", 0);
            row.put("suggestedGamePeriodId", null);
            row.put("suggestedGamePeriodLabel", null);
            row.put("suggestedGamePeriodReason", null);
            row.put("suggestedBehaviorNotes", null);
            row.put("suggestedShopEntries", List.of());
            row.put("matchedSuggestedShopEntryCount", 0);
            row.put("unmatchedShopItems", List.of());
            row.put("sourcePageTitle", null);
            row.put("sourcePageUrl", null);
            return;
        }

        String functionSummary = trimToNull(scraped.get("functionSummary"));
        String moveInSummary = trimToNull(scraped.get("moveInSummary"));
        List<Map<String, Object>> moveInConditions = normalizeObjectList(scraped.get("moveInConditions"));
        List<Map<String, Object>> scrapedShopItems = normalizeObjectList(scraped.get("shopItems"));
        List<Map<String, Object>> suggestedShopEntries = buildSuggestedShopEntries(scrapedShopItems, itemLookup);
        List<Map<String, Object>> unmatchedShopItems = buildUnmatchedShopItems(scrapedShopItems, suggestedShopEntries);
        Long suggestedGamePeriodId = toLong(scraped.get("suggestedGamePeriodId"));

        row.put("scrapeAvailable", true);
        row.put("scrapedFunctionSummary", functionSummary);
        row.put("scrapedMoveInSummary", moveInSummary);
        row.put("scrapedMoveInConditions", moveInConditions);
        row.put("scrapedShopItems", scrapedShopItems);
        row.put("scrapedShopItemCount", scrapedShopItems.size());
        row.put("suggestedGamePeriodId", suggestedGamePeriodId);
        row.put("suggestedGamePeriodLabel", supportDomainService.getGamePeriodLabel(suggestedGamePeriodId));
        row.put("suggestedGamePeriodReason", trimToNull(scraped.get("suggestedGamePeriodReason")));
        row.put("suggestedBehaviorNotes", buildSuggestedBehaviorNotes(functionSummary, moveInSummary));
        row.put("suggestedShopEntries", suggestedShopEntries);
        row.put("matchedSuggestedShopEntryCount", suggestedShopEntries.size());
        row.put("unmatchedShopItems", unmatchedShopItems);
        row.put("sourcePageTitle", trimToNull(scraped.get("pageTitle")));
        row.put("sourcePageUrl", trimToNull(scraped.get("pageUrl")));
    }

    private Map<String, Object> buildSummary(List<Map<String, Object>> rows) {
        long total = rows.size();
        long missingGamePeriod = rows.stream().filter(row -> toLong(row.get("gamePeriodId")) == null || toLong(row.get("gamePeriodId")) == 0).count();
        long missingBehaviorNotes = rows.stream().filter(row -> trimToNull(row.get("behaviorNotes")) == null).count();
        long missingShopEntries = rows.stream().filter(row -> toInteger(row.get("shopEntryCount"), 0) <= 0).count();
        long scrapedCount = rows.stream().filter(row -> Boolean.TRUE.equals(row.get("scrapeAvailable"))).count();
        long suggestedShopCoverage = rows.stream().filter(row -> toInteger(row.get("matchedSuggestedShopEntryCount"), 0) > 0).count();

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalTownNpcs", total);
        summary.put("missingGamePeriodCount", missingGamePeriod);
        summary.put("missingBehaviorNotesCount", missingBehaviorNotes);
        summary.put("missingShopEntriesCount", missingShopEntries);
        summary.put("scrapedCount", scrapedCount);
        summary.put("suggestedShopCoverageCount", suggestedShopCoverage);
        return summary;
    }

    private Map<Long, Map<String, Object>> buildScrapedRecordMap(Map<String, Object> report) {
        Map<Long, Map<String, Object>> byGameId = new LinkedHashMap<>();
        for (Map<String, Object> row : normalizeObjectList(report.get("records"))) {
            Long gameId = toLong(row.get("gameId"));
            if (gameId != null) {
                byGameId.put(gameId, row);
            }
        }
        return byGameId;
    }

    private Map<String, Map<String, Object>> loadItemLookup() {
        Map<String, Map<String, Object>> lookup = new LinkedHashMap<>();
        jdbcTemplate.query(
            """
                SELECT id, internal_name AS internalName, name, name_zh AS nameZh
                     , image
                FROM items
                WHERE deleted = 0
                """,
            rs -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", rs.getLong("id"));
                row.put("internalName", rs.getString("internalName"));
                row.put("name", rs.getString("name"));
                row.put("nameZh", rs.getString("nameZh"));
                row.put("image", rs.getString("image"));
                rememberLookup(lookup, rs.getString("internalName"), row);
                rememberLookup(lookup, rs.getString("name"), row);
                rememberLookup(lookup, rs.getString("nameZh"), row);
            }
        );
        return lookup;
    }

    private Map<String, String> loadCoinIcons() {
        Map<String, String> icons = new LinkedHashMap<>();
        jdbcTemplate.query(
            """
                SELECT name, image
                FROM items
                WHERE deleted = 0
                  AND name IN ('Copper Coin', 'Silver Coin', 'Gold Coin', 'Platinum Coin')
                """,
            rs -> {
                String name = trimToNull(rs.getString("name"));
                String image = trimToNull(rs.getString("image"));
                if (name == null || image == null) {
                    return;
                }
                switch (name) {
                    case "Copper Coin" -> icons.put("copper", image);
                    case "Silver Coin" -> icons.put("silver", image);
                    case "Gold Coin" -> icons.put("gold", image);
                    case "Platinum Coin" -> icons.put("platinum", image);
                    default -> {
                    }
                }
            }
        );
        return icons;
    }

    private String loadNpcImageUrl(Long gameId) {
        if (gameId == null) {
            return null;
        }
        Path path = resolveDataFile(Path.of("generated", "npc-standardized-map.json"));
        if (path == null) {
            return null;
        }
        try {
            Map<String, Object> root = objectMapper.readValue(path.toFile(), new TypeReference<>() {});
            Object recordsRaw = root.get("records");
            if (!(recordsRaw instanceof Map<?, ?> records)) {
                return null;
            }
            Object raw = records.get(String.valueOf(gameId));
            if (!(raw instanceof Map<?, ?> map)) {
                return null;
            }
            Object imageUrl = map.get("imageUrl");
            if (imageUrl instanceof String text && !text.isBlank()) {
                return text.trim();
            }
            Object rawJson = map.get("rawJson");
            if (!(rawJson instanceof String rawJsonText) || rawJsonText.isBlank()) {
                return null;
            }
            Map<String, Object> parsed = objectMapper.readValue(rawJsonText, new TypeReference<>() {});
            return trimToNull(parsed.get("imageUrl"));
        } catch (Exception ignored) {
            return null;
        }
    }

    private List<Map<String, Object>> loadCurrentShopItems(Long npcId) {
        if (npcId == null) {
            return List.of();
        }
        return jdbcTemplate.query(
            """
                SELECT
                  nse.id,
                  nse.item_id AS itemId,
                  nse.price_text AS priceText,
                  nse.notes,
                  i.name,
                  i.name_zh AS nameZh,
                  i.internal_name AS internalName,
                  i.image AS image,
                  i.buy AS buyPrice,
                  i.sell AS sellPrice
                FROM npc_shop_entries nse
                LEFT JOIN items i ON i.id = nse.item_id AND i.deleted = 0
                WHERE nse.npc_id = ?
                  AND nse.deleted = 0
                ORDER BY nse.sort_order ASC, nse.id ASC
                """,
            (rs, rowNum) -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", rs.getLong("id"));
                row.put("itemId", rs.getLong("itemId"));
                row.put("priceText", trimToNull(rs.getString("priceText")));
                row.put("notes", trimToNull(rs.getString("notes")));
                row.put("name", trimToNull(rs.getString("name")));
                row.put("nameZh", trimToNull(rs.getString("nameZh")));
                row.put("internalName", trimToNull(rs.getString("internalName")));
                row.put("image", trimToNull(rs.getString("image")));
                row.put("buyPrice", rs.getObject("buyPrice"));
                row.put("sellPrice", rs.getObject("sellPrice"));
                return row;
            },
            npcId
        );
    }

    private Map<String, Object> loadNpcBaseStats(Long gameId) {
        if (gameId == null) {
            return Map.of();
        }
        Path path = resolveDataFile(Path.of("generated", "npc-standardized-map.json"));
        if (path == null) {
            return Map.of();
        }
        try {
            Map<String, Object> root = objectMapper.readValue(path.toFile(), new TypeReference<>() {});
            Object recordsRaw = root.get("records");
            if (!(recordsRaw instanceof Map<?, ?> records)) {
                return Map.of();
            }
            Object raw = records.get(String.valueOf(gameId));
            if (!(raw instanceof Map<?, ?> map)) {
                return Map.of();
            }
            Map<String, Object> baseStats = new LinkedHashMap<>();
            Map<?, ?> combat = map.get("combat") instanceof Map<?, ?> combatMap ? combatMap : Map.of();
            baseStats.put("damage", combat.get("damage"));
            baseStats.put("lifeMax", combat.get("lifeMax"));
            baseStats.put("defense", combat.get("defense"));
            baseStats.put("knockBackResist", combat.get("knockBackResist"));
            return baseStats;
        } catch (Exception ignored) {
            return Map.of();
        }
    }

    private void rememberLookup(Map<String, Map<String, Object>> lookup, String rawKey, Map<String, Object> row) {
        String key = normalizeLookupKey(rawKey);
        if (key != null) {
            lookup.putIfAbsent(key, row);
        }
    }

    private List<Map<String, Object>> buildSuggestedShopEntries(
        List<Map<String, Object>> scrapedShopItems,
        Map<String, Map<String, Object>> itemLookup
    ) {
        List<Map<String, Object>> suggestions = new ArrayList<>();
        Set<Long> seenItemIds = new LinkedHashSet<>();

        for (int index = 0; index < scrapedShopItems.size(); index += 1) {
            Map<String, Object> scrapedItem = scrapedShopItems.get(index);
            Map<String, Object> matchedItem = findMatchedItem(itemLookup, scrapedItem);
            Long itemId = matchedItem == null ? null : toLong(matchedItem.get("id"));
            if (itemId == null || !seenItemIds.add(itemId)) {
                continue;
            }

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("itemId", itemId);
            row.put("priceText", trimToNull(scrapedItem.get("priceText")));
            row.put("notes", trimToNull(scrapedItem.get("availability")));
            row.put("sortOrder", index + 1);
            row.put("itemName", trimToNull(matchedItem.get("name")));
            row.put("itemNameZh", trimToNull(matchedItem.get("nameZh")));
            row.put("itemInternalName", trimToNull(matchedItem.get("internalName")));
            row.put("itemImage", trimToNull(matchedItem.get("image")));
            row.put("sourceNameZh", trimToNull(scrapedItem.get("nameZh")));
            row.put("sourceNameEn", trimToNull(scrapedItem.get("nameEn")));
            suggestions.add(row);
        }

        return suggestions;
    }

    private List<Map<String, Object>> buildUnmatchedShopItems(
        List<Map<String, Object>> scrapedShopItems,
        List<Map<String, Object>> suggestedShopEntries
    ) {
        Set<String> matchedNames = new LinkedHashSet<>();
        for (Map<String, Object> row : suggestedShopEntries) {
            for (String value : List.of(
                trimToNull(row.get("sourceNameZh")),
                trimToNull(row.get("sourceNameEn"))
            )) {
                String name = normalizeLookupKey(value);
                if (name != null) {
                    matchedNames.add(name);
                }
            }
        }

        List<Map<String, Object>> unmatched = new ArrayList<>();
        for (Map<String, Object> scrapedItem : scrapedShopItems) {
            String normalizedNameEn = normalizeLookupKey(trimToNull(scrapedItem.get("nameEn")));
            String normalizedNameZh = normalizeLookupKey(trimToNull(scrapedItem.get("nameZh")));
            if ((normalizedNameEn != null && matchedNames.contains(normalizedNameEn))
                || (normalizedNameZh != null && matchedNames.contains(normalizedNameZh))) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("nameZh", trimToNull(scrapedItem.get("nameZh")));
            row.put("nameEn", trimToNull(scrapedItem.get("nameEn")));
            row.put("priceText", trimToNull(scrapedItem.get("priceText")));
            row.put("availability", trimToNull(scrapedItem.get("availability")));
            unmatched.add(row);
        }
        return unmatched;
    }

    private Map<String, Object> findMatchedItem(Map<String, Map<String, Object>> itemLookup, Map<String, Object> scrapedItem) {
        if (itemLookup == null || scrapedItem == null) {
            return null;
        }
        for (String candidate : List.of(
            trimToNull(scrapedItem.get("nameZh")),
            trimToNull(scrapedItem.get("nameEn"))
        )) {
            String key = normalizeLookupKey(candidate);
            if (key != null && itemLookup.containsKey(key)) {
                return itemLookup.get(key);
            }
        }
        return null;
    }

    private String buildSuggestedBehaviorNotes(String functionSummary, String moveInSummary) {
        List<String> parts = new ArrayList<>();
        if (functionSummary != null) {
            parts.add(functionSummary);
        }
        if (moveInSummary != null) {
            parts.add("入住条件：" + moveInSummary);
        }
        return parts.isEmpty() ? null : String.join("\n\n", parts);
    }

    private ReportArtifact findLatestReportArtifact(
        Path repoRoot,
        String latestFileName,
        String snapshotPrefix,
        String snapshotSuffix
    ) {
        if (repoRoot == null) {
            return null;
        }

        Path latestPath = repoRoot.resolve("data").resolve("generated").resolve(latestFileName);
        if (Files.exists(latestPath)) {
            return new ReportArtifact(latestPath, relativizeSafely(repoRoot, latestPath), readLastModifiedIso(latestPath));
        }

        Path reportsDir = repoRoot.resolve("reports");
        if (!Files.isDirectory(reportsDir)) {
            return null;
        }

        try (Stream<Path> stream = Files.list(reportsDir)) {
            Path snapshot = stream
                .filter(Files::isRegularFile)
                .filter(path -> {
                    String fileName = path.getFileName().toString();
                    return fileName.startsWith(snapshotPrefix) && fileName.endsWith(snapshotSuffix);
                })
                .max(Comparator.comparing(this::safeLastModifiedMillis))
                .orElse(null);
            if (snapshot == null) {
                return null;
            }
            return new ReportArtifact(snapshot, relativizeSafely(repoRoot, snapshot), readLastModifiedIso(snapshot));
        } catch (IOException ignored) {
            return null;
        }
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

    private String readLastModifiedIso(Path path) {
        try {
            FileTime fileTime = Files.getLastModifiedTime(path);
            return fileTime.toInstant().toString();
        } catch (IOException ignored) {
            return null;
        }
    }

    private Path resolveDataFile(Path relativePath) {
        List<Path> candidates = List.of(
            Path.of(System.getProperty("user.dir")).resolve("data").resolve(relativePath).normalize(),
            Path.of(System.getProperty("user.dir")).resolve("..").resolve("data").resolve(relativePath).normalize(),
            Path.of("data").resolve(relativePath).normalize()
        );
        for (Path candidate : candidates) {
            if (Files.exists(candidate)) {
                return candidate;
            }
        }
        return null;
    }

    private long safeLastModifiedMillis(Path path) {
        try {
            return Files.getLastModifiedTime(path).toMillis();
        } catch (IOException ignored) {
            return Long.MIN_VALUE;
        }
    }

    private List<Map<String, Object>> normalizeObjectList(Object raw) {
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }

        List<Map<String, Object>> normalized = new ArrayList<>();
        for (Object entry : list) {
            if (!(entry instanceof Map<?, ?> map)) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            map.forEach((key, value) -> row.put(String.valueOf(key), value));
            normalized.add(row);
        }
        return normalized;
    }

    private Map<String, Object> normalizeObject(Object raw) {
        if (!(raw instanceof Map<?, ?> map)) {
            return Map.of();
        }
        Map<String, Object> normalized = new LinkedHashMap<>();
        map.forEach((key, value) -> normalized.put(String.valueOf(key), value));
        return normalized;
    }

    private String previewText(String value, int maxLength) {
        String text = trimToNull(value);
        if (text == null) {
            return null;
        }
        if (text.length() <= maxLength) {
            return text;
        }
        return text.substring(0, Math.max(0, maxLength - 1)).trim() + "…";
    }

    private String formatGamePeriodLabel(Long gamePeriodId) {
        if (gamePeriodId == null) {
            return "未设置";
        }
        return switch (gamePeriodId.intValue()) {
            case 0 -> "未设置";
            case 1 -> "前期";
            case 2 -> "困难模式";
            default -> "阶段 " + gamePeriodId;
        };
    }

    private String normalizeLookupKey(String value) {
        String text = trimToNull(value);
        if (text == null) {
            return null;
        }
        return text
            .replace('_', ' ')
            .replace('-', ' ')
            .replaceAll("\\s+", " ")
            .trim()
            .toLowerCase(Locale.ROOT);
    }

    private String trimToNull(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }

    private Long toLong(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value).trim());
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private int toInteger(Object value, int fallback) {
        if (value == null) {
            return fallback;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(value).trim());
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static final class ReportArtifact {
        private final Path path;
        private final String relativePath;
        private final String updatedAt;

        private ReportArtifact(Path path, String relativePath, String updatedAt) {
            this.path = Objects.requireNonNull(path);
            this.relativePath = relativePath;
            this.updatedAt = updatedAt;
        }
    }
}

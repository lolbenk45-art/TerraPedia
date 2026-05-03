package com.terraria.skills.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.config.RelationCompatibilityProperties;
import com.terraria.skills.dto.RelationCompatibilityDomainStatusDTO;
import com.terraria.skills.dto.RelationCompatibilityStatusDTO;
import com.terraria.skills.dto.RelationHealthStatusDTO;
import com.terraria.skills.service.RelationCompatibilityService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

@Service
public class RelationCompatibilityServiceImpl implements RelationCompatibilityService {

    private static final List<DomainConfig> DOMAINS = List.of(
        new DomainConfig(
            "items",
            "items",
            "projection_items",
            "internal_name",
            List.of("name", "name_zh", "image", "damage", "defense", "knockback", "use_time", "buy", "sell", "tooltip", "tooltip_zh", "rarity_id", "is_stackable", "stack_size")
        ),
        new DomainConfig(
            "npcs",
            "npcs",
            "projection_npcs",
            "internal_name",
            List.of("name", "name_zh", "sub_name", "sub_name_zh", "image_url", "is_boss", "is_friendly", "is_town_npc", "damage", "defense", "life_max", "knock_back_resist", "scale", "value", "buff_immune")
        ),
        new DomainConfig(
            "projectiles",
            "projectiles",
            "projection_projectiles",
            "internal_name",
            List.of("name", "name_zh", "image_url", "ai_style", "damage", "knock_back", "penetrate", "time_left", "scale", "friendly", "hostile", "tile_collide")
        ),
        new DomainConfig(
            "buffs",
            "buffs",
            "projection_buffs",
            "internal_name",
            List.of("english_name", "name_zh", "tooltip_en", "tooltip_zh", "image", "buff_type", "source_item_count", "immune_npc_count")
        )
    );
    private static final Path RELATION_REPORTS_DIR = Path.of("reports", "relation");

    private final JdbcTemplate jdbcTemplate;
    private final RelationCompatibilityProperties properties;
    private final ObjectMapper objectMapper;
    private final Path repoRootOverride;

    @Autowired
    public RelationCompatibilityServiceImpl(
        JdbcTemplate jdbcTemplate,
        RelationCompatibilityProperties properties,
        ObjectMapper objectMapper
    ) {
        this(jdbcTemplate, properties, objectMapper, null);
    }

    RelationCompatibilityServiceImpl(
        JdbcTemplate jdbcTemplate,
        RelationCompatibilityProperties properties,
        ObjectMapper objectMapper,
        Path repoRootOverride
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.repoRootOverride = repoRootOverride == null ? null : repoRootOverride.toAbsolutePath().normalize();
    }

    @Override
    public RelationCompatibilityStatusDTO getStatus() {
        RelationCompatibilityStatusDTO status = new RelationCompatibilityStatusDTO();
        status.setGeneratedAt(Instant.now());

        Map<String, RelationCompatibilityDomainStatusDTO> domains = new LinkedHashMap<>();
        List<String> switchableDomains = new ArrayList<>();
        List<String> blockedDomains = new ArrayList<>();
        for (DomainConfig domain : DOMAINS) {
            RelationCompatibilityDomainStatusDTO domainStatus = buildDomainStatus(
                domain,
                queryRows(domain.localTable()),
                queryRows(qualifiedProjectionTable(domain.projectionTable()))
            );
            domains.put(domain.name(), domainStatus);
            if ("switchable".equals(domainStatus.getStatus())) {
                switchableDomains.add(domain.name());
            } else {
                blockedDomains.add(domain.name());
            }
        }

        status.setDomains(domains);
        status.setSwitchableDomains(switchableDomains);
        status.setBlockedDomains(blockedDomains);
        status.setSwitchable(blockedDomains.isEmpty());
        return status;
    }

    @Override
    public RelationHealthStatusDTO getHealth() {
        Path repoRoot = resolveRepoRoot();
        Path reportPath = findLatestReport(repoRoot.resolve(RELATION_REPORTS_DIR).normalize(), "relation-health", ".json");
        if (reportPath == null) {
            return missingHealthReport();
        }
        return readHealthReport(repoRoot, reportPath);
    }

    private RelationCompatibilityDomainStatusDTO buildDomainStatus(
        DomainConfig domain,
        List<Map<String, Object>> localRows,
        List<Map<String, Object>> projectionRows
    ) {
        Map<String, Map<String, Object>> localByKey = indexRows(localRows, domain.keyColumn());
        Map<String, Map<String, Object>> projectionByKey = indexRows(projectionRows, domain.keyColumn());
        Set<String> localKeys = localByKey.keySet();
        Set<String> projectionKeys = projectionByKey.keySet();
        List<String> missingInProjection = localKeys.stream()
            .filter(key -> !projectionByKey.containsKey(key))
            .toList();
        List<String> extraInProjection = projectionKeys.stream()
            .filter(key -> !localByKey.containsKey(key))
            .toList();
        List<String> sharedKeys = localKeys.stream()
            .filter(projectionByKey::containsKey)
            .toList();

        List<RelationCompatibilityDomainStatusDTO.BlockingFieldDTO> blockingFields = new ArrayList<>();
        for (String field : domain.fields()) {
            int localNonNull = 0;
            int projectionNonNull = 0;
            for (String key : sharedKeys) {
                if (isPresent(localByKey.get(key).get(field))) {
                    localNonNull += 1;
                }
                if (isPresent(projectionByKey.get(key).get(field))) {
                    projectionNonNull += 1;
                }
            }
            if (projectionNonNull < localNonNull) {
                RelationCompatibilityDomainStatusDTO.BlockingFieldDTO blockingField = new RelationCompatibilityDomainStatusDTO.BlockingFieldDTO();
                blockingField.setField(field);
                blockingField.setLocalNonNull(localNonNull);
                blockingField.setProjectionNonNull(projectionNonNull);
                blockingField.setGap(localNonNull - projectionNonNull);
                blockingFields.add(blockingField);
            }
        }

        RelationCompatibilityDomainStatusDTO status = new RelationCompatibilityDomainStatusDTO();
        status.setDomain(domain.name());
        status.setLocalRows(localRows.size());
        status.setProjectionRows(projectionRows.size());
        status.setSharedRows(sharedKeys.size());
        status.setMissingInProjectionCount(missingInProjection.size());
        status.setExtraInProjectionCount(extraInProjection.size());
        status.setMissingInProjectionSamples(sample(missingInProjection));
        status.setExtraInProjectionSamples(sample(extraInProjection));
        status.setBlockingFields(blockingFields);
        status.setStatus(missingInProjection.isEmpty() && extraInProjection.isEmpty() && blockingFields.isEmpty() ? "switchable" : "blocked");
        return status;
    }

    private List<Map<String, Object>> queryRows(String tableName) {
        return jdbcTemplate.queryForList("SELECT * FROM " + tableName);
    }

    private String qualifiedProjectionTable(String tableName) {
        return quoteIdentifier(properties.getRelationDatabase()) + "." + quoteIdentifier(tableName);
    }

    private String quoteIdentifier(String value) {
        return "`" + value.replace("`", "``") + "`";
    }

    private Map<String, Map<String, Object>> indexRows(List<Map<String, Object>> rows, String keyColumn) {
        Map<String, Map<String, Object>> indexed = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            Object rawKey = row.get(keyColumn);
            if (rawKey == null) {
                continue;
            }
            String key = String.valueOf(rawKey).trim();
            if (!key.isEmpty()) {
                indexed.put(key, row);
            }
        }
        return indexed;
    }

    private boolean isPresent(Object value) {
        return value != null && !String.valueOf(value).isBlank();
    }

    private List<String> sample(List<String> values) {
        int limit = Math.max(0, properties.getSampleLimit());
        return values.stream()
            .limit(limit)
            .toList();
    }

    private RelationHealthStatusDTO readHealthReport(Path repoRoot, Path reportPath) {
        RelationHealthStatusDTO status = new RelationHealthStatusDTO();
        status.setFound(true);
        status.setReportPath(toDisplayPath(repoRoot, reportPath));
        status.setGeneratedAt(readLastModifiedInstant(reportPath));
        try {
            JsonNode root = objectMapper.readTree(reportPath.toFile());
            status.setReadable(true);
            Instant generatedAt = parseInstant(text(root.path("generatedAt")));
            if (generatedAt != null) {
                status.setGeneratedAt(generatedAt);
            }
            status.setSummary(toSummary(root.path("summary")));
            status.setChecks(toChecks(root.path("checks")));
            return status;
        } catch (IOException exception) {
            status.setReadable(false);
            status.setErrorMessage(exception.getMessage());
            status.setSummary(summary("unreadable", 1, 0));
            status.setChecks(List.of(check("relation_health_report_unreadable", "error", "Latest relation health report is not readable.", null)));
            return status;
        }
    }

    private RelationHealthStatusDTO missingHealthReport() {
        RelationHealthStatusDTO status = new RelationHealthStatusDTO();
        status.setFound(false);
        status.setReadable(false);
        status.setSummary(summary("missing", 1, 0));
        status.setChecks(List.of(check("relation_health_report_missing", "error", "No relation health report was found.", null)));
        return status;
    }

    private RelationHealthStatusDTO.SummaryDTO toSummary(JsonNode node) {
        return summary(
            firstNonBlank(text(node.path("status")), "unknown"),
            intValue(node.path("blockingCount")),
            intValue(node.path("warningCount"))
        );
    }

    private RelationHealthStatusDTO.SummaryDTO summary(String value, int blockingCount, int warningCount) {
        RelationHealthStatusDTO.SummaryDTO summary = new RelationHealthStatusDTO.SummaryDTO();
        summary.setStatus(value);
        summary.setBlockingCount(blockingCount);
        summary.setWarningCount(warningCount);
        return summary;
    }

    private List<RelationHealthStatusDTO.CheckDTO> toChecks(JsonNode node) {
        if (!node.isArray()) {
            return List.of();
        }
        List<RelationHealthStatusDTO.CheckDTO> checks = new ArrayList<>();
        for (JsonNode row : node) {
            checks.add(check(
                text(row.path("id")),
                text(row.path("status")),
                text(row.path("message")),
                text(row.path("reportPath"))
            ));
        }
        return checks;
    }

    private RelationHealthStatusDTO.CheckDTO check(String id, String status, String message, String reportPath) {
        RelationHealthStatusDTO.CheckDTO check = new RelationHealthStatusDTO.CheckDTO();
        check.setId(id);
        check.setStatus(status);
        check.setMessage(message);
        check.setReportPath(reportPath);
        return check;
    }

    private Path findLatestReport(Path dir, String prefix, String suffix) {
        if (!Files.isDirectory(dir)) {
            return null;
        }
        try (Stream<Path> stream = Files.list(dir)) {
            return stream
                .filter(Files::isRegularFile)
                .filter(path -> {
                    String fileName = path.getFileName().toString();
                    return fileName.startsWith(prefix) && fileName.endsWith(suffix);
                })
                .max(Comparator
                    .comparingLong(this::safeLastModifiedMillis)
                    .thenComparing(path -> path.getFileName().toString()))
                .orElse(null);
        } catch (IOException ignored) {
            return null;
        }
    }

    private Path resolveRepoRoot() {
        if (repoRootOverride != null) {
            return repoRootOverride;
        }
        Path current = Path.of("").toAbsolutePath().normalize();
        while (current != null) {
            if (looksLikeRepoRoot(current)) {
                return current;
            }
            current = current.getParent();
        }
        return Path.of("").toAbsolutePath().normalize();
    }

    private boolean looksLikeRepoRoot(Path path) {
        return path != null
            && Files.exists(path.resolve("back"))
            && Files.exists(path.resolve("data-query-app"))
            && Files.exists(path.resolve("scripts"));
    }

    private String toDisplayPath(Path repoRoot, Path path) {
        if (path == null) {
            return null;
        }
        Path normalized = path.toAbsolutePath().normalize();
        try {
            if (normalized.startsWith(repoRoot)) {
                return repoRoot.relativize(normalized).toString().replace('\\', '/');
            }
        } catch (IllegalArgumentException ignored) {
            return normalized.toString();
        }
        return normalized.toString();
    }

    private long safeLastModifiedMillis(Path path) {
        try {
            return Files.getLastModifiedTime(path).toMillis();
        } catch (IOException ignored) {
            return Long.MIN_VALUE;
        }
    }

    private Instant readLastModifiedInstant(Path path) {
        try {
            if (path == null || !Files.exists(path)) {
                return null;
            }
            FileTime fileTime = Files.getLastModifiedTime(path);
            return fileTime.toInstant();
        } catch (IOException ignored) {
            return null;
        }
    }

    private Instant parseInstant(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Instant.parse(value);
        } catch (Exception ignored) {
            return null;
        }
    }

    private String text(JsonNode node) {
        return node == null || node.isMissingNode() || node.isNull() ? null : node.asText();
    }

    private int intValue(JsonNode node) {
        return node == null || !node.isNumber() ? 0 : node.asInt();
    }

    private String firstNonBlank(String first, String fallback) {
        return first == null || first.isBlank() ? fallback : first;
    }

    private record DomainConfig(
        String name,
        String localTable,
        String projectionTable,
        String keyColumn,
        List<String> fields
    ) {
        @Override
        public String localTable() {
            return "`" + localTable + "`";
        }
    }
}

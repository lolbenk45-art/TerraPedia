package com.terraria.skills.service.impl;

import com.terraria.skills.config.RelationCompatibilityProperties;
import com.terraria.skills.dto.RelationHealthStatusDTO;
import com.terraria.skills.dto.RelationCompatibilityStatusDTO;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RelationCompatibilityServiceImplTest {

    @TempDir
    Path tempDir;

    @Test
    void shouldMarkAllDomainsSwitchableWhenLocalRowsMatchRelationProjection() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForList(anyString())).thenAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            if (sql.contains("items") || sql.contains("projection_items")) {
                return List.of(row("internal_name", "IronPickaxe", "name", "Iron Pickaxe", "image", "item.png"));
            }
            if (sql.contains("npcs") || sql.contains("projection_npcs")) {
                return List.of(row("internal_name", "Guide", "name", "Guide", "image_url", "https://terraria.wiki.gg/images/Guide.png", "life_max", 250));
            }
            if (sql.contains("projectiles") || sql.contains("projection_projectiles")) {
                return List.of(row("internal_name", "WoodenArrowFriendly", "name", "Wooden Arrow", "image_url", "https://terraria.wiki.gg/images/Wooden%20Arrow.png", "friendly", 1));
            }
            if (sql.contains("buffs") || sql.contains("projection_buffs")) {
                return List.of(row("internal_name", "ObsidianSkin", "english_name", "Obsidian Skin", "image", "buff.png"));
            }
            return List.of();
        });

        RelationCompatibilityServiceImpl service = new RelationCompatibilityServiceImpl(
            jdbcTemplate,
            new RelationCompatibilityProperties(),
            new ObjectMapper()
        );

        RelationCompatibilityStatusDTO status = service.getStatus();

        assertTrue(status.isSwitchable());
        assertEquals(List.of("items", "npcs", "projectiles", "buffs"), status.getSwitchableDomains());
        assertEquals(List.of(), status.getBlockedDomains());
        assertEquals("switchable", status.getDomains().get("items").getStatus());
        assertEquals(1, status.getDomains().get("items").getSharedRows());
    }

    @Test
    void shouldExposeMissingExtraAndBlockingFieldsWhenProjectionDiverges() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForList(anyString())).thenAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            if (sql.contains("projection_items")) {
                return List.of(
                    row("internal_name", "IronPickaxe", "name", "Iron Pickaxe"),
                    row("internal_name", "ProjectionOnly", "name", "Projection Only", "image", "projection.png")
                );
            }
            if (sql.contains("items")) {
                return List.of(
                    row("internal_name", "IronPickaxe", "name", "Iron Pickaxe", "image", "item.png"),
                    row("internal_name", "LocalOnly", "name", "Local Only", "image", "local.png")
                );
            }
            return List.of();
        });

        RelationCompatibilityServiceImpl service = new RelationCompatibilityServiceImpl(
            jdbcTemplate,
            new RelationCompatibilityProperties(),
            new ObjectMapper()
        );

        RelationCompatibilityStatusDTO status = service.getStatus();

        assertEquals(false, status.isSwitchable());
        assertTrue(status.getBlockedDomains().contains("items"));
        assertEquals("blocked", status.getDomains().get("items").getStatus());
        assertEquals(1, status.getDomains().get("items").getMissingInProjectionCount());
        assertEquals(List.of("LocalOnly"), status.getDomains().get("items").getMissingInProjectionSamples());
        assertEquals(1, status.getDomains().get("items").getExtraInProjectionCount());
        assertEquals(List.of("ProjectionOnly"), status.getDomains().get("items").getExtraInProjectionSamples());
        assertEquals("image", status.getDomains().get("items").getBlockingFields().get(0).getField());
    }

    @Test
    void shouldReadLatestRelationHealthWarningReport() throws Exception {
        Path repoRoot = createRepoRoot();
        Path relationDir = Files.createDirectories(repoRoot.resolve("reports/relation"));
        Path older = relationDir.resolve("relation-health-2026-04-29.json");
        Path latest = relationDir.resolve("relation-health-2026-04-30.json");
        Files.writeString(older, """
            {"summary":{"status":"pass","blockingCount":0,"warningCount":0},"checks":[]}
            """);
        Files.writeString(latest, """
            {
              "generatedAt": "2026-04-30T11:52:13.904Z",
              "summary": {"status":"warning","blockingCount":0,"warningCount":1},
              "checks": [
                {
                  "id":"unresolved_item_npc_relation_audits",
                  "status":"warn",
                  "message":"count is 2602",
                  "reportPath":"reports/relation/relation-unresolved-2026-04-30.json"
                }
              ]
            }
            """);
        Files.setLastModifiedTime(older, java.nio.file.attribute.FileTime.from(Instant.parse("2026-04-29T00:00:00Z")));
        Files.setLastModifiedTime(latest, java.nio.file.attribute.FileTime.from(Instant.parse("2026-04-30T00:00:00Z")));

        RelationCompatibilityServiceImpl service = serviceWithRepo(repoRoot);

        RelationHealthStatusDTO health = service.getHealth();

        assertTrue(health.isFound());
        assertTrue(health.isReadable());
        assertEquals("reports/relation/relation-health-2026-04-30.json", health.getReportPath());
        assertEquals("warning", health.getSummary().getStatus());
        assertEquals(0, health.getSummary().getBlockingCount());
        assertEquals(1, health.getSummary().getWarningCount());
        assertEquals("unresolved_item_npc_relation_audits", health.getChecks().get(0).getId());
        assertEquals("warn", health.getChecks().get(0).getStatus());
        assertEquals("count is 2602", health.getChecks().get(0).getMessage());
        assertEquals("reports/relation/relation-unresolved-2026-04-30.json", health.getChecks().get(0).getReportPath());
    }

    @Test
    void shouldExposeBlockedRelationHealthReport() throws Exception {
        Path repoRoot = createRepoRoot();
        Files.createDirectories(repoRoot.resolve("reports/relation"));
        Files.writeString(repoRoot.resolve("reports/relation/relation-health-blocked.json"), """
            {
              "summary": {"status":"blocked","blockingCount":1,"warningCount":0},
              "checks": [
                {"id":"local_compat_npc_shop_entries_count","status":"fail","message":"expected nonzero count, got 0","reportPath":null}
              ]
            }
            """);

        RelationHealthStatusDTO health = serviceWithRepo(repoRoot).getHealth();

        assertEquals("blocked", health.getSummary().getStatus());
        assertEquals(1, health.getSummary().getBlockingCount());
        assertEquals(0, health.getSummary().getWarningCount());
        assertEquals("local_compat_npc_shop_entries_count", health.getChecks().get(0).getId());
        assertEquals("fail", health.getChecks().get(0).getStatus());
        assertEquals("expected nonzero count, got 0", health.getChecks().get(0).getMessage());
        assertEquals(null, health.getChecks().get(0).getReportPath());
    }

    @Test
    void shouldReturnMissingRelationHealthStatusWhenReportDoesNotExist() throws Exception {
        Path repoRoot = createRepoRoot();
        Files.createDirectories(repoRoot.resolve("reports/relation"));

        RelationHealthStatusDTO health = serviceWithRepo(repoRoot).getHealth();

        assertEquals(false, health.isFound());
        assertEquals(false, health.isReadable());
        assertEquals("missing", health.getSummary().getStatus());
        assertEquals(1, health.getSummary().getBlockingCount());
        assertEquals(0, health.getSummary().getWarningCount());
        assertEquals("relation_health_report_missing", health.getChecks().get(0).getId());
        assertEquals("error", health.getChecks().get(0).getStatus());
        assertEquals("No relation health report was found.", health.getChecks().get(0).getMessage());
        assertEquals(null, health.getChecks().get(0).getReportPath());
    }

    @Test
    void shouldUseFileNameTieBreakerWhenRelationHealthReportsHaveEqualModifiedTimes() throws Exception {
        Path repoRoot = createRepoRoot();
        Path relationDir = Files.createDirectories(repoRoot.resolve("reports/relation"));
        Path olderName = relationDir.resolve("relation-health-2026-04-29.json");
        Path newerName = relationDir.resolve("relation-health-2026-04-30.json");
        Files.writeString(olderName, """
            {"summary":{"status":"pass","blockingCount":0,"warningCount":0},"checks":[]}
            """);
        Files.writeString(newerName, """
            {"summary":{"status":"warning","blockingCount":0,"warningCount":1},"checks":[]}
            """);
        java.nio.file.attribute.FileTime sameTime = java.nio.file.attribute.FileTime.from(Instant.parse("2026-04-30T00:00:00Z"));
        Files.setLastModifiedTime(olderName, sameTime);
        Files.setLastModifiedTime(newerName, sameTime);

        RelationHealthStatusDTO health = serviceWithRepo(repoRoot).getHealth();

        assertEquals("reports/relation/relation-health-2026-04-30.json", health.getReportPath());
        assertEquals("warning", health.getSummary().getStatus());
    }

    private Map<String, Object> row(Object... entries) {
        java.util.LinkedHashMap<String, Object> row = new java.util.LinkedHashMap<>();
        for (int index = 0; index < entries.length; index += 2) {
            row.put(String.valueOf(entries[index]), entries[index + 1]);
        }
        return row;
    }

    private RelationCompatibilityServiceImpl serviceWithRepo(Path repoRoot) {
        return new RelationCompatibilityServiceImpl(
            mock(JdbcTemplate.class),
            new RelationCompatibilityProperties(),
            new ObjectMapper(),
            repoRoot
        );
    }

    private Path createRepoRoot() throws Exception {
        Path repoRoot = tempDir.resolve("TerraPedia-dev");
        Files.createDirectories(repoRoot.resolve("back"));
        Files.createDirectories(repoRoot.resolve("data-query-app"));
        Files.createDirectories(repoRoot.resolve("scripts"));
        return repoRoot;
    }
}

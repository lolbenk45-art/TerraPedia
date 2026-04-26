package com.terraria.skills.service.impl;

import com.terraria.skills.config.RelationCompatibilityProperties;
import com.terraria.skills.dto.RelationCompatibilityStatusDTO;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RelationCompatibilityServiceImplTest {

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
            new RelationCompatibilityProperties()
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
            new RelationCompatibilityProperties()
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

    private Map<String, Object> row(Object... entries) {
        java.util.LinkedHashMap<String, Object> row = new java.util.LinkedHashMap<>();
        for (int index = 0; index < entries.length; index += 2) {
            row.put(String.valueOf(entries[index]), entries[index + 1]);
        }
        return row;
    }
}

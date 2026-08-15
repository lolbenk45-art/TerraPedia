package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AdminShimmerControllerTest {

    @Test
    void listDatasetRowsEnrichesItemTransformImagesFromCanonicalItems() {
        FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate();
        AdminShimmerController controller = new AdminShimmerController(jdbcTemplate, new ObjectMapper());

        ResponseEntity<?> response = controller.listDatasetRows("item-transforms", 1, 20, null, null);

        assertEquals(200, response.getStatusCode().value());
        Map<String, Object> first = firstDataRow(response);
        assertEquals("LifeCrystal", first.get("inputInternalName"));
        assertEquals("AegisCrystal", first.get("outputInternalName"));
        assertEquals("http://localhost:9000/terrapedia-images/items/life-crystal.png", first.get("inputImageUrl"));
        assertEquals("http://localhost:9000/terrapedia-images/items/aegis-crystal.png", first.get("outputImageUrl"));
    }

    @Test
    void listDatasetRowsUsesManagedItemImagesWhenLegacyItemImageIsEmpty() {
        FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate();
        AdminShimmerController controller = new AdminShimmerController(jdbcTemplate, new ObjectMapper());

        controller.listDatasetRows("item-transforms", 1, 20, null, null);

        assertTrue(
            jdbcTemplate.sqlLog().stream().anyMatch(sql -> sql.contains("FROM item_images ii") && sql.contains("ii.cached_url")),
            "item transform image lookup should use managed item_images cached_url before falling back to items.image"
        );
    }

    @Test
    void listDatasetRowsKeepsNpcVariantImageAndAddsCanonicalNpcImage() {
        FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate();
        AdminShimmerController controller = new AdminShimmerController(jdbcTemplate, new ObjectMapper());

        ResponseEntity<?> response = controller.listDatasetRows("npc-transforms", 1, 20, null, null);

        assertEquals(200, response.getStatusCode().value());
        Map<String, Object> first = firstDataRow(response);
        assertEquals("Guide", first.get("npcInternalName"));
        assertEquals("https://terraria.wiki.gg/images/Guide_%28Shimmered%29.png", first.get("variantImageUrl"));
        assertEquals("http://localhost:9000/terrapedia-images/npcs/guide.png", first.get("npcImageUrl"));
    }

    @Test
    void getDatasetRowToleratesRowsWithoutInternalNames() {
        EmptyInternalNameJdbcTemplate jdbcTemplate = new EmptyInternalNameJdbcTemplate();
        AdminShimmerController controller = new AdminShimmerController(jdbcTemplate, new ObjectMapper());

        ResponseEntity<?> response = controller.getDatasetRow("npc-transforms", 119L);

        assertEquals(200, response.getStatusCode().value());
        Map<String, Object> first = singleDataRow(response);
        assertNull(first.get("npcInternalName"));
        assertNull(first.get("npcImageUrl"));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> firstDataRow(ResponseEntity<?> response) {
        Object body = response.getBody();
        assertNotNull(body);
        Object data = ((com.terraria.skills.common.ApiResponse<List<Map<String, Object>>>) body).getData();
        assertNotNull(data);
        return ((List<Map<String, Object>>) data).get(0);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> singleDataRow(ResponseEntity<?> response) {
        Object body = response.getBody();
        assertNotNull(body);
        Object data = ((com.terraria.skills.common.ApiResponse<Map<String, Object>>) body).getData();
        assertNotNull(data);
        return (Map<String, Object>) data;
    }

    static class FakeJdbcTemplate extends JdbcTemplate {
        private final List<String> sqlLog = new ArrayList<>();

        List<String> sqlLog() {
            return sqlLog;
        }

        @Override
        public <T> T queryForObject(String sql, Class<T> requiredType, Object... args) {
            sqlLog.add(sql);
            return requiredType.cast(1L);
        }

        @Override
        public List<Map<String, Object>> queryForList(String sql, Object... args) {
            sqlLog.add(sql);
            if (sql.contains("FROM shimmer_item_transforms")) {
                return List.of(itemTransformRow());
            }
            if (sql.contains("FROM shimmer_npc_transforms")) {
                return List.of(npcTransformRow());
            }
            if (sql.contains("FROM items")) {
                return List.of(
                    imageRow("LifeCrystal", "Life Crystal", "生命水晶", "http://localhost:9000/terrapedia-images/items/life-crystal.png"),
                    imageRow("AegisCrystal", "Vital Crystal", "活力水晶", "http://localhost:9000/terrapedia-images/items/aegis-crystal.png")
                );
            }
            if (sql.contains("FROM npcs")) {
                return List.of(imageRow("Guide", "Guide", "向导", "http://localhost:9000/terrapedia-images/npcs/guide.png"));
            }
            if (sql.contains("FROM projectiles") || sql.contains("FROM buffs")) {
                return List.of();
            }
            return List.of();
        }

        private Map<String, Object> itemTransformRow() {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", 1119L);
            row.put("inputKind", "item");
            row.put("inputNameZh", "生命水晶");
            row.put("inputNameEn", "Life Crystal");
            row.put("inputInternalName", "LifeCrystal");
            row.put("outputKind", "item");
            row.put("outputNameZh", "活力水晶");
            row.put("outputNameEn", "Vital Crystal");
            row.put("outputInternalName", "AegisCrystal");
            row.put("sortOrder", 1);
            row.put("status", 1);
            return row;
        }

        private Map<String, Object> npcTransformRow() {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", 118L);
            row.put("npcNameZh", "向导");
            row.put("npcNameEn", "Guide");
            row.put("npcInternalName", "Guide");
            row.put("appearanceVariant", "shimmer");
            row.put("effectType", "variant");
            row.put("variantImageUrl", "https://terraria.wiki.gg/images/Guide_%28Shimmered%29.png");
            row.put("variantImageAlt", "Guide shimmer");
            row.put("sortOrder", 1);
            row.put("status", 1);
            return row;
        }

        private Map<String, Object> imageRow(String internalName, String name, String nameZh, String imageUrl) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("internalName", internalName);
            row.put("name", name);
            row.put("nameZh", nameZh);
            row.put("imageUrl", imageUrl);
            return row;
        }
    }

    static class EmptyInternalNameJdbcTemplate extends FakeJdbcTemplate {
        @Override
        public List<Map<String, Object>> queryForList(String sql, Object... args) {
            if (sql.contains("FROM shimmer_npc_transforms")) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", 119L);
                row.put("npcNameZh", "服装商");
                row.put("npcNameEn", "Clothier");
                row.put("npcInternalName", null);
                row.put("appearanceVariant", "Shimmered");
                row.put("effectType", "variant");
                row.put("variantImageUrl", null);
                row.put("variantImageAlt", null);
                row.put("sortOrder", 2);
                row.put("status", 1);
                return List.of(row);
            }
            return List.of();
        }
    }
}

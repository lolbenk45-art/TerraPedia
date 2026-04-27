package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.common.ApiResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AdminArmorSetControllerTest {

    @TempDir
    Path tempDir;

    private String originalUserDir;

    @BeforeEach
    void setUp() throws IOException {
        originalUserDir = System.getProperty("user.dir");
        Path repoRoot = tempDir.resolve("repo");
        Files.createDirectories(repoRoot.resolve("back"));
        Files.createDirectories(repoRoot.resolve("data/terraPedia/raw/wiki"));
        System.setProperty("user.dir", repoRoot.resolve("back").toString());
        writeArmorSetImageSnapshot(repoRoot);
    }

    @AfterEach
    void restoreUserDir() {
        if (originalUserDir == null) {
            System.clearProperty("user.dir");
        } else {
            System.setProperty("user.dir", originalUserDir);
        }
    }

    @Test
    void getArmorSetsReadsProjectionTableWhenAvailable() {
        FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate(true);
        AdminArmorSetController controller = new AdminArmorSetController(jdbcTemplate, new ObjectMapper());

        ResponseEntity<ApiResponse<List<Map<String, Object>>>> response =
            controller.getArmorSets(1, 20, null, null);

        assertEquals(200, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertEquals(1, response.getBody().getData().size());
        Map<String, Object> armorSet = response.getBody().getData().get(0);
        assertEquals("ArmorSetBonus.Wood", armorSet.get("textKey"));
        assertEquals("https://terraria.wiki.gg/images/Wood_armor.png", armorSet.get("maleImages"));
        assertTrue(jdbcTemplate.sqlLog.stream().anyMatch(sql -> sql.contains("FROM projection_armor_sets")));
        assertFalse(jdbcTemplate.sqlLog.stream().anyMatch(sql -> sql.contains("FROM armor_sets")));
    }

    @Test
    void getArmorSetByIdReadsProjectionTableWhenAvailable() {
        FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate(true);
        AdminArmorSetController controller = new AdminArmorSetController(jdbcTemplate, new ObjectMapper());

        ResponseEntity<ApiResponse<Map<String, Object>>> response = controller.getArmorSetById(101L);

        assertEquals(200, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertEquals("ArmorSetBonus.Wood", response.getBody().getData().get("textKey"));
        assertEquals("mapped", response.getBody().getData().get("definitionMappingStatus"));
        assertTrue(jdbcTemplate.sqlLog.stream().anyMatch(sql -> sql.contains("projection_armor_sets") && sql.contains("WHERE id = ?")));

        List<Map<String, Object>> setVariants = asMapList(response.getBody().getData().get("setVariants"));
        assertEquals(1, setVariants.size());
        assertEquals("ArmorSetBonus.Wood#0", setVariants.get(0).get("setId"));
        assertEquals(List.of(727L, 728L, 729L), setVariants.get(0).get("itemSourceIds"));

        List<Map<String, Object>> equipmentItems = asMapList(response.getBody().getData().get("equipmentItems"));
        assertEquals(3, equipmentItems.size());
        assertEquals(727L, equipmentItems.get(0).get("sourceId"));
        assertEquals("head", equipmentItems.get(0).get("partRole"));
        assertEquals("headSlot", equipmentItems.get(0).get("slotType"));
        assertEquals(52, equipmentItems.get(0).get("equipmentSlotId"));
    }

    @Test
    void getArmorSetsReadsRelationProjectionWhenCurrentDatabaseProjectionIsMissing() {
        FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate(false, true);
        AdminArmorSetController controller = new AdminArmorSetController(jdbcTemplate, new ObjectMapper());

        ResponseEntity<ApiResponse<List<Map<String, Object>>>> response =
            controller.getArmorSets(1, 20, null, null);

        assertEquals(200, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertEquals(1, response.getBody().getData().size());
        assertEquals("ArmorSetBonus.Wood", response.getBody().getData().get(0).get("textKey"));
        assertTrue(jdbcTemplate.sqlLog.stream().anyMatch(sql -> sql.contains("FROM `terria_v1_relation`.`projection_armor_sets`")));
        assertFalse(jdbcTemplate.sqlLog.stream().anyMatch(sql -> sql.contains("FROM armor_sets")));
    }

    @Test
    void getArmorSetsFallsBackToLegacyArmorSetsWhenProjectionTableIsMissing() {
        FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate(false);
        AdminArmorSetController controller = new AdminArmorSetController(jdbcTemplate, new ObjectMapper());

        ResponseEntity<ApiResponse<List<Map<String, Object>>>> response =
            controller.getArmorSets(1, 20, null, null);

        assertEquals(200, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertEquals(1, response.getBody().getData().size());
        assertEquals("legacy-wood", response.getBody().getData().get(0).get("sourceKey"));
        assertTrue(jdbcTemplate.sqlLog.stream().anyMatch(sql -> sql.contains("FROM armor_sets")));
    }

    @Test
    void legacyFallbackUsesLatestArmorSetImageSnapshotWhenDbImageFieldsAreEmpty() {
        FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate(false);
        AdminArmorSetController controller = new AdminArmorSetController(jdbcTemplate, new ObjectMapper());

        ResponseEntity<ApiResponse<Map<String, Object>>> response = controller.getArmorSetById(202L);
        Map<String, Object> data = response.getBody().getData();

        assertEquals("https://terraria.wiki.gg/images/Wood_armor.png?ef83ed", data.get("maleImages"));
        assertEquals("https://terraria.wiki.gg/images/Wood_armor_female.png?d68c10", data.get("femaleImages"));
        assertEquals("https://terraria.wiki.gg/images/Wood_armor.png?ef83ed", data.get("image"));
        assertEquals("https://terraria.wiki.gg/images/Wood_armor.png?ef83ed", data.get("imageUrl"));
    }

    @Test
    void updateArmorSetReturnsLegacyRowEvenWhenProjectionTableExists() {
        FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate(true);
        AdminArmorSetController controller = new AdminArmorSetController(jdbcTemplate, new ObjectMapper());

        ResponseEntity<ApiResponse<Map<String, Object>>> response =
            controller.updateArmorSet(202L, new LinkedHashMap<>());

        assertEquals(200, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertEquals("legacy-wood", response.getBody().getData().get("sourceKey"));
        assertFalse(jdbcTemplate.sqlLog.stream().anyMatch(sql -> sql.contains("FROM projection_armor_sets")));
    }

    private void writeArmorSetImageSnapshot(Path repoRoot) throws IOException {
        Files.writeString(
            repoRoot.resolve("data/terraPedia/raw/wiki/armor_set_images.parsed.latest.json"),
            """
            {
              "source": "terraria.wiki.gg:armor-set-pages:imageinfo",
              "armorSetImages": [
                {
                  "textKey": "ArmorSetBonus.Wood",
                  "pageTitle": "Wood armor",
                  "imageRole": "male",
                  "originalUrl": "https://terraria.wiki.gg/images/Wood_armor.png?ef83ed"
                },
                {
                  "textKey": "ArmorSetBonus.Wood",
                  "pageTitle": "Wood armor",
                  "imageRole": "female",
                  "originalUrl": "https://terraria.wiki.gg/images/Wood_armor_female.png?d68c10"
                },
                {
                  "textKey": "ArmorSetBonus.Wood",
                  "pageTitle": "Wood armor",
                  "imageRole": "part",
                  "originalUrl": "https://terraria.wiki.gg/images/Wood_Helmet.png?90520e"
                }
              ]
            }
            """
        );
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> asMapList(Object value) {
        assertTrue(value instanceof List<?>);
        return (List<Map<String, Object>>) value;
    }

    static class FakeJdbcTemplate extends JdbcTemplate {
        private final boolean projectionExists;
        private final boolean relationProjectionExists;
        private final List<String> sqlLog = new ArrayList<>();

        FakeJdbcTemplate(boolean projectionExists) {
            this(projectionExists, false);
        }

        FakeJdbcTemplate(boolean projectionExists, boolean relationProjectionExists) {
            this.projectionExists = projectionExists;
            this.relationProjectionExists = relationProjectionExists;
        }

        @Override
        public <T> T queryForObject(String sql, Class<T> requiredType, Object... args) {
            sqlLog.add(sql);
            if (sql.contains("information_schema.tables")) {
                if (args.length >= 2 && "terria_v1_relation".equals(args[0]) && "projection_armor_sets".equals(args[1])) {
                    return requiredType.cast(relationProjectionExists ? 1L : 0L);
                }
                return requiredType.cast(projectionExists ? 1L : 0L);
            }
            if (sql.contains("projection_armor_sets")) {
                return requiredType.cast(1L);
            }
            if (sql.contains("armor_sets")) {
                return requiredType.cast(1L);
            }
            return requiredType.cast(0L);
        }

        @Override
        public List<Map<String, Object>> queryForList(String sql, Object... args) {
            sqlLog.add(sql);
            if (sql.contains("`terria_v1_relation`.`projection_armor_sets`")) {
                return relationProjectionExists ? List.of(projectionRow()) : List.of();
            }
            if (sql.contains("projection_armor_sets")) {
                return List.of(projectionRow());
            }
            if (sql.contains("FROM armor_sets")) {
                return List.of(legacyRow());
            }
            if (sql.contains("SELECT internal_name, name FROM items")) {
                return List.of();
            }
            if (sql.contains("SELECT id, name, name_zh, internal_name, image FROM items")) {
                return List.of();
            }
            return List.of();
        }

        @Override
        public <T> List<T> queryForList(String sql, Class<T> elementType, Object... args) {
            sqlLog.add(sql);
            return List.of();
        }

        @Override
        public int update(String sql, Object... args) {
            sqlLog.add(sql);
            return 1;
        }

        private Map<String, Object> projectionRow() {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", 101L);
            row.put("relation_record_key", "armor-rk");
            row.put("text_key", "ArmorSetBonus.Wood");
            row.put("name", "ArmorSetBonus.Wood");
            row.put("name_zh", "ArmorSetBonus.Wood");
            row.put("name_en", "ArmorSetBonus.Wood");
            row.put("source_key", "ArmorSetBonus.Wood");
            row.put("benefit_expression", "ArmorSetBonuses.Benefits.Wood");
            row.put("benefit_zh", "ArmorSetBonuses.Benefits.Wood");
            row.put("benefit_en", "ArmorSetBonuses.Benefits.Wood");
            row.put("primary_part", null);
            row.put("set_count", 1);
            row.put("unique_item_count", 3);
            row.put("sets_json", "[[727,728,729]]");
            row.put("unique_item_ids_json", "[727,728,729]");
            row.put("current_item_ids_json", "[727,728,729]");
            row.put(
                "related_items_json",
                """
                [
                  {"sourceId":727,"internalName":"WoodHelmet","name":"Wood Helmet","partRole":"head","slotType":"headSlot","equipmentSlotId":52,"setVariantIndex":0,"partIndex":0},
                  {"sourceId":728,"internalName":"WoodBreastplate","name":"Wood Breastplate","partRole":"body","slotType":"bodySlot","equipmentSlotId":32,"setVariantIndex":0,"partIndex":1},
                  {"sourceId":729,"internalName":"WoodGreaves","name":"Wood Greaves","partRole":"legs","slotType":"legSlot","equipmentSlotId":31,"setVariantIndex":0,"partIndex":2}
                ]
                """
            );
            row.put("male_images", "https://terraria.wiki.gg/images/Wood_armor.png");
            row.put("female_images", "https://terraria.wiki.gg/images/Wood_armor_female.png");
            row.put("special_images", null);
            row.put("mapping_status", "mapped");
            row.put("status", 1);
            row.put("created_at", null);
            row.put("updated_at", null);
            return row;
        }

        private Map<String, Object> legacyRow() {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", 202L);
            row.put("source_key", "legacy-wood");
            row.put("text_key", "ArmorSetBonus.Wood");
            row.put("benefit_expression", "Legacy benefit");
            row.put("primary_part", null);
            row.put("set_count", 1);
            row.put("unique_item_count", 0);
            row.put("sets_json", "[]");
            row.put("unique_item_ids_json", "[]");
            row.put("male_images", null);
            row.put("female_images", null);
            row.put("special_images", null);
            row.put("status", 1);
            row.put("created_at", null);
            row.put("updated_at", null);
            return row;
        }
    }
}

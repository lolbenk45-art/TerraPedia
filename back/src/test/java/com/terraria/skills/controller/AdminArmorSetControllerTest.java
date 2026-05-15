package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.service.ManagedImageUrlPolicy;
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

    private static final ManagedImageUrlPolicy MANAGED_IMAGE_URL_POLICY = new ManagedImageUrlPolicy() {
        @Override
        public boolean isManagedImageUrl(String value) {
            return value != null && value.startsWith("http://localhost:9000/terrapedia-images/items/");
        }

        @Override
        public List<String> trustedManagedImageUrlPrefixes() {
            return List.of("http://localhost:9000/terrapedia-images/items/");
        }
    };

    @TempDir
    Path tempDir;

    private String originalUserDir;

    @BeforeEach
    void setUp() throws IOException {
        originalUserDir = System.getProperty("user.dir");
        Path repoRoot = tempDir.resolve("repo");
        Files.createDirectories(repoRoot.resolve("back"));
        Files.createDirectories(repoRoot.resolve("data/terraPedia/raw/wiki"));
        Files.createDirectories(repoRoot.resolve("data/generated"));
        System.setProperty("user.dir", repoRoot.resolve("back").toString());
        writeArmorSetImageSnapshot(repoRoot);
        writeArmorSetBonusSource(repoRoot);
        writeWikiArmorSetsSource(repoRoot);
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
        AdminArmorSetController controller = controller(jdbcTemplate);

        ResponseEntity<ApiResponse<List<Map<String, Object>>>> response =
            controller.getArmorSets(1, 20, null, null);

        assertEquals(200, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertEquals(1, response.getBody().getData().size());
        Map<String, Object> armorSet = response.getBody().getData().get(0);
        assertEquals("ArmorSetBonus.Wood", armorSet.get("textKey"));
        assertEquals("armor_set", armorSet.get("entityType"));
        assertEquals("traditional_set", armorSet.get("compositionKind"));
        assertEquals(null, armorSet.get("maleImages"));
        assertTrue(jdbcTemplate.sqlLog.stream().anyMatch(sql -> sql.contains("FROM projection_armor_sets")));
        assertFalse(jdbcTemplate.sqlLog.stream().anyMatch(sql -> sql.contains("FROM armor_sets")));
    }

    @Test
    void projectionSearchIncludesDisplayNameColumns() {
        FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate(true);
        AdminArmorSetController controller = controller(jdbcTemplate);

        controller.getArmorSets(1, 20, null, "神圣");

        assertTrue(jdbcTemplate.sqlLog.stream().anyMatch(sql ->
            sql.contains("name_zh LIKE ?")
                && sql.contains("name_en LIKE ?")
                && sql.contains("benefit_zh LIKE ?")
                && sql.contains("benefit_en LIKE ?")
        ));
    }

    @Test
    void getArmorSetByIdReadsProjectionTableWhenAvailable() {
        FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate(true);
        AdminArmorSetController controller = controller(jdbcTemplate);

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
    void projectionEquipmentItemsSuppressWikiImagesWhenProjectionItemImageIsMissing() {
        FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate(true, "woodWikiRelatedImage");
        AdminArmorSetController controller = controller(jdbcTemplate);

        ResponseEntity<ApiResponse<Map<String, Object>>> response = controller.getArmorSetById(101L);

        assertEquals(200, response.getStatusCode().value());
        assertNotNull(response.getBody());
        List<Map<String, Object>> equipmentItems = asMapList(response.getBody().getData().get("equipmentItems"));
        assertEquals(1, equipmentItems.size());
        assertEquals(null, equipmentItems.get(0).get("image"));
        assertFalse(String.valueOf(response.getBody().getData()).contains("terraria.wiki.gg/images"));
    }

    @Test
    void projectionDetailEnrichesEquipmentImagesReplacementGroupsAndEffectRows() {
        FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate(true, "hallowedSummoner");
        AdminArmorSetController controller = controller(jdbcTemplate);

        ResponseEntity<ApiResponse<Map<String, Object>>> response = controller.getArmorSetById(303L);

        assertEquals(200, response.getStatusCode().value());
        assertNotNull(response.getBody());
        Map<String, Object> data = response.getBody().getData();
        assertEquals(null, data.get("maleImages"));

        List<Map<String, Object>> equipmentItems = asMapList(data.get("equipmentItems"));
        assertEquals("神圣兜帽", equipmentItems.get(0).get("nameZh"));
        assertEquals("http://localhost:9000/terrapedia-images/items/hallowed-hood.png", equipmentItems.get(0).get("image"));

        List<Map<String, Object>> replacementGroups = asMapList(data.get("replacementGroups"));
        assertTrue(replacementGroups.stream().anyMatch(group -> "body".equals(group.get("partRole")) && asMapList(group.get("items")).size() == 2));
        assertTrue(replacementGroups.stream().anyMatch(group -> "legs".equals(group.get("partRole")) && asMapList(group.get("items")).size() == 2));

        List<Map<String, Object>> effectRows = asMapList(data.get("effectRows"));
        assertTrue(effectRows.stream().anyMatch(row -> String.valueOf(row.get("value")).contains("仆从上限 +2")));
        assertTrue(effectRows.stream().anyMatch(row -> String.valueOf(row.get("value")).contains("启用神圣闪避")));
    }

    @Test
    void getArmorSetsReadsRelationProjectionWhenCurrentDatabaseProjectionIsMissing() {
        FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate(false, true);
        AdminArmorSetController controller = controller(jdbcTemplate);

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
    void getArmorSetsReadsRelationProjectionWhenCurrentDatabaseProjectionIsEmpty() {
        FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate(true, true, "emptyCurrentProjection");
        AdminArmorSetController controller = controller(jdbcTemplate);

        ResponseEntity<ApiResponse<List<Map<String, Object>>>> response =
            controller.getArmorSets(1, 20, null, null);

        assertEquals(200, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertEquals(1, response.getBody().getData().size());
        assertEquals("projection", response.getBody().getData().get(0).get("dataSourceMode"));
        assertEquals("ArmorSetBonus.Wood", response.getBody().getData().get(0).get("textKey"));
        assertTrue(jdbcTemplate.sqlLog.stream().anyMatch(sql -> sql.contains("FROM projection_armor_sets")));
        assertTrue(jdbcTemplate.sqlLog.stream().anyMatch(sql -> sql.contains("FROM `terria_v1_relation`.`projection_armor_sets`")));
        assertFalse(jdbcTemplate.sqlLog.stream().anyMatch(sql -> sql.contains("FROM armor_sets")));
    }

    @Test
    void getArmorSetsFallsBackToLegacyArmorSetsWhenRelationProjectionIsEmpty() {
        FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate(false, true, "emptyRelationProjection");
        AdminArmorSetController controller = controller(jdbcTemplate);

        ResponseEntity<ApiResponse<List<Map<String, Object>>>> response =
            controller.getArmorSets(1, 20, null, null);

        assertEquals(200, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertEquals(1, response.getBody().getData().size());
        assertEquals("legacy-wood", response.getBody().getData().get(0).get("sourceKey"));
        assertEquals("legacy", response.getBody().getData().get(0).get("dataSourceMode"));
        assertTrue(jdbcTemplate.sqlLog.stream().anyMatch(sql -> sql.contains("FROM `terria_v1_relation`.`projection_armor_sets`")));
        assertTrue(jdbcTemplate.sqlLog.stream().anyMatch(sql -> sql.contains("FROM armor_sets")));
    }

    @Test
    void getArmorSetsDoesNotFallbackWhenProjectionHasRowsButCurrentPageIsEmpty() {
        FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate(true, "projectionEmptySearchPage");
        AdminArmorSetController controller = controller(jdbcTemplate);

        ResponseEntity<ApiResponse<List<Map<String, Object>>>> response =
            controller.getArmorSets(1, 20, null, "not-present");

        assertEquals(200, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertEquals(0, response.getBody().getData().size());
        assertNotNull(response.getBody().getPagination());
        assertEquals(0, response.getBody().getPagination().getTotal());
        assertTrue(jdbcTemplate.sqlLog.stream().anyMatch(sql -> sql.contains("FROM projection_armor_sets")));
        assertFalse(jdbcTemplate.sqlLog.stream().anyMatch(sql -> sql.contains("FROM armor_sets")));
    }

    @Test
    void getArmorSetsFallsBackToLegacyArmorSetsWhenProjectionTableIsMissing() {
        FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate(false);
        AdminArmorSetController controller = controller(jdbcTemplate);

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
        AdminArmorSetController controller = controller(jdbcTemplate);

        ResponseEntity<ApiResponse<Map<String, Object>>> response = controller.getArmorSetById(202L);
        Map<String, Object> data = response.getBody().getData();

        assertEquals(null, data.get("maleImages"));
        assertEquals(null, data.get("femaleImages"));
        assertEquals(null, data.get("image"));
        assertEquals(null, data.get("imageUrl"));
    }

    @Test
    void legacyFallbackUsesLatestWikiArmorSetSourceForReadableEffectAndImageStatus() {
        FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate(false, false, "legacyWslWood");
        AdminArmorSetController controller = controller(jdbcTemplate);

        ResponseEntity<ApiResponse<Map<String, Object>>> response = controller.getArmorSetById(237L);
        Map<String, Object> data = response.getBody().getData();

        assertEquals("套装奖励：+1 防御", data.get("benefitZh"));
        assertEquals("legacy", data.get("dataSourceMode"));
        assertEquals("source_images_unmanaged", data.get("imagePipelineStatus"));
        assertEquals(2, data.get("sourceImageCount"));
        assertEquals(0, data.get("managedImageCount"));
        assertEquals(null, data.get("imageUrl"));

        List<Map<String, Object>> effectRows = asMapList(data.get("effectRows"));
        assertTrue(effectRows.stream().anyMatch(row ->
            "中文效果".equals(row.get("label")) && String.valueOf(row.get("value")).contains("+1 防御")
        ));

        List<String> warnings = asStringList(data.get("dataQualityWarnings"));
        assertTrue(warnings.stream().anyMatch(warning -> warning.contains("managed armor set images are missing")));
    }

    @Test
    void updateArmorSetReturnsLegacyRowEvenWhenProjectionTableExists() {
        FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate(true);
        AdminArmorSetController controller = controller(jdbcTemplate);

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
                },
                {
                  "textKey": "ArmorSetBonus.Hallowed",
                  "pageTitle": "Hallowed armor",
                  "imageRole": "male",
                  "originalUrl": "https://terraria.wiki.gg/images/Hallowed_armor.png?8ccbab"
                },
                {
                  "textKey": "ArmorSetBonus.Hallowed",
                  "pageTitle": "Hallowed armor",
                  "imageRole": "female",
                  "originalUrl": "https://terraria.wiki.gg/images/Hallowed_armor_female.png?d683aa"
                }
              ]
            }
            """
        );
    }

    private AdminArmorSetController controller(FakeJdbcTemplate jdbcTemplate) {
        return new AdminArmorSetController(jdbcTemplate, new ObjectMapper(), MANAGED_IMAGE_URL_POLICY);
    }

    private void writeArmorSetBonusSource(Path repoRoot) throws IOException {
        Files.writeString(
            repoRoot.resolve("data/generated/wiki-armorsetbonuses.latest.json"),
            """
            {
              "content": "ArmorSetBonuses.Benefits.HallowedSummoner = function (player)\\n\\t--[[\\n\\tplayer.maxMinions += 2;\\n\\tplayer.onHitDodge = true;\\n\\t]]\\nend\\nArmorSetBonuses.Benefits.Wood = function (player)\\n\\t--[[\\n\\tplayer.statDefense += 1;\\n\\t]]\\nend"
            }
            """
        );
    }

    private void writeWikiArmorSetsSource(Path repoRoot) throws IOException {
        Files.writeString(
            repoRoot.resolve("data/generated/wiki-armor-sets.2026-04-28T03-04-18.454Z.json"),
            """
            {
              "source": "terraria.wiki.gg:Armor_sets",
              "generatedAt": "2026-04-28T03:04:18.454Z",
              "records": [
                {
                  "pageTitle": "Wood armor",
                  "nameEn": "Wood armor",
                  "nameZh": "木盔甲",
                  "images": [
                    {"url": "https://terraria.wiki.gg/images/Wood_armor.png?ef83ed", "role": "male"},
                    {"url": "https://terraria.wiki.gg/images/Wood_armor_female.png?d68c10", "role": "female"}
                  ],
                  "effectText": "套装奖励：+1 防御"
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

    @SuppressWarnings("unchecked")
    private List<String> asStringList(Object value) {
        assertTrue(value instanceof List<?>);
        return (List<String>) value;
    }

    static class FakeJdbcTemplate extends JdbcTemplate {
        private final boolean projectionExists;
        private final boolean relationProjectionExists;
        private final String projectionScenario;
        private final List<String> sqlLog = new ArrayList<>();

        FakeJdbcTemplate(boolean projectionExists) {
            this(projectionExists, false, "wood");
        }

        FakeJdbcTemplate(boolean projectionExists, String projectionScenario) {
            this(projectionExists, false, projectionScenario);
        }

        FakeJdbcTemplate(boolean projectionExists, boolean relationProjectionExists) {
            this(projectionExists, relationProjectionExists, "wood");
        }

        FakeJdbcTemplate(boolean projectionExists, boolean relationProjectionExists, String projectionScenario) {
            this.projectionExists = projectionExists;
            this.relationProjectionExists = relationProjectionExists;
            this.projectionScenario = projectionScenario;
        }

        @Override
        public <T> T queryForObject(String sql, Class<T> requiredType) {
            sqlLog.add(sql);
            return requiredType.cast(countForSql(sql));
        }

        @Override
        public <T> T queryForObject(String sql, Class<T> requiredType, Object... args) {
            sqlLog.add(sql);
            return requiredType.cast(countForSql(sql, args));
        }

        private Long countForSql(String sql, Object... args) {
            if (sql.contains("information_schema.tables")) {
                if (args.length >= 2 && "terria_v1_relation".equals(args[0]) && "projection_armor_sets".equals(args[1])) {
                    return relationProjectionExists ? 1L : 0L;
                }
                return projectionExists ? 1L : 0L;
            }
            if (sql.contains("`terria_v1_relation`.`projection_armor_sets`")) {
                return relationProjectionExists && !"emptyRelationProjection".equals(projectionScenario) ? 1L : 0L;
            }
            if (sql.contains("projection_armor_sets")) {
                if ("emptyCurrentProjection".equals(projectionScenario)) {
                    return 0L;
                }
                if ("projectionEmptySearchPage".equals(projectionScenario) && args.length > 0) {
                    return 0L;
                }
                return projectionExists ? 1L : 0L;
            }
            if (sql.contains("armor_sets")) {
                return 1L;
            }
            return 0L;
        }

        @Override
        public List<Map<String, Object>> queryForList(String sql, Object... args) {
            sqlLog.add(sql);
            if (sql.contains("`terria_v1_relation`.`projection_armor_sets`")) {
                if ("emptyRelationProjection".equals(projectionScenario)) {
                    return List.of();
                }
                return relationProjectionExists ? List.of(projectionRow()) : List.of();
            }
            if (sql.contains("projection_armor_sets")) {
                if ("emptyCurrentProjection".equals(projectionScenario)) {
                    return List.of();
                }
                if ("projectionEmptySearchPage".equals(projectionScenario) && sql.contains("ORDER BY id ASC")) {
                    return List.of();
                }
                return List.of(projectionRow());
            }
            if (sql.contains("projection_items")) {
                return projectionItemRows(args);
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
            if ("hallowedSummoner".equals(projectionScenario)) {
                return hallowedSummonerProjectionRow();
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", 101L);
            row.put("relation_record_key", "armor-rk");
            row.put("text_key", "ArmorSetBonus.Wood");
            row.put("entity_type", "armor_set");
            row.put("composition_kind", "traditional_set");
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
                "woodWikiRelatedImage".equals(projectionScenario)
                    ? """
                    [
                      {"sourceId":727,"internalName":"WoodHelmet","name":"Wood Helmet","image":"https://terraria.wiki.gg/images/Wood_Helmet.png","partRole":"head","slotType":"headSlot","equipmentSlotId":52,"setVariantIndex":0,"partIndex":0}
                    ]
                    """
                    : """
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

        private Map<String, Object> hallowedSummonerProjectionRow() {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", 303L);
            row.put("relation_record_key", "hallowed-summoner-rk");
            row.put("text_key", "ArmorSetBonus.HallowedSummoner");
            row.put("entity_type", "armor_set");
            row.put("composition_kind", "traditional_set");
            row.put("name", "ArmorSetBonus.HallowedSummoner");
            row.put("name_zh", "ArmorSetBonus.HallowedSummoner");
            row.put("name_en", "ArmorSetBonus.HallowedSummoner");
            row.put("source_key", "ArmorSetBonus.HallowedSummoner");
            row.put("benefit_expression", "ArmorSetBonuses.Benefits.HallowedSummoner");
            row.put("benefit_zh", "ArmorSetBonuses.Benefits.HallowedSummoner");
            row.put("benefit_en", "ArmorSetBonuses.Benefits.HallowedSummoner");
            row.put("primary_part", "Head");
            row.put("set_count", 4);
            row.put("unique_item_count", 6);
            row.put("sets_json", "[[4873,551,552],[4873,551,4901],[4873,4900,552],[4873,4900,4901]]");
            row.put("unique_item_ids_json", "[4873,551,552,4900,4901]");
            row.put("current_item_ids_json", "[4873,551,552,4900,4901]");
            row.put(
                "related_items_json",
                """
                [
                  {"sourceId":4873,"internalName":"HallowedHood","name":"Hallowed Hood","partRole":"head","slotType":"headSlot","equipmentSlotId":254,"setVariantIndex":0,"partIndex":0},
                  {"sourceId":551,"internalName":"HallowedPlateMail","name":"Hallowed Plate Mail","partRole":"body","slotType":"bodySlot","equipmentSlotId":24,"setVariantIndex":0,"partIndex":1},
                  {"sourceId":552,"internalName":"HallowedGreaves","name":"Hallowed Greaves","partRole":"legs","slotType":"legSlot","equipmentSlotId":23,"setVariantIndex":0,"partIndex":2},
                  {"sourceId":4873,"internalName":"HallowedHood","name":"Hallowed Hood","partRole":"head","slotType":"headSlot","equipmentSlotId":254,"setVariantIndex":1,"partIndex":0},
                  {"sourceId":551,"internalName":"HallowedPlateMail","name":"Hallowed Plate Mail","partRole":"body","slotType":"bodySlot","equipmentSlotId":24,"setVariantIndex":1,"partIndex":1},
                  {"sourceId":4901,"internalName":"AncientHallowedGreaves","name":"Ancient Hallowed Greaves","partRole":"legs","slotType":"legSlot","equipmentSlotId":212,"setVariantIndex":1,"partIndex":2},
                  {"sourceId":4873,"internalName":"HallowedHood","name":"Hallowed Hood","partRole":"head","slotType":"headSlot","equipmentSlotId":254,"setVariantIndex":2,"partIndex":0},
                  {"sourceId":4900,"internalName":"AncientHallowedPlateMail","name":"Ancient Hallowed Plate Mail","partRole":"body","slotType":"bodySlot","equipmentSlotId":229,"setVariantIndex":2,"partIndex":1},
                  {"sourceId":552,"internalName":"HallowedGreaves","name":"Hallowed Greaves","partRole":"legs","slotType":"legSlot","equipmentSlotId":23,"setVariantIndex":2,"partIndex":2},
                  {"sourceId":4873,"internalName":"HallowedHood","name":"Hallowed Hood","partRole":"head","slotType":"headSlot","equipmentSlotId":254,"setVariantIndex":3,"partIndex":0},
                  {"sourceId":4900,"internalName":"AncientHallowedPlateMail","name":"Ancient Hallowed Plate Mail","partRole":"body","slotType":"bodySlot","equipmentSlotId":229,"setVariantIndex":3,"partIndex":1},
                  {"sourceId":4901,"internalName":"AncientHallowedGreaves","name":"Ancient Hallowed Greaves","partRole":"legs","slotType":"legSlot","equipmentSlotId":212,"setVariantIndex":3,"partIndex":2}
                ]
                """
            );
            row.put("male_images", null);
            row.put("female_images", null);
            row.put("special_images", null);
            row.put("mapping_status", "mapped");
            row.put("status", 1);
            row.put("created_at", null);
            row.put("updated_at", null);
            return row;
        }

        private List<Map<String, Object>> projectionItemRows(Object... args) {
            List<Map<String, Object>> rows = new ArrayList<>();
            for (Object arg : args) {
                Long id = arg instanceof Number number ? number.longValue() : null;
            if (id == null) {
                continue;
            }
            if ("woodWikiRelatedImage".equals(projectionScenario)) {
                continue;
            }
            rows.add(projectionItemRow(id));
        }
        return rows;
        }

        private Map<String, Object> projectionItemRow(Long id) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", id);
            if (id == 4873L) {
                row.put("name", "Hallowed Hood");
                row.put("name_zh", "神圣兜帽");
                row.put("internal_name", "HallowedHood");
                row.put("image", "http://localhost:9000/terrapedia-images/items/hallowed-hood.png");
            } else if (id == 551L) {
                row.put("name", "Hallowed Plate Mail");
                row.put("name_zh", "神圣板甲");
                row.put("internal_name", "HallowedPlateMail");
                row.put("image", "http://localhost:9000/terrapedia-images/items/hallowed-plate-mail.png");
            } else if (id == 552L) {
                row.put("name", "Hallowed Greaves");
                row.put("name_zh", "神圣护胫");
                row.put("internal_name", "HallowedGreaves");
                row.put("image", "http://localhost:9000/terrapedia-images/items/hallowed-greaves.png");
            } else if (id == 4900L) {
                row.put("name", "Ancient Hallowed Plate Mail");
                row.put("name_zh", "远古神圣板甲");
                row.put("internal_name", "AncientHallowedPlateMail");
                row.put("image", "http://localhost:9000/terrapedia-images/items/ancient-hallowed-plate-mail.png");
            } else if (id == 4901L) {
                row.put("name", "Ancient Hallowed Greaves");
                row.put("name_zh", "远古神圣护胫");
                row.put("internal_name", "AncientHallowedGreaves");
                row.put("image", "http://localhost:9000/terrapedia-images/items/ancient-hallowed-greaves.png");
            } else {
                row.put("name", "Wood Helmet");
                row.put("name_zh", "木头盔");
                row.put("internal_name", "WoodHelmet");
                row.put("image", "http://localhost:9000/terrapedia-images/items/wood-helmet.png");
            }
            return row;
        }

        private Map<String, Object> legacyRow() {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", "legacyWslWood".equals(projectionScenario) ? 237L : 202L);
            row.put("source_key", "legacyWslWood".equals(projectionScenario) ? "木盔甲" : "legacy-wood");
            row.put("text_key", "ArmorSetBonus.Wood");
            row.put("benefit_expression", "legacyWslWood".equals(projectionScenario) ? "ArmorSetBonuses.Benefits.Wood" : "Legacy benefit");
            row.put("primary_part", null);
            row.put("set_count", 1);
            row.put("unique_item_count", "legacyWslWood".equals(projectionScenario) ? 3 : 0);
            row.put("sets_json", "[]");
            row.put("unique_item_ids_json", "legacyWslWood".equals(projectionScenario) ? "[727,728,729]" : "[]");
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

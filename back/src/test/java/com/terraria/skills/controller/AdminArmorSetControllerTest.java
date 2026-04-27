package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.common.ApiResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminArmorSetControllerTest {

    @TempDir
    Path tempDir;

    @Mock
    private JdbcTemplate jdbcTemplate;

    private String originalUserDir;
    private AdminArmorSetController controller;

    @BeforeEach
    void setUp() throws IOException {
        originalUserDir = System.getProperty("user.dir");
        Path repoRoot = tempDir.resolve("repo");
        Files.createDirectories(repoRoot.resolve("back"));
        Files.createDirectories(repoRoot.resolve("data/terraPedia/raw/wiki"));
        System.setProperty("user.dir", repoRoot.resolve("back").toString());
        writeArmorSetImageSnapshot(repoRoot);
        controller = new AdminArmorSetController(jdbcTemplate, new ObjectMapper());
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
    void shouldUseLatestArmorSetImageSnapshotWhenDbImageFieldsAreEmpty() {
        when(jdbcTemplate.queryForList(contains("FROM armor_sets WHERE id = ?"), eq(1L)))
            .thenReturn(List.of(Map.of(
                "id", 1L,
                "source_key", "木盔甲",
                "text_key", "ArmorSetBonus.Wood",
                "sets_json", "[]",
                "unique_item_ids_json", "[]",
                "status", 1
            )));
        when(jdbcTemplate.queryForList(
            contains("FROM armor_set_items"),
            eq(Long.class),
            eq(1L)
        )).thenReturn(List.of());

        ResponseEntity<ApiResponse<Map<String, Object>>> response = controller.getArmorSetById(1L);
        Map<String, Object> data = response.getBody().getData();

        assertEquals("https://terraria.wiki.gg/images/Wood_armor.png?ef83ed", data.get("maleImages"));
        assertEquals("https://terraria.wiki.gg/images/Wood_armor_female.png?d68c10", data.get("femaleImages"));
        assertEquals("https://terraria.wiki.gg/images/Wood_armor.png?ef83ed", data.get("image"));
        assertEquals("https://terraria.wiki.gg/images/Wood_armor.png?ef83ed", data.get("imageUrl"));
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
}

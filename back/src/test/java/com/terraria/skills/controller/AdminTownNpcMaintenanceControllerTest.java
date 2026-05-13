package com.terraria.skills.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import com.terraria.skills.service.SupportDomainService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AdminTownNpcMaintenanceControllerTest {

    private static final ManagedImageUrlPolicy MANAGED_IMAGE_URL_POLICY = new ManagedImageUrlPolicy() {
        @Override
        public boolean isManagedImageUrl(String value) {
            return value != null && value.startsWith("http://localhost:9000/terrapedia-images/");
        }

        @Override
        public List<String> trustedManagedImageUrlPrefixes() {
            return List.of("http://localhost:9000/terrapedia-images/");
        }
    };

    @Mock
    private JdbcTemplate jdbcTemplate;

    @Mock
    private ObjectMapper objectMapper;

    @Mock
    private SupportDomainService supportDomainService;

    @TempDir
    Path tempDir;

    private String originalUserDir;
    private Path repoRoot;
    private Map<String, Object> maintenanceReport = Map.of();
    private Map<String, Object> importReport = Map.of();
    private Map<String, Object> npcStandardizedMap = Map.of("records", Map.of());
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() throws Exception {
        originalUserDir = System.getProperty("user.dir");
        repoRoot = tempDir.resolve("repo");
        Files.createDirectories(repoRoot.resolve("back"));
        Files.createDirectories(repoRoot.resolve("data-query-app"));
        Files.createDirectories(repoRoot.resolve("scripts"));
        Files.createDirectories(repoRoot.resolve("data/generated"));
        System.setProperty("user.dir", repoRoot.resolve("back").toString());
        writeGeneratedFile("wiki-town-npc-maintenance.latest.json");
        writeGeneratedFile("wiki-town-npc-import.latest.json");
        writeGeneratedFile("npc-standardized-map.json");

        AdminTownNpcMaintenanceController controller = new AdminTownNpcMaintenanceController(
            jdbcTemplate,
            objectMapper,
            supportDomainService,
            MANAGED_IMAGE_URL_POLICY
        );
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();

        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", 7L);
        row.put("gameId", 1007001L);
        row.put("internalName", "Guide");
        row.put("name", "Guide");
        row.put("nameZh", "向导");
        row.put("gamePeriodId", 3L);
        row.put("behaviorNotes", "Offers advice to new players.");
        row.put("updatedAt", "2026-04-20T02:00:00Z");
        row.put("categoryName", null);
        row.put("shopEntryCount", 0);

        when(jdbcTemplate.query(contains("FROM npcs n"), any(RowMapper.class))).thenReturn(List.of(row));
        when(jdbcTemplate.query(contains("FROM npc_shop_entries nse"), any(RowMapper.class), anyLong())).thenReturn(List.of());
        doNothing().when(jdbcTemplate).query(contains("FROM items"), any(RowCallbackHandler.class));

        when(objectMapper.readValue(any(File.class), any(TypeReference.class))).thenAnswer(invocation -> {
            File file = invocation.getArgument(0);
            return switch (file.getName()) {
                case "wiki-town-npc-maintenance.latest.json" -> maintenanceReport;
                case "wiki-town-npc-import.latest.json" -> importReport;
                case "npc-standardized-map.json" -> npcStandardizedMap;
                default -> Map.of();
            };
        });

        when(supportDomainService.getGamePeriodLabel(any())).thenAnswer(invocation -> {
            Long gamePeriodId = invocation.getArgument(0);
            if (gamePeriodId == null || gamePeriodId == 0) {
                return "未设置";
            }
            if (gamePeriodId == 3L) {
                return "支撑域-第三阶段";
            }
            return "阶段 " + gamePeriodId;
        });
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
    void shouldProjectGamePeriodLabelsFromSupportDomainService() throws Exception {
        mockMvc.perform(get("/admin/town-npcs/maintenance"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.records[0].gamePeriodId").value(3))
            .andExpect(jsonPath("$.data.records[0].gamePeriodLabel").value("支撑域-第三阶段"));
    }

    @Test
    void shouldSummarizeTownNpcBatchValidationSignals() throws Exception {
        Map<String, Object> scrapedRecord = new LinkedHashMap<>();
        scrapedRecord.put("gameId", 1007001L);
        scrapedRecord.put("pageTitle", "向导");
        scrapedRecord.put("pageUrl", "https://terraria.wiki.gg/zh/wiki/Guide");
        scrapedRecord.put("functionSummary", "Provides tips.");
        scrapedRecord.put("moveInSummary", "A house is available.");
        scrapedRecord.put("shopItems", List.of(
            Map.of("nameZh", "火把", "nameEn", "Torch", "priceText", "50 CC"),
            Map.of("nameZh", "绳", "nameEn", "Rope", "priceText", "10 CC")
        ));

        maintenanceReport = Map.of("records", List.of(scrapedRecord));

        mockMvc.perform(get("/admin/town-npcs/maintenance"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.summary.totalTownNpcs").value(1))
            .andExpect(jsonPath("$.data.summary.missingShopEntriesCount").value(1))
            .andExpect(jsonPath("$.data.summary.scrapedCount").value(1))
            .andExpect(jsonPath("$.data.summary.missingScrapeCount").value(0))
            .andExpect(jsonPath("$.data.summary.unmatchedShopNpcCount").value(1))
            .andExpect(jsonPath("$.data.summary.unmatchedShopItemCount").value(2))
            .andExpect(jsonPath("$.data.summary.rowsNeedingAttentionCount").value(1));
    }

    @Test
    void shouldUseManagedRawJsonSnakeCaseNpcImageUrlInMaintenanceOverview() throws Exception {
        String managedUrl = "http://localhost:9000/terrapedia-images/npcs/guide.png";
        String rawJson = "{\"image_url\":\"" + managedUrl + "\"}";
        Map<String, Object> generatedRecord = new LinkedHashMap<>();
        generatedRecord.put("gameId", 1007001L);
        generatedRecord.put("rawJson", rawJson);

        npcStandardizedMap = Map.of("records", Map.of("1007001", generatedRecord));
        when(objectMapper.readValue(eq(rawJson), any(TypeReference.class))).thenReturn(
            Map.of("image_url", managedUrl)
        );

        mockMvc.perform(get("/admin/town-npcs/maintenance"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.records[0].imageUrl").value(managedUrl));
    }

    @Test
    void shouldUseManagedGeneratedSnakeCaseNpcImageUrlInMaintenanceOverview() throws Exception {
        String managedUrl = "http://localhost:9000/terrapedia-images/npcs/guide-snake.png";
        Map<String, Object> generatedRecord = new LinkedHashMap<>();
        generatedRecord.put("gameId", 1007001L);
        generatedRecord.put("image_url", managedUrl);

        npcStandardizedMap = Map.of("records", Map.of("1007001", generatedRecord));

        mockMvc.perform(get("/admin/town-npcs/maintenance"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.records[0].imageUrl").value(managedUrl));
    }

    @Test
    void shouldFallbackToManagedRawJsonImageWhenGeneratedImagesAreWikiUrlsInMaintenanceOverview() throws Exception {
        String managedUrl = "http://localhost:9000/terrapedia-images/npcs/guide-raw.png";
        String rawJson = "{\"image_url\":\"" + managedUrl + "\"}";
        Map<String, Object> generatedRecord = new LinkedHashMap<>();
        generatedRecord.put("gameId", 1007001L);
        generatedRecord.put("imageUrl", "https://terraria.wiki.gg/images/Guide.png");
        generatedRecord.put("image_url", "https://terraria.wiki.gg/images/Guide_alt.png");
        generatedRecord.put("rawJson", rawJson);

        npcStandardizedMap = Map.of("records", Map.of("1007001", generatedRecord));
        when(objectMapper.readValue(eq(rawJson), any(TypeReference.class))).thenReturn(
            Map.of("image_url", managedUrl)
        );

        mockMvc.perform(get("/admin/town-npcs/maintenance"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.records[0].imageUrl").value(managedUrl));
    }

    @Test
    void shouldSuppressWikiSnakeCaseNpcImageUrlInMaintenanceOverview() throws Exception {
        Map<String, Object> generatedRecord = new LinkedHashMap<>();
        generatedRecord.put("gameId", 1007001L);
        generatedRecord.put("image_url", "https://terraria.wiki.gg/images/Guide.png");

        npcStandardizedMap = Map.of("records", Map.of("1007001", generatedRecord));

        mockMvc.perform(get("/admin/town-npcs/maintenance"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.records[0].imageUrl").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void shouldSuppressWikiRawJsonSnakeCaseNpcImageUrlInMaintenanceOverview() throws Exception {
        String rawJson = "{\"image_url\":\"https://terraria.wiki.gg/images/Guide.png\"}";
        Map<String, Object> generatedRecord = new LinkedHashMap<>();
        generatedRecord.put("gameId", 1007001L);
        generatedRecord.put("rawJson", rawJson);

        npcStandardizedMap = Map.of("records", Map.of("1007001", generatedRecord));
        when(objectMapper.readValue(eq(rawJson), any(TypeReference.class))).thenReturn(
            Map.of("image_url", "https://terraria.wiki.gg/images/Guide.png")
        );

        mockMvc.perform(get("/admin/town-npcs/maintenance"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.records[0].imageUrl").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void shouldSuppressWikiNpcImageUrlInMaintenanceOverview() throws Exception {
        Map<String, Object> generatedRecord = new LinkedHashMap<>();
        generatedRecord.put("gameId", 1007001L);
        generatedRecord.put("imageUrl", "https://terraria.wiki.gg/images/Guide.png");

        npcStandardizedMap = Map.of("records", Map.of("1007001", generatedRecord));

        mockMvc.perform(get("/admin/town-npcs/maintenance"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.records[0].imageUrl").value(org.hamcrest.Matchers.nullValue()));
    }

    private void writeGeneratedFile(String fileName) throws IOException {
        Files.writeString(repoRoot.resolve("data/generated").resolve(fileName), "{}");
    }
}

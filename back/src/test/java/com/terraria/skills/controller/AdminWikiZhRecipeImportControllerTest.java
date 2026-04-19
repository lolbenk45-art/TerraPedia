package com.terraria.skills.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.io.File;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AdminWikiZhRecipeImportControllerTest {

    @Mock
    private ObjectMapper objectMapper;

    @Mock
    private JdbcTemplate jdbcTemplate;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() throws Exception {
        AdminWikiZhRecipeImportController controller = new AdminWikiZhRecipeImportController(objectMapper, jdbcTemplate);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();

        when(objectMapper.readValue(any(File.class), any(TypeReference.class))).thenReturn(Map.of(
            "insertedRecipes", 3571,
            "createdStations", List.of(Map.of("id", 1L, "nameZh", "工作台"))
        ));

        when(jdbcTemplate.queryForObject(anyString(), eq(Long.class), eq("wiki_zh"))).thenAnswer(invocation -> {
            String sql = invocation.getArgument(0, String.class);
            if (sql.contains("COUNT(DISTINCT r.result_item_id)") && sql.contains("NOT EXISTS")) {
                return 1067L;
            }
            if (sql.contains("COUNT(*)") && sql.contains("status = 0") && sql.contains("EXISTS")) {
                return 0L;
            }
            if (sql.contains("COUNT(*)") && sql.contains("status = 1") && sql.contains("NOT EXISTS")) {
                return 1106L;
            }
            if (sql.contains("COUNT(DISTINCT result_item_id)") && sql.contains("status = 1")) {
                return 3179L;
            }
            if (sql.contains("COUNT(DISTINCT result_item_id)")) {
                return 3179L;
            }
            if (sql.contains("recipe_stations rs")) {
                return 55L;
            }
            if (sql.contains("recipe_ingredients ri")) {
                return 0L;
            }
            if (sql.contains("rs.station_id IS NULL")) {
                return 0L;
            }
            if (sql.contains("status = 1")) {
                return 3571L;
            }
            return 3571L;
        });

        when(jdbcTemplate.queryForObject(anyString(), eq(Long.class), eq("wiki_zh_recipe_import"))).thenReturn(3L);

        when(jdbcTemplate.query(anyString(), any(RowMapper.class), eq("wiki_zh"))).thenAnswer(invocation -> {
            String sql = invocation.getArgument(0, String.class);
            if (sql.contains("GROUP BY source_page") && sql.contains("status = 1")) {
                return List.of(row("sourcePage", "配方/工作台", "recipeCount", 947L, "resultItemCount", 865L));
            }
            if (sql.contains("GROUP BY source_page")) {
                return List.of(row("sourcePage", "配方/工作台", "recipeCount", 947L, "resultItemCount", 865L));
            }
            return List.of();
        });

        when(jdbcTemplate.query(anyString(), any(RowMapper.class), eq("wiki_zh_recipe_import"))).thenReturn(List.of(
            row("id", 1L, "internalName", "PlaceholderItem", "name", "Placeholder Item", "nameZh", "占位物品", "updatedAt", "2026-04-20T00:00:00Z")
        ));

        when(jdbcTemplate.query(contains("topProvider"), any(RowMapper.class))).thenReturn(List.of(
            row("provider", "wiki_gg", "resultItemCount", 1818L),
            row("provider", "wiki_zh", "resultItemCount", 1067L)
        ));

        when(jdbcTemplate.query(contains("GROUP BY COALESCE(source_provider"), any(RowMapper.class))).thenReturn(List.of(
            row("provider", "wiki_zh", "recipeCount", 3571L, "resultItemCount", 3179L),
            row("provider", "wiki_gg", "recipeCount", 259L, "resultItemCount", 124L)
        ));
    }

    @Test
    void shouldExposeRecipeCanonicalAuditSignals() throws Exception {
        mockMvc.perform(get("/admin/recipe-imports/wiki-zh"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.sourceProvider").value("wiki_zh"))
            .andExpect(jsonPath("$.data.database.recipeCount").value(3571))
            .andExpect(jsonPath("$.data.database.activeRecipeCount").value(3571))
            .andExpect(jsonPath("$.data.database.gapOnlyActiveRecipeCount").value(1106))
            .andExpect(jsonPath("$.data.database.gapOnlyActiveResultItemCount").value(1067))
            .andExpect(jsonPath("$.data.database.suppressedOverlapRecipeCount").value(0))
            .andExpect(jsonPath("$.data.database.placeholderItemCount").value(3))
            .andExpect(jsonPath("$.data.topProviderResultItemDistribution[0].provider").value("wiki_gg"))
            .andExpect(jsonPath("$.data.activeRecipeDistribution[0].provider").value("wiki_zh"))
            .andExpect(jsonPath("$.data.topSourcePages[0].sourcePage").value("配方/工作台"))
            .andExpect(jsonPath("$.data.activeTopSourcePages[0].sourcePage").value("配方/工作台"));
    }

    private Map<String, Object> row(Object... pairs) {
        Map<String, Object> row = new LinkedHashMap<>();
        for (int index = 0; index < pairs.length; index += 2) {
            row.put(String.valueOf(pairs[index]), pairs[index + 1]);
        }
        return row;
    }
}

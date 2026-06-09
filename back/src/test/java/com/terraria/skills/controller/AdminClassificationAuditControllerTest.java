package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AdminClassificationAuditControllerTest {

    private JdbcTemplate jdbcTemplate;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        jdbcTemplate = mock(JdbcTemplate.class);
        ObjectMapper objectMapper = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

        mockMvc = MockMvcBuilders.standaloneSetup(new AdminClassificationAuditController(jdbcTemplate))
            .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
            .build();
    }

    @Test
    void shouldReturnFiveReadOnlyAuditSectionsWithPagination() throws Exception {
        when(jdbcTemplate.queryForObject(anyString(), eq(Long.class))).thenReturn(0L);
        when(jdbcTemplate.queryForList(anyString(), eq(20), eq(0L))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(anyString(), eq(10), eq(10L))).thenReturn(List.of(
            Map.of("id", 100L, "name", "Uncategorized")
        ));

        mockMvc.perform(get("/admin/operations/classification-audit")
                .param("page", "2")
                .param("limit", "10"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.uncategorizedItems.key").value("uncategorizedItems"))
            .andExpect(jsonPath("$.data.uncategorizedNpcs.key").value("uncategorizedNpcs"))
            .andExpect(jsonPath("$.data.unknownDropSourceKinds.key").value("unknownDropSourceKinds"))
            .andExpect(jsonPath("$.data.missingReferences.key").value("missingReferences"))
            .andExpect(jsonPath("$.data.itemCategoryConflicts.key").value("itemCategoryConflicts"))
            .andExpect(jsonPath("$.data.uncategorizedItems.rows").isArray())
            .andExpect(jsonPath("$.data.uncategorizedItems.pagination.page").value(2))
            .andExpect(jsonPath("$.data.uncategorizedItems.pagination.limit").value(10));
    }

    @Test
    void shouldExposeNoWriteMappings() {
        for (Method method : AdminClassificationAuditController.class.getDeclaredMethods()) {
            assertFalse(method.isAnnotationPresent(PostMapping.class), "classification audit must not expose POST");
            assertFalse(method.isAnnotationPresent(PutMapping.class), "classification audit must not expose PUT");
            assertFalse(method.isAnnotationPresent(PatchMapping.class), "classification audit must not expose PATCH");
            assertFalse(method.isAnnotationPresent(DeleteMapping.class), "classification audit must not expose DELETE");
        }
    }
}

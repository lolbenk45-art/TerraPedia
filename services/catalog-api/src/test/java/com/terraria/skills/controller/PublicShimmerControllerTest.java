package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.handler.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class PublicShimmerControllerTest {

    @Mock
    private JdbcTemplate jdbcTemplate;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        PublicShimmerController controller = new PublicShimmerController(jdbcTemplate);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .setControllerAdvice(new GlobalExceptionHandler())
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldExposeShimmerContext() throws Exception {
        when(jdbcTemplate.queryForList(anyString())).thenReturn(List.of(
            Map.of("id", 1L, "code", "SHIMMER", "nameZh", "微光", "nameEn", "Shimmer",
                "contextType", "MECHANIC", "sortOrder", 30)
        ));

        mockMvc.perform(get("/public/shimmer/context"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.code").value("SHIMMER"))
            .andExpect(jsonPath("$.data.nameZh").value("微光"))
            .andExpect(jsonPath("$.data.nameEn").value("Shimmer"));
    }

    @Test
    void shouldReturnNotFoundWhenContextMissing() throws Exception {
        when(jdbcTemplate.queryForList(anyString())).thenReturn(List.of());

        mockMvc.perform(get("/public/shimmer/context"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.success").value(false));
    }

    @Test
    void shouldListItemTransformsWithPagination() throws Exception {
        when(jdbcTemplate.queryForObject(anyString(), eq(Long.class), any(Object[].class)))
            .thenReturn(3L);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
            .thenReturn(List.of(
                Map.of("id", 1L, "inputKind", "item", "inputNameZh", "木剑",
                    "outputKind", "item", "outputNameZh", "金剑", "sortOrder", 0)
            ));

        mockMvc.perform(get("/public/shimmer/datasets/item-transforms")
                .param("page", "1")
                .param("limit", "20"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.pagination.total").value(3))
            .andExpect(jsonPath("$.pagination.page").value(1))
            .andExpect(jsonPath("$.data[0].id").value(1))
            .andExpect(jsonPath("$.data[0].inputNameZh").value("木剑"))
            .andExpect(jsonPath("$.data[0].outputNameZh").value("金剑"))
            // source tracking fields must not appear
            .andExpect(jsonPath("$.data[0].sourceProvider").doesNotExist())
            .andExpect(jsonPath("$.data[0].sourcePage").doesNotExist())
            .andExpect(jsonPath("$.data[0].deleted").doesNotExist());
    }

    @Test
    void shouldReturn400ForInvalidDataset() throws Exception {
        mockMvc.perform(get("/public/shimmer/datasets/invalid"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.success").value(false));
    }

    @Test
    void shouldReturn400ForEmptyDatasetName() throws Exception {
        // empty path segment resolves to the {dataset} path variable as a blank string
        // The controller normalises it to null → 400
        mockMvc.perform(get("/public/shimmer/datasets/   "))
            .andExpect(status().isBadRequest());
    }

    @Test
    void shouldNotExposeWriteEndpoints() throws Exception {
        // GlobalExceptionHandler catches HttpRequestMethodNotSupportedException via the
        // generic Exception handler (status 500), because MockMvc standaloneSetup does not
        // register Spring MVC's default ResponseEntityExceptionHandler.  The important
        // assertion is that no write operation succeeds (2xx), regardless of the exact
        // non-2xx code returned.
        int putStatus  = mockMvc.perform(put("/public/shimmer/context"))
            .andReturn().getResponse().getStatus();
        int postStatus = mockMvc.perform(post("/public/shimmer/datasets/item-transforms"))
            .andReturn().getResponse().getStatus();
        int deleteStatus = mockMvc.perform(delete("/public/shimmer/datasets/item-transforms"))
            .andReturn().getResponse().getStatus();

        org.junit.jupiter.api.Assertions.assertTrue(
            putStatus >= 400,
            "PUT /public/shimmer/context must not return 2xx, got: " + putStatus
        );
        org.junit.jupiter.api.Assertions.assertTrue(
            postStatus >= 400,
            "POST /public/shimmer/datasets/item-transforms must not return 2xx, got: " + postStatus
        );
        org.junit.jupiter.api.Assertions.assertTrue(
            deleteStatus >= 400,
            "DELETE /public/shimmer/datasets/item-transforms must not return 2xx, got: " + deleteStatus
        );
    }
}

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
import static org.mockito.ArgumentMatchers.anyLong;
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
class PublicAudioAssetControllerTest {

    @Mock
    private JdbcTemplate jdbcTemplate;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        PublicAudioAssetController controller = new PublicAudioAssetController(jdbcTemplate);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .setControllerAdvice(new GlobalExceptionHandler())
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldListAudioAssetsWithPaginationAndFilters() throws Exception {
        when(jdbcTemplate.queryForObject(anyString(), eq(Long.class), any(Object[].class)))
            .thenReturn(5L);
        Map<String, Object> row1 = new java.util.LinkedHashMap<>();
        row1.put("id", 1L);
        row1.put("assetId", "music_terraria_1");
        row1.put("shard", "music");
        row1.put("kind", "BGM");
        row1.put("sourceKey", "terraria_1");
        row1.put("displayNameZh", "泰拉瑞亚主题曲");
        row1.put("displayNameEn", "Terraria");
        row1.put("fileTitle", "Terraria.ogg");
        row1.put("wikiFileUrl", "https://wiki.gg/File:Terraria.ogg");
        row1.put("sha256", "abc123");
        row1.put("status", "active");
        row1.put("lastVerifiedAt", null);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
            .thenReturn(List.of(row1));

        mockMvc.perform(get("/public/audio")
                .param("page", "1")
                .param("limit", "20")
                .param("kind", "BGM"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.pagination.total").value(5))
            .andExpect(jsonPath("$.data[0].id").value(1))
            .andExpect(jsonPath("$.data[0].assetId").value("music_terraria_1"))
            .andExpect(jsonPath("$.data[0].shard").value("music"))
            .andExpect(jsonPath("$.data[0].kind").value("BGM"))
            .andExpect(jsonPath("$.data[0].displayNameZh").value("泰拉瑞亚主题曲"))
            .andExpect(jsonPath("$.data[0].wikiFileUrl").value("https://wiki.gg/File:Terraria.ogg"))
            // sensitive fields must not appear
            .andExpect(jsonPath("$.data[0].localPath").doesNotExist())
            .andExpect(jsonPath("$.data[0].sourceUrl").doesNotExist())
            .andExpect(jsonPath("$.data[0].mime").doesNotExist())
            .andExpect(jsonPath("$.data[0].sizeBytes").doesNotExist());
    }

    @Test
    void shouldReturnAudioAssetDetail() throws Exception {
        Map<String, Object> detailRow = new java.util.LinkedHashMap<>();
        detailRow.put("id", 42L);
        detailRow.put("assetId", "sfx_sword");
        detailRow.put("shard", "sfx");
        detailRow.put("kind", "SFX");
        detailRow.put("sourceKey", "sword_1");
        detailRow.put("displayNameZh", "剑击音效");
        detailRow.put("displayNameEn", "Sword Hit");
        detailRow.put("fileTitle", "SwordHit.wav");
        detailRow.put("wikiFileUrl", "https://wiki.gg/File:SwordHit.wav");
        detailRow.put("sha256", "def456");
        detailRow.put("status", "active");
        detailRow.put("provider", "wiki_gg");
        detailRow.put("lastVerifiedAt", null);
        detailRow.put("createdAt", null);
        when(jdbcTemplate.queryForList(anyString(), any(Object.class)))
            .thenReturn(List.of(detailRow));

        mockMvc.perform(get("/public/audio/42"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.id").value(42))
            .andExpect(jsonPath("$.data.assetId").value("sfx_sword"))
            .andExpect(jsonPath("$.data.displayNameZh").value("剑击音效"))
            .andExpect(jsonPath("$.data.provider").value("wiki_gg"))
            .andExpect(jsonPath("$.data.localPath").doesNotExist())
            .andExpect(jsonPath("$.data.sourceUrl").doesNotExist())
            .andExpect(jsonPath("$.data.mime").doesNotExist())
            .andExpect(jsonPath("$.data.sizeBytes").doesNotExist());
    }

    @Test
    void shouldReturnNotFoundForMissingAudioAsset() throws Exception {
        when(jdbcTemplate.queryForList(anyString(), any(Object.class))).thenReturn(List.of());

        mockMvc.perform(get("/public/audio/9999"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.success").value(false));
    }

    @Test
    void shouldReturnDistinctKinds() throws Exception {
        when(jdbcTemplate.queryForList(anyString()))
            .thenReturn(List.of(
                Map.of("kind", "BGM"),
                Map.of("kind", "SFX")
            ));

        mockMvc.perform(get("/public/audio/kinds"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0]").value("BGM"))
            .andExpect(jsonPath("$.data[1]").value("SFX"));
    }

    @Test
    void shouldNotExposeWriteEndpoints() throws Exception {
        // Write methods must not return 2xx on any mapped path
        int putStatus    = mockMvc.perform(put("/public/audio/1")).andReturn().getResponse().getStatus();
        int postStatus   = mockMvc.perform(post("/public/audio")).andReturn().getResponse().getStatus();
        int deleteStatus = mockMvc.perform(delete("/public/audio/1")).andReturn().getResponse().getStatus();

        org.junit.jupiter.api.Assertions.assertTrue(
            putStatus >= 400,
            "PUT /public/audio/1 must not return 2xx, got: " + putStatus
        );
        org.junit.jupiter.api.Assertions.assertTrue(
            postStatus >= 400,
            "POST /public/audio must not return 2xx, got: " + postStatus
        );
        org.junit.jupiter.api.Assertions.assertTrue(
            deleteStatus >= 400,
            "DELETE /public/audio/1 must not return 2xx, got: " + deleteStatus
        );
    }
}

package com.terraria.skills.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AdminAudioAssetControllerTest {

    private JdbcTemplate jdbcTemplate;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        jdbcTemplate = mock(JdbcTemplate.class);
        mockMvc = MockMvcBuilders
            .standaloneSetup(new AdminAudioAssetController(jdbcTemplate))
            .build();
    }

    @Test
    void shouldReturnAudioAssetSummary() throws Exception {
        when(jdbcTemplate.queryForObject(anyString(), any(Class.class))).thenReturn(428L, 428L);
        when(jdbcTemplate.queryForList(anyString())).thenReturn(
            List.of(Map.of("shard", "bgm", "total", 104L), Map.of("shard", "npc_hit", "total", 58L)),
            List.of(Map.of("match_status", "unmatched", "total", 428L))
        );

        mockMvc.perform(get("/admin/audio-assets/summary"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.totalAssets").value(428))
            .andExpect(jsonPath("$.data.totalLinks").value(428))
            .andExpect(jsonPath("$.data.shardCounts.bgm").value(104))
            .andExpect(jsonPath("$.data.shardCounts.npc_hit").value(58))
            .andExpect(jsonPath("$.data.matchStatusCounts.unmatched").value(428));
    }

    @Test
    void shouldReturnPagedAudioAssetsWithoutAbsoluteLocalPath() throws Exception {
        when(jdbcTemplate.queryForObject(anyString(), any(Class.class), any(Object[].class))).thenReturn(1L);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(zombieHitAudioAssetRow()));

        mockMvc.perform(get("/admin/audio-assets")
                .param("search", "Zombie")
                .param("shard", "npc_hit")
                .param("kind", "npc")
                .param("status", "downloaded")
                .param("matchStatus", "unmatched")
                .param("page", "1")
                .param("limit", "20"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].id").value(17))
            .andExpect(jsonPath("$.data[0].assetId").value("npc_hit:Zombie_0"))
            .andExpect(jsonPath("$.data[0].shard").value("npc_hit"))
            .andExpect(jsonPath("$.data[0].kind").value("npc"))
            .andExpect(jsonPath("$.data[0].sourceKey").value("Zombie"))
            .andExpect(jsonPath("$.data[0].fileTitle").value("File:NPC Hit 1.wav"))
            .andExpect(jsonPath("$.data[0].wikiFileUrl").value("https://terraria.wiki.gg/wiki/File:NPC_Hit_1.wav"))
            .andExpect(jsonPath("$.data[0].sourceUrl").value("https://terraria.wiki.gg/wiki/Zombie"))
            .andExpect(jsonPath("$.data[0].localPath").value("media/audio/wiki/npc_hit/NPC_Hit_1.wav"))
            .andExpect(jsonPath("$.data[0].mime").value("audio/wav"))
            .andExpect(jsonPath("$.data[0].sizeBytes").value(8192))
            .andExpect(jsonPath("$.data[0].sha256").value("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"))
            .andExpect(jsonPath("$.data[0].status").value("downloaded"))
            .andExpect(jsonPath("$.data[0].lastVerifiedAt").value("2026-06-02T08:30:00Z"))
            .andExpect(jsonPath("$.data[0].linkCount").value(1))
            .andExpect(jsonPath("$.data[0].matchStatuses").value("unmatched"))
            .andExpect(jsonPath("$.data[0].absoluteLocalPath").doesNotExist())
            .andExpect(jsonPath("$.pagination.total").value(1))
            .andExpect(jsonPath("$.pagination.page").value(1))
            .andExpect(jsonPath("$.pagination.limit").value(20));

        verify(jdbcTemplate).queryForList(contains("aa.shard = ?"), any(Object[].class));
        verify(jdbcTemplate).queryForList(contains("aal.match_status = ?"), any(Object[].class));
    }

    @Test
    void shouldSuppressAbsoluteLookingLocalPathValues() throws Exception {
        when(jdbcTemplate.queryForObject(anyString(), any(Class.class), any(Object[].class))).thenReturn(1L);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(absolutePathAudioAssetRow()));

        mockMvc.perform(get("/admin/audio-assets"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].assetId").value("bgm:Overworld"))
            .andExpect(jsonPath("$.data[0].localPath").value(""));
    }

    private static Map<String, Object> zombieHitAudioAssetRow() {
        return Map.ofEntries(
            Map.entry("id", 17L),
            Map.entry("asset_id", "npc_hit:Zombie_0"),
            Map.entry("shard", "npc_hit"),
            Map.entry("kind", "npc"),
            Map.entry("source_key", "Zombie"),
            Map.entry("file_title", "File:NPC Hit 1.wav"),
            Map.entry("wiki_file_url", "https://terraria.wiki.gg/wiki/File:NPC_Hit_1.wav"),
            Map.entry("source_url", "https://terraria.wiki.gg/wiki/Zombie"),
            Map.entry("local_path", "media/audio/wiki/npc_hit/NPC_Hit_1.wav"),
            Map.entry("mime", "audio/wav"),
            Map.entry("size_bytes", 8192L),
            Map.entry("sha256", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
            Map.entry("status", "downloaded"),
            Map.entry("last_verified_at", Timestamp.from(Instant.parse("2026-06-02T08:30:00Z"))),
            Map.entry("link_count", 1L),
            Map.entry("match_statuses", "unmatched")
        );
    }

    private static Map<String, Object> absolutePathAudioAssetRow() {
        return Map.ofEntries(
            Map.entry("id", 18L),
            Map.entry("asset_id", "bgm:Overworld"),
            Map.entry("shard", "bgm"),
            Map.entry("kind", "bgm"),
            Map.entry("source_key", "Overworld"),
            Map.entry("file_title", "File:Overworld.wav"),
            Map.entry("wiki_file_url", "https://terraria.wiki.gg/wiki/File:Overworld.wav"),
            Map.entry("source_url", "https://terraria.wiki.gg/wiki/Music"),
            Map.entry("local_path", "/home/lolben/data/terraPedia/media/audio/wiki/bgm/Overworld.wav"),
            Map.entry("mime", "audio/wav"),
            Map.entry("size_bytes", 1024L),
            Map.entry("sha256", "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd"),
            Map.entry("status", "downloaded"),
            Map.entry("last_verified_at", Timestamp.from(Instant.parse("2026-06-02T08:30:00Z"))),
            Map.entry("link_count", 1L),
            Map.entry("match_statuses", "unmatched")
        );
    }
}

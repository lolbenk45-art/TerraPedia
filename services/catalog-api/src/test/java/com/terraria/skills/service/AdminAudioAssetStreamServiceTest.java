package com.terraria.skills.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AdminAudioAssetStreamServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void resolvesActiveRelativeAudioFileUnderMediaRoot() throws Exception {
        Path mediaRoot = tempDir.resolve("media").resolve("audio").resolve("wiki");
        Path file = mediaRoot.resolve("bgm").resolve("music-aether.mp3");
        Files.createDirectories(file.getParent());
        Files.writeString(file, "audio");
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(row(
            "data/terraPedia/media/audio/wiki/bgm/music-aether.mp3",
            "audio/mpeg",
            5L,
            "Music-Aether.mp3"
        )));
        AdminAudioAssetStreamService service = new AdminAudioAssetStreamService(jdbcTemplate, mediaRoot);

        AdminAudioAssetStreamService.AudioStreamPayload payload = service.loadStream(1L);

        assertEquals("audio/mpeg", payload.contentType());
        assertEquals(5L, payload.contentLength());
        assertEquals("Music-Aether.mp3", payload.filename());
        assertTrue(payload.resource().exists());
    }

    @Test
    void resolvesShortRelativeAudioFileUnderMediaRoot() throws Exception {
        Path mediaRoot = tempDir.resolve("media").resolve("audio").resolve("wiki");
        Path file = mediaRoot.resolve("items").resolve("item-1.wav");
        Files.createDirectories(file.getParent());
        Files.writeString(file, "audio");
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(row(
            "media/audio/wiki/items/item-1.wav",
            "audio/x-wav",
            5L,
            "Item_1.wav"
        )));
        AdminAudioAssetStreamService service = new AdminAudioAssetStreamService(jdbcTemplate, mediaRoot);

        AdminAudioAssetStreamService.AudioStreamPayload payload = service.loadStream(1L);

        assertEquals("audio/wav", payload.contentType());
        assertEquals(5L, payload.contentLength());
        assertEquals("Item_1.wav", payload.filename());
        assertTrue(payload.resource().exists());
    }

    @Test
    void rejectsPathTraversalOutsideMediaRoot() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(row(
            "data/terraPedia/media/audio/wiki/../secrets.mp3",
            "audio/mpeg",
            1L,
            "secrets.mp3"
        )));
        AdminAudioAssetStreamService service = new AdminAudioAssetStreamService(
            jdbcTemplate,
            tempDir.resolve("media").resolve("audio").resolve("wiki")
        );

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> service.loadStream(1L));

        assertEquals(HttpStatus.NOT_FOUND, error.getStatusCode());
    }

    @Test
    void rejectsAbsoluteLocalPathFromDatabase() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(row(
            "/tmp/audio.mp3",
            "audio/mpeg",
            1L,
            "audio.mp3"
        )));
        AdminAudioAssetStreamService service = new AdminAudioAssetStreamService(
            jdbcTemplate,
            tempDir.resolve("media").resolve("audio").resolve("wiki")
        );

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> service.loadStream(1L));

        assertEquals(HttpStatus.NOT_FOUND, error.getStatusCode());
    }

    @Test
    void rejectsWindowsAbsoluteLocalPathFromDatabase() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(row(
            "C:\\terraPedia\\media\\audio\\wiki\\bgm\\audio.mp3",
            "audio/mpeg",
            1L,
            "audio.mp3"
        )));
        AdminAudioAssetStreamService service = new AdminAudioAssetStreamService(
            jdbcTemplate,
            tempDir.resolve("media").resolve("audio").resolve("wiki")
        );

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> service.loadStream(1L));

        assertEquals(HttpStatus.NOT_FOUND, error.getStatusCode());
    }

    @Test
    void returnsNotFoundWhenAssetRowMissing() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());
        AdminAudioAssetStreamService service = new AdminAudioAssetStreamService(
            jdbcTemplate,
            tempDir.resolve("media").resolve("audio").resolve("wiki")
        );

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> service.loadStream(999L));

        assertEquals(HttpStatus.NOT_FOUND, error.getStatusCode());
    }

    @Test
    void returnsNotFoundWhenLocalFileMissing() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(row(
            "data/terraPedia/media/audio/wiki/items/item-1.wav",
            "audio/wav",
            10L,
            "Item_1.wav"
        )));
        AdminAudioAssetStreamService service = new AdminAudioAssetStreamService(
            jdbcTemplate,
            tempDir.resolve("media").resolve("audio").resolve("wiki")
        );

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> service.loadStream(1L));

        assertEquals(HttpStatus.NOT_FOUND, error.getStatusCode());
    }

    @Test
    void rejectsSymlinkEscapeOutsideMediaRoot() throws Exception {
        Path mediaRoot = tempDir.resolve("media").resolve("audio").resolve("wiki");
        Path outside = tempDir.resolve("outside.mp3");
        Path link = mediaRoot.resolve("bgm").resolve("escape.mp3");
        Files.createDirectories(link.getParent());
        Files.writeString(outside, "secret");
        Files.createSymbolicLink(link, outside);
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(row(
            "data/terraPedia/media/audio/wiki/bgm/escape.mp3",
            "audio/mpeg",
            6L,
            "escape.mp3"
        )));
        AdminAudioAssetStreamService service = new AdminAudioAssetStreamService(jdbcTemplate, mediaRoot);

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> service.loadStream(1L));

        assertEquals(HttpStatus.NOT_FOUND, error.getStatusCode());
    }

    @Test
    void rejectsInactiveAudioAssetStatusByQueryContract() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());
        AdminAudioAssetStreamService service = new AdminAudioAssetStreamService(
            jdbcTemplate,
            tempDir.resolve("media").resolve("audio").resolve("wiki")
        );

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> service.loadStream(1L));

        assertEquals(HttpStatus.NOT_FOUND, error.getStatusCode());
    }

    private static Map<String, Object> row(String localPath, String mime, Long size, String fileTitle) {
        return Map.of(
            "id", 1L,
            "asset_id", "bgm:music-aether",
            "local_path", localPath,
            "mime", mime,
            "size_bytes", size,
            "file_title", fileTitle
        );
    }
}

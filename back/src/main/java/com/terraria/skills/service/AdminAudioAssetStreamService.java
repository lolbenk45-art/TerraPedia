package com.terraria.skills.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

@Service
public class AdminAudioAssetStreamService {

    private static final Path AUDIO_MEDIA_PREFIX = Path.of("data", "terraPedia", "media", "audio", "wiki");
    private static final Path SHORT_AUDIO_MEDIA_PREFIX = Path.of("media", "audio", "wiki");

    private final JdbcTemplate jdbcTemplate;
    private final Path audioMediaRoot;

    @Autowired
    public AdminAudioAssetStreamService(
        JdbcTemplate jdbcTemplate,
        @Value("${terrapedia.audio-media-root:/home/lolben/data/terraPedia/media/audio/wiki}") String audioMediaRoot
    ) {
        this(jdbcTemplate, Path.of(audioMediaRoot));
    }

    public AdminAudioAssetStreamService(JdbcTemplate jdbcTemplate, Path audioMediaRoot) {
        this.jdbcTemplate = jdbcTemplate;
        this.audioMediaRoot = audioMediaRoot.toAbsolutePath().normalize();
    }

    public AudioStreamPayload loadStream(Long id) {
        if (id == null || id <= 0) {
            throw notFound();
        }
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
            SELECT id, asset_id, local_path, mime, size_bytes, file_title
            FROM audio_assets
            WHERE id = ? AND deleted = 0 AND status IN ('active', 'downloaded')
            LIMIT 1
            """,
            id
        );
        if (rows.isEmpty()) {
            throw notFound();
        }

        Map<String, Object> row = rows.get(0);
        Path file = resolveSafeAudioPath(text(row.get("local_path")));
        if (!Files.isRegularFile(file) || !Files.isReadable(file)) {
            throw notFound();
        }
        return new AudioStreamPayload(
            new FileSystemResource(file),
            contentType(text(row.get("mime"))),
            file.toFile().length(),
            filename(row)
        );
    }

    private Path resolveSafeAudioPath(String localPath) {
        if (localPath.isBlank()) {
            throw notFound();
        }
        if (looksLikeWindowsAbsolutePath(localPath)) {
            throw notFound();
        }
        Path relative = Path.of(localPath);
        if (relative.isAbsolute()) {
            throw notFound();
        }

        Path normalizedRelative = relative.normalize();
        Path suffix = audioSuffix(normalizedRelative);
        if (suffix == null || suffix.isAbsolute() || suffix.startsWith("..")) {
            throw notFound();
        }

        try {
            Path rootReal = audioMediaRoot.toRealPath();
            Path fileReal = audioMediaRoot.resolve(suffix).normalize().toRealPath();
            if (!fileReal.startsWith(rootReal) || !Files.isRegularFile(fileReal)) {
                throw notFound();
            }
            return fileReal;
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (Exception exception) {
            throw notFound();
        }
    }

    private boolean looksLikeWindowsAbsolutePath(String localPath) {
        return localPath.matches("^[A-Za-z]:[\\\\/].*") || localPath.startsWith("\\\\");
    }

    private Path audioSuffix(Path normalizedRelative) {
        if (normalizedRelative.startsWith(AUDIO_MEDIA_PREFIX)) {
            return AUDIO_MEDIA_PREFIX.relativize(normalizedRelative);
        }
        if (normalizedRelative.startsWith(SHORT_AUDIO_MEDIA_PREFIX)) {
            return SHORT_AUDIO_MEDIA_PREFIX.relativize(normalizedRelative);
        }
        return null;
    }

    private String contentType(String mime) {
        if ("audio/wav".equalsIgnoreCase(mime) || "audio/x-wav".equalsIgnoreCase(mime)) {
            return "audio/wav";
        }
        if ("audio/ogg".equalsIgnoreCase(mime)) {
            return "audio/ogg";
        }
        return "audio/mpeg";
    }

    private String filename(Map<String, Object> row) {
        String fileTitle = text(row.get("file_title")).replaceFirst("^File:", "");
        if (!fileTitle.isBlank()) {
            return fileTitle.replaceAll("[\\\\/\\r\\n]", "_");
        }
        String fallback = text(row.get("asset_id")).replaceAll("[^A-Za-z0-9._-]", "_");
        return fallback.isBlank() ? "audio-asset" : fallback;
    }

    private String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Audio asset not found");
    }

    public record AudioStreamPayload(Resource resource, String contentType, long contentLength, String filename) {
    }
}

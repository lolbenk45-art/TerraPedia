package com.terraria.skills.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Objects;

/**
 * Spring-side adapter for the repository's single project constants manifest.
 * It owns path resolution only; API payloads should use repositoryRelative().
 */
public final class ProjectConstants {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String MANIFEST_RELATIVE = "scripts/config/project.constants.json";

    private final Path repoRoot;
    private final JsonNode manifest;

    private ProjectConstants(Path repoRoot, JsonNode manifest) {
        this.repoRoot = repoRoot;
        this.manifest = manifest;
    }

    public static ProjectConstants load(Path root) {
        Path normalizedRoot = Objects.requireNonNull(root, "root").toAbsolutePath().normalize();
        Path manifestPath = normalizedRoot.resolve(MANIFEST_RELATIVE);
        try {
            JsonNode manifest = MAPPER.readTree(Files.newBufferedReader(manifestPath));
            if (!"terrapedia".equals(manifest.path("project").path("id").asText())) {
                throw new IllegalArgumentException("Project constants must declare project.id=terrapedia: " + manifestPath);
            }
            requireObject(manifest, "roots", manifestPath);
            return new ProjectConstants(normalizedRoot, manifest);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to load project constants from " + manifestPath, error);
        }
    }

    public static ProjectConstants discover() {
        String configured = firstText(System.getProperty("terrapedia.repo-root"), System.getenv("TERRAPEDIA_REPO_ROOT"));
        Path start = configured.isBlank() ? Path.of(System.getProperty("user.dir")) : Path.of(configured);
        Path root = findManifestRoot(start.toAbsolutePath().normalize());
        return load(root);
    }

    public Path repoRoot() {
        return repoRoot;
    }

    public Path root(String key) {
        return resolve("roots." + key);
    }

    public Path dataLayer(String key) {
        return resolve("dataLayers." + key);
    }

    public Path evidence(String key) {
        return resolve("evidence." + key);
    }

    public Path crawler(String key) {
        return resolve("crawler." + key);
    }

    public Path application(String key) {
        return resolve("applications." + key + ".currentPath");
    }

    public Path resolve(String key) {
        String value = textValue(key);
        Path relative = Path.of(value);
        if (relative.isAbsolute()) {
            throw new IllegalArgumentException("Project constant must be relative: " + key + "=" + value);
        }
        Path resolved = repoRoot.resolve(relative).normalize();
        if (!resolved.startsWith(repoRoot)) {
            throw new IllegalArgumentException("Project constant escapes repository root: " + key + "=" + value);
        }
        return resolved;
    }

    public String repositoryRelative(Path path) {
        Path normalized = Objects.requireNonNull(path, "path").toAbsolutePath().normalize();
        if (!normalized.startsWith(repoRoot)) {
            throw new IllegalArgumentException("Path escapes repository root: " + normalized);
        }
        return repoRoot.relativize(normalized).toString().replace(normalized.getFileSystem().getSeparator(), "/");
    }

    private String textValue(String key) {
        JsonNode value = manifest;
        for (String segment : key.split("\\.")) {
            value = value == null ? null : value.get(segment);
        }
        if (value == null || !value.isTextual() || value.asText().isBlank()) {
            throw new IllegalArgumentException("Missing project constant: " + key + " (root=" + repoRoot + ")");
        }
        return value.asText();
    }

    private static void requireObject(JsonNode manifest, String key, Path manifestPath) {
        if (!manifest.path(key).isObject()) {
            throw new IllegalArgumentException("Project constants missing object " + key + ": " + manifestPath);
        }
    }

    private static Path findManifestRoot(Path start) {
        Path current = start;
        while (current != null) {
            if (Files.isRegularFile(current.resolve(MANIFEST_RELATIVE))) return current;
            Path parent = current.getParent();
            if (parent == null || parent.equals(current)) break;
            current = parent;
        }
        throw new IllegalStateException("Unable to find " + MANIFEST_RELATIVE + " from " + start);
    }

    private static String firstText(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value.trim();
        }
        return "";
    }
}

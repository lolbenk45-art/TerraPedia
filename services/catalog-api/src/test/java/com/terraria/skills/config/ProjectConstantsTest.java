package com.terraria.skills.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ProjectConstantsTest {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void loadsTypedRootsAndApplicationAliasesFromTargetLayout() throws Exception {
        Path root = temporaryRepository();
        ProjectConstants constants = ProjectConstants.load(root);

        assertEquals(root.resolve("reports"), constants.root("reports"));
        assertEquals(root.resolve("data/canonical"), constants.dataLayer("canonical"));
        assertEquals(root.resolve("apps/public-web"), constants.application("publicWeb"));
        assertEquals("reports/crawler-monitor/run.json", constants.repositoryRelative(
            root.resolve("reports/crawler-monitor/run.json")));
    }

    @Test
    void rejectsTraversalAndAbsoluteManifestPaths() throws Exception {
        Path root = temporaryRepository();
        Path manifest = root.resolve("scripts/config/project.constants.json");
        Map<String, Object> invalid = Map.of(
            "project", Map.of("id", "terrapedia"),
            "roots", Map.of("reports", "../outside", "data", "data", "scripts", "scripts"));
        MAPPER.writeValue(manifest.toFile(), invalid);

        ProjectConstants constants = ProjectConstants.load(root);
        assertThrows(IllegalArgumentException.class, () -> constants.root("reports"));
    }

    @Test
    void discoversFromExplicitSystemPropertyWithoutExposingAbsoluteResponsePaths() throws Exception {
        Path root = temporaryRepository();
        String previous = System.getProperty("terrapedia.repo-root");
        try {
            System.setProperty("terrapedia.repo-root", root.toString());
            ProjectConstants constants = ProjectConstants.discover();
            assertEquals(root, constants.repoRoot());
            assertEquals("apps/admin-console", constants.repositoryRelative(constants.application("adminConsole")));
        } finally {
            if (previous == null) System.clearProperty("terrapedia.repo-root");
            else System.setProperty("terrapedia.repo-root", previous);
        }
    }

    private static Path temporaryRepository() throws Exception {
        Path root = Files.createTempDirectory("terrapedia-project-constants-");
        Files.createDirectories(root.resolve("scripts/config"));
        Files.createDirectories(root.resolve("apps/public-web"));
        Files.createDirectories(root.resolve("apps/admin-console"));
        Files.createDirectories(root.resolve("reports/crawler-monitor"));
        MAPPER.writeValue(root.resolve("scripts/config/project.constants.json").toFile(), Map.of(
            "project", Map.of("id", "terrapedia"),
            "roots", Map.of("reports", "reports", "data", "data", "scripts", "scripts"),
            "applications", Map.of(
                "publicWeb", Map.of("currentPath", "apps/public-web"),
                "adminConsole", Map.of("currentPath", "apps/admin-console")),
            "dataLayers", Map.of("canonical", "data/canonical")));
        return root;
    }
}

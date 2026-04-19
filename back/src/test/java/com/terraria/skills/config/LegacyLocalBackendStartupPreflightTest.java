package com.terraria.skills.config;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.OptionalLong;

import static org.junit.jupiter.api.Assertions.assertEquals;

class LegacyLocalBackendStartupPreflightTest {

    @TempDir
    Path tempDir;

    private String originalUserDir;
    private String originalAppPortProperty;
    private String originalProfilesProperty;

    @BeforeEach
    void captureState() {
        originalUserDir = System.getProperty("user.dir");
        originalAppPortProperty = System.getProperty("APP_PORT");
        originalProfilesProperty = System.getProperty("spring.profiles.active");
    }

    @AfterEach
    void restoreState() {
        restoreProperty("user.dir", originalUserDir);
        restoreProperty("APP_PORT", originalAppPortProperty);
        restoreProperty("spring.profiles.active", originalProfilesProperty);
    }

    @Test
    void shouldTriggerPortCleanupWhenLegacyProfileIsActive() throws IOException {
        Path repoRoot = createRepoRoot();
        writeLocalStackConfig(repoRoot, """
            {
              "backend": {
                "port": 8888
              }
            }
            """);
        System.setProperty("user.dir", repoRoot.resolve("back").toString());
        System.setProperty("spring.profiles.active", "legacy");
        CapturingPortCleaner cleaner = new CapturingPortCleaner();

        new LegacyLocalBackendStartupPreflight(cleaner).prepare(new String[0]);

        assertEquals(8888, cleaner.port);
        assertEquals(repoRoot, cleaner.repoRoot);
    }

    @Test
    void shouldUseSystemAppPortOverride() throws IOException {
        Path repoRoot = createRepoRoot();
        writeLocalStackConfig(repoRoot, """
            {
              "backend": {
                "port": 8888
              }
            }
            """);
        System.setProperty("user.dir", repoRoot.resolve("back").toString());
        System.setProperty("spring.profiles.active", "legacy");
        System.setProperty("APP_PORT", "18093");
        CapturingPortCleaner cleaner = new CapturingPortCleaner();

        new LegacyLocalBackendStartupPreflight(cleaner).prepare(new String[0]);

        assertEquals(18093, cleaner.port);
    }

    @Test
    void shouldSkipWhenLegacyProfileIsInactive() throws IOException {
        Path repoRoot = createRepoRoot();
        writeLocalStackConfig(repoRoot, """
            {
              "backend": {
                "port": 8888
              }
            }
            """);
        System.setProperty("user.dir", repoRoot.resolve("back").toString());
        CapturingPortCleaner cleaner = new CapturingPortCleaner();

        new LegacyLocalBackendStartupPreflight(cleaner).prepare(new String[0]);

        assertEquals(0, cleaner.port);
    }

    private Path createRepoRoot() throws IOException {
        Path repoRoot = tempDir.resolve("repo");
        Files.createDirectories(repoRoot.resolve("back"));
        Files.createDirectories(repoRoot.resolve("scripts/dev/config"));
        return repoRoot;
    }

    private void writeLocalStackConfig(Path repoRoot, String content) throws IOException {
        Files.writeString(repoRoot.resolve("scripts/dev/config/local-stack.config.json"), content);
    }

    private void restoreProperty(String name, String value) {
        if (value == null) {
            System.clearProperty(name);
        } else {
            System.setProperty(name, value);
        }
    }

    private static final class CapturingPortCleaner extends LegacyLocalBackendPortCleaner {

        private int port;
        private Path repoRoot;

        private CapturingPortCleaner() {
            super(
                ignored -> OptionalLong.empty(),
                ignored -> Optional.empty(),
                ignored -> true,
                () -> 0L
            );
        }

        @Override
        void releaseIfOwnedByOldBackend(int port, Path repoRoot) {
            this.port = port;
            this.repoRoot = repoRoot;
        }
    }
}

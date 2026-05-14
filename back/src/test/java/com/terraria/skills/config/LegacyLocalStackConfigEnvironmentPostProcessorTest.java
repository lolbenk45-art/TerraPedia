package com.terraria.skills.config;

import com.terraria.skills.SkillsBackApplication;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.SpringApplication;
import org.springframework.mock.env.MockEnvironment;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.OptionalLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LegacyLocalStackConfigEnvironmentPostProcessorTest {

    @TempDir
    Path tempDir;

    private String originalUserDir;
    private String originalAppPortProperty;

    @BeforeEach
    void captureUserDir() {
        originalUserDir = System.getProperty("user.dir");
        originalAppPortProperty = System.getProperty("APP_PORT");
    }

    @AfterEach
    void restoreUserDir() {
        if (originalUserDir == null) {
            System.clearProperty("user.dir");
        } else {
            System.setProperty("user.dir", originalUserDir);
        }

        if (originalAppPortProperty == null) {
            System.clearProperty("APP_PORT");
        } else {
            System.setProperty("APP_PORT", originalAppPortProperty);
        }
    }

    @Test
    void shouldLoadLocalStackConfigPropertiesWhenLegacyProfileIsActive() throws IOException {
        Path repoRoot = createRepoRoot();
        writeLocalStackConfig(repoRoot, """
            {
              "backend": {
                "port": 9999
              },
              "database": {
                "username": "local-user",
                "password": "local-db-pass"
              },
              "redis": {
                "host": "127.0.0.1",
                "port": 6380,
                "database": 0,
                "password": "redis-pass"
              },
              "auth": {
                "admin": {
                  "username": "admin",
                  "password": "admin-pass",
                  "displayName": "Admin",
                  "tokenSecret": "admin-secret"
                },
                "user": {
                  "tokenSecret": "user-secret"
                }
              },
              "minio": {
                "enabled": true,
                "credentialsFile": "scripts/dev/config/credentials.json",
                "endpoint": "http://172.21.96.1:9000",
                "publicEndpoint": "http://localhost:9000",
                "bucket": "terrapedia-images",
                "objectPrefix": "items"
              }
            }
            """);
        System.setProperty("user.dir", repoRoot.resolve("back").toString());

        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("legacy");

        new LegacyLocalStackConfigEnvironmentPostProcessor(new NoopPortCleaner())
            .postProcessEnvironment(environment, new SpringApplication(SkillsBackApplication.class));

        assertEquals("9999", environment.getProperty("APP_PORT"));
        assertEquals("local-user", environment.getProperty("TERRAPEDIA_DB_USERNAME"));
        assertEquals("local-db-pass", environment.getProperty("TERRAPEDIA_DB_PASSWORD"));
        assertEquals("admin-pass", environment.getProperty("TERRAPEDIA_ADMIN_PASSWORD"));
        assertEquals("admin-secret", environment.getProperty("TERRAPEDIA_AUTH_TOKEN_SECRET"));
        assertEquals("user-secret", environment.getProperty("TERRAPEDIA_USER_TOKEN_SECRET"));
        assertEquals("true", environment.getProperty("TERRAPEDIA_MINIO_ENABLED"));
        assertEquals(
            repoRoot.resolve("scripts/dev/config/credentials.json").normalize().toString(),
            environment.getProperty("TERRAPEDIA_MINIO_CREDENTIALS_FILE")
        );
        assertEquals("http://172.21.96.1:9000", environment.getProperty("TERRAPEDIA_MINIO_ENDPOINT"));
        assertEquals("http://localhost:9000", environment.getProperty("TERRAPEDIA_MINIO_PUBLIC_ENDPOINT"));
        assertEquals("terrapedia-images", environment.getProperty("TERRAPEDIA_MINIO_BUCKET"));
        assertEquals("items", environment.getProperty("TERRAPEDIA_MINIO_OBJECT_PREFIX"));
        assertTrue(environment.getPropertySources().contains(
            LegacyLocalStackConfigEnvironmentPostProcessor.PROPERTY_SOURCE_NAME
        ));
    }

    @Test
    void shouldRequestPortCleanupWhenLegacyProfileIsActive() throws IOException {
        Path repoRoot = createRepoRoot();
        writeLocalStackConfig(repoRoot, """
            {
              "backend": {
                "port": 8888
              },
              "auth": {
                "admin": {
                  "password": "admin-pass",
                  "tokenSecret": "admin-secret"
                },
                "user": {
                  "tokenSecret": "user-secret"
                }
              }
            }
            """);
        System.setProperty("user.dir", repoRoot.resolve("back").toString());

        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("legacy");
        CapturingPortCleaner cleaner = new CapturingPortCleaner();

        new LegacyLocalStackConfigEnvironmentPostProcessor(cleaner)
            .postProcessEnvironment(environment, new SpringApplication(SkillsBackApplication.class));

        assertEquals(8888, cleaner.port);
        assertEquals(repoRoot, cleaner.repoRoot);
    }

    @Test
    void shouldUseSystemAppPortOverrideWhenRequestingCleanup() throws IOException {
        Path repoRoot = createRepoRoot();
        writeLocalStackConfig(repoRoot, """
            {
              "backend": {
                "port": 8888
              },
              "auth": {
                "admin": {
                  "password": "admin-pass",
                  "tokenSecret": "admin-secret"
                },
                "user": {
                  "tokenSecret": "user-secret"
                }
              }
            }
            """);
        System.setProperty("user.dir", repoRoot.resolve("back").toString());
        System.setProperty("APP_PORT", "18093");

        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("legacy");
        CapturingPortCleaner cleaner = new CapturingPortCleaner();

        new LegacyLocalStackConfigEnvironmentPostProcessor(cleaner)
            .postProcessEnvironment(environment, new SpringApplication(SkillsBackApplication.class));

        assertEquals(18093, cleaner.port);
    }

    @Test
    void shouldNotLoadLocalStackConfigWhenLegacyProfileIsInactive() throws IOException {
        Path repoRoot = createRepoRoot();
        writeLocalStackConfig(repoRoot, """
            {
              "auth": {
                "admin": {
                  "password": "admin-pass",
                  "tokenSecret": "admin-secret"
                },
                "user": {
                  "tokenSecret": "user-secret"
                }
              }
            }
            """);
        System.setProperty("user.dir", repoRoot.resolve("back").toString());

        MockEnvironment environment = new MockEnvironment();

        new LegacyLocalStackConfigEnvironmentPostProcessor(new NoopPortCleaner())
            .postProcessEnvironment(environment, new SpringApplication(SkillsBackApplication.class));

        assertNull(environment.getProperty("TERRAPEDIA_ADMIN_PASSWORD"));
        assertFalse(environment.getPropertySources().contains(
            LegacyLocalStackConfigEnvironmentPostProcessor.PROPERTY_SOURCE_NAME
        ));
    }

    @Test
    void shouldNotOverrideExistingEnvironmentProperties() throws IOException {
        Path repoRoot = createRepoRoot();
        writeLocalStackConfig(repoRoot, """
            {
              "auth": {
                "admin": {
                  "password": "admin-pass",
                  "tokenSecret": "admin-secret"
                },
                "user": {
                  "tokenSecret": "user-secret"
                }
              }
            }
            """);
        System.setProperty("user.dir", repoRoot.resolve("back").toString());

        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("legacy");
        environment.setProperty("TERRAPEDIA_ADMIN_PASSWORD", "already-set");

        new LegacyLocalStackConfigEnvironmentPostProcessor(new NoopPortCleaner())
            .postProcessEnvironment(environment, new SpringApplication(SkillsBackApplication.class));

        assertEquals("already-set", environment.getProperty("TERRAPEDIA_ADMIN_PASSWORD"));
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

    private static final class NoopPortCleaner extends LegacyLocalBackendPortCleaner {

        private NoopPortCleaner() {
            super(
                ignored -> OptionalLong.empty(),
                ignored -> Optional.empty(),
                ignored -> true,
                () -> 0L
            );
        }
    }
}

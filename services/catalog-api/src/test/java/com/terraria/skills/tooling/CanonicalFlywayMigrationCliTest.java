package com.terraria.skills.tooling;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class CanonicalFlywayMigrationCliTest {

    @Test
    void exactFormalEnvironmentBuildsOneBoundedJdbcConfiguration() {
        CanonicalFlywayMigrationCli.DatabaseConfig config =
            CanonicalFlywayMigrationCli.readDatabaseConfig(environment());

        assertEquals(
            "jdbc:mysql://127.0.0.1:3306/terria_v1_local"
                + "?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai"
                + "&allowMultiQueries=true",
            config.jdbcUrl()
        );
        assertEquals("migration-user", config.username());
        assertEquals("migration-secret", config.password());
    }

    @Test
    void targetIdentityAndJdbcHostInputFailClosed() {
        Map<String, String> wrongOperation = environment();
        wrongOperation.put("TERRAPEDIA_SCHEMA_OPERATION_ID", "other-operation");
        assertThrows(IllegalArgumentException.class,
            () -> CanonicalFlywayMigrationCli.readDatabaseConfig(wrongOperation));

        Map<String, String> wrongDatabase = environment();
        wrongDatabase.put("TERRAPEDIA_DB_NAME", "scratch");
        assertThrows(IllegalArgumentException.class,
            () -> CanonicalFlywayMigrationCli.readDatabaseConfig(wrongDatabase));

        Map<String, String> unsafeHost = environment();
        unsafeHost.put("TERRAPEDIA_DB_HOST", "127.0.0.1/formal?allowMultiQueries=false");
        assertThrows(IllegalArgumentException.class,
            () -> CanonicalFlywayMigrationCli.readDatabaseConfig(unsafeHost));
    }

    @Test
    void migrationStartsOnlyFromRegisteredV55OrAlreadyRecoveredV58() {
        CanonicalFlywayMigrationCli.requireSupportedCurrentVersion("55");
        CanonicalFlywayMigrationCli.requireSupportedCurrentVersion("58");

        assertThrows(IllegalStateException.class,
            () -> CanonicalFlywayMigrationCli.requireSupportedCurrentVersion(null));
        assertThrows(IllegalStateException.class,
            () -> CanonicalFlywayMigrationCli.requireSupportedCurrentVersion("57"));
    }

    private static Map<String, String> environment() {
        Map<String, String> env = new HashMap<>();
        env.put("TERRAPEDIA_SCHEMA_OPERATION_ID", "canonical-schema-v56-v58");
        env.put("TERRAPEDIA_DB_NAME", "terria_v1_local");
        env.put("TERRAPEDIA_DB_HOST", "127.0.0.1");
        env.put("TERRAPEDIA_DB_PORT", "3306");
        env.put("TERRAPEDIA_DB_USERNAME", "migration-user");
        env.put("TERRAPEDIA_DB_PASSWORD", "migration-secret");
        return env;
    }
}

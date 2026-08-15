package com.terraria.skills.tooling;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.flywaydb.core.api.MigrationVersion;
import org.flywaydb.core.api.output.MigrateResult;

import java.util.LinkedHashMap;
import java.util.Map;

public final class CanonicalFlywayMigrationCli {

    private static final String OPERATION_ID = "canonical-schema-v56-v58";
    private static final String DATABASE = "terria_v1_local";

    private CanonicalFlywayMigrationCli() {
    }

    public static void main(String[] args) throws Exception {
        DatabaseConfig database = readDatabaseConfig(System.getenv());

        Flyway flyway = Flyway.configure()
            .dataSource(database.jdbcUrl(), database.username(), database.password())
            .locations("classpath:db/migration")
            .target(MigrationVersion.fromVersion("58"))
            .validateMigrationNaming(true)
            .validateOnMigrate(true)
            .baselineOnMigrate(false)
            .load();

        MigrationInfo current = flyway.info().current();
        String previousVersion = current == null || current.getVersion() == null
            ? null : current.getVersion().getVersion();
        requireSupportedCurrentVersion(previousVersion);

        MigrateResult migrateResult = flyway.migrate();
        MigrationInfo migrated = flyway.info().current();
        String currentVersion = migrated == null || migrated.getVersion() == null
            ? null : migrated.getVersion().getVersion();
        if (!"58".equals(currentVersion)) {
            throw new IllegalStateException("canonical schema migration did not reach Flyway version 58");
        }

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("schemaVersion", 1);
        report.put("operationId", OPERATION_ID);
        report.put("status", "completed");
        report.put("databaseName", DATABASE);
        report.put("previousVersion", previousVersion);
        report.put("currentVersion", currentVersion);
        report.put("migrationsExecuted", migrateResult.migrationsExecuted);
        System.out.println(new ObjectMapper().writeValueAsString(report));
    }

    static DatabaseConfig readDatabaseConfig(Map<String, String> env) {
        requireExact(env, "TERRAPEDIA_SCHEMA_OPERATION_ID", OPERATION_ID);
        requireExact(env, "TERRAPEDIA_DB_NAME", DATABASE);
        String host = requireHost(env.get("TERRAPEDIA_DB_HOST"));
        int port = requirePort(env.get("TERRAPEDIA_DB_PORT"));
        String username = requireText(env.get("TERRAPEDIA_DB_USERNAME"), "TERRAPEDIA_DB_USERNAME");
        String password = requireText(env.get("TERRAPEDIA_DB_PASSWORD"), "TERRAPEDIA_DB_PASSWORD");
        String jdbcUrl = "jdbc:mysql://" + host + ":" + port + "/" + DATABASE
            + "?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai"
            + "&allowMultiQueries=true";
        return new DatabaseConfig(jdbcUrl, username, password);
    }

    static void requireSupportedCurrentVersion(String previousVersion) {
        if (!"55".equals(previousVersion) && !"58".equals(previousVersion)) {
            throw new IllegalStateException(
                "canonical schema migration requires registered Flyway version 55 or recovered version 58; found "
                    + previousVersion
            );
        }
    }

    record DatabaseConfig(String jdbcUrl, String username, String password) {
    }

    private static void requireExact(Map<String, String> env, String key, String expected) {
        String actual = requireText(env.get(key), key);
        if (!expected.equals(actual)) {
            throw new IllegalArgumentException(key + " must be exactly " + expected);
        }
    }

    private static String requireHost(String value) {
        String host = requireText(value, "TERRAPEDIA_DB_HOST");
        if (!host.matches("[A-Za-z0-9._:-]+") || host.contains("/") || host.contains("?")) {
            throw new IllegalArgumentException("TERRAPEDIA_DB_HOST is invalid");
        }
        return host;
    }

    private static int requirePort(String value) {
        try {
            int port = Integer.parseInt(requireText(value, "TERRAPEDIA_DB_PORT"));
            if (port < 1 || port > 65535) {
                throw new IllegalArgumentException("TERRAPEDIA_DB_PORT is invalid");
            }
            return port;
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException("TERRAPEDIA_DB_PORT is invalid", exception);
        }
    }

    private static String requireText(String value, String label) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + " is required");
        }
        return value.trim();
    }
}

package com.terraria.skills.config;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertTrue;

class LogbackConfigurationTest {

    @Test
    void shouldConfigureBoundedRollingFileLogs() throws Exception {
        String config = Files.readString(Path.of("src/main/resources/logback-spring.xml"));

        assertTrue(config.contains("RollingFileAppender"));
        assertTrue(config.contains("source=\"terraria.logging.file-root\""));
        assertTrue(config.contains("${TERRARIA_LOG_FILE_ROOT:-logs}"));
        assertTrue(config.contains("terrapedia-app.%d{yyyy-MM-dd}.%i.log.gz"));
        assertTrue(config.contains("terrapedia-security.%d{yyyy-MM-dd}.%i.log.gz"));
        assertTrue(config.contains("${TERRARIA_LOG_MAX_HISTORY:-14}"));
        assertTrue(config.contains("${TERRARIA_LOG_TOTAL_SIZE_CAP:-1GB}"));
        assertTrue(config.contains("com.terraria.skills.security"));
        assertTrue(config.contains("com.terraria.skills.auth"));
        assertTrue(config.contains("SecurityAuditServiceImpl"));
    }
}

package com.terraria.skills.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AdminJwtServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void shouldCreateAndParseValidToken() {
        AdminAuthProperties properties = buildProperties();
        AdminJwtService service = new AdminJwtService(properties, objectMapper);

        AdminTokenClaims issued = service.issueToken();
        String token = service.createToken(issued);
        AdminTokenClaims parsed = service.parseAndValidate(token);

        assertEquals(properties.getUsername(), parsed.getUsername());
        assertEquals(properties.getDisplayName(), parsed.getDisplayName());
        assertEquals("ADMIN", parsed.getRole());
        assertTrue(parsed.getExpiresAt() > parsed.getIssuedAt());
    }

    @Test
    void shouldRejectTamperedToken() {
        AdminAuthProperties properties = buildProperties();
        AdminJwtService service = new AdminJwtService(properties, objectMapper);

        String token = service.createToken(service.issueToken());
        String tamperedToken = token.substring(0, token.length() - 1) + "x";

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
            () -> service.parseAndValidate(tamperedToken));

        assertTrue(error.getMessage().contains("签名") || error.getMessage().contains("解析"));
    }

    private AdminAuthProperties buildProperties() {
        AdminAuthProperties properties = new AdminAuthProperties();
        properties.setUsername("admin");
        properties.setPassword("unit-test-admin-password");
        properties.setDisplayName("管理员");
        properties.setTokenSecret("unit-test-secret");
        properties.setTokenTtlSeconds(3600L);
        return properties;
    }
}

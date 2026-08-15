package com.terraria.skills.auth;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AuthPropertiesGovernanceTest {

    private AdminAuthProperties admin(String secret) {
        AdminAuthProperties properties = new AdminAuthProperties();
        properties.setUsername("admin");
        properties.setPassword("unit-test-admin-password");
        properties.setDisplayName("管理员");
        properties.setTokenSecret(secret);
        return properties;
    }

    private UserAuthProperties user(String secret) {
        UserAuthProperties properties = new UserAuthProperties();
        properties.setTokenSecret(secret);
        return properties;
    }

    @Test
    void adminSecretShorterThanFloorMustFailStartup() {
        AdminAuthProperties properties = admin("short-secret");
        assertThrows(IllegalStateException.class, properties::validate);
    }

    @Test
    void userSecretShorterThanFloorMustFailStartup() {
        UserAuthProperties properties = user("short-secret");
        assertThrows(IllegalStateException.class, properties::validate);
    }

    @Test
    void secretsAtOrAboveFloorPassValidation() {
        assertDoesNotThrow(admin("a".repeat(AdminAuthProperties.MIN_TOKEN_SECRET_LENGTH))::validate);
        assertDoesNotThrow(user("b".repeat(AdminAuthProperties.MIN_TOKEN_SECRET_LENGTH))::validate);
    }

    @Test
    void identicalAdminAndUserSecretsMustFailStartup() {
        String shared = "shared-secret-that-is-long-enough-0123456789";
        AuthSecretDistinctnessGuard guard = new AuthSecretDistinctnessGuard(admin(shared), user(shared));
        assertThrows(IllegalStateException.class, guard::validate);
    }

    @Test
    void distinctSecretsPassTheGuard() {
        AuthSecretDistinctnessGuard guard = new AuthSecretDistinctnessGuard(
            admin("admin-secret-that-is-long-enough-0123456789"),
            user("user-secret-that-is-long-enough-0123456789")
        );
        assertDoesNotThrow(guard::validate);
    }
}

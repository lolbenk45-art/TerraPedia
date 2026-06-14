package com.terraria.skills.auth;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminLoginRateLimitServiceTest {

    private final StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
    private final ValueOperations<String, String> valueOperations = mock(ValueOperations.class);

    @Test
    void shouldLockUsernameAfterDistributedFailuresAcrossIps() {
        AdminLoginRateLimitProperties properties = new AdminLoginRateLimitProperties();
        properties.setMaxFailuresPerUsername(3);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.increment(anyString())).thenReturn(1L, 1L, 1L, 1L, 3L, 1L);
        AdminLoginRateLimitService service = new AdminLoginRateLimitService(properties, redisTemplate);

        service.recordFailure("admin", "198.51.100.1");
        service.recordFailure("admin", "198.51.100.2");

        verify(valueOperations).set(org.mockito.ArgumentMatchers.startsWith("security:admin-login:lock:username:"), eq("1"), eq(900L), eq(TimeUnit.SECONDS));
    }

    @Test
    void shouldTreatUsernameLockAsLocked() {
        when(redisTemplate.hasKey(org.mockito.ArgumentMatchers.startsWith("security:admin-login:lock:username:"))).thenReturn(true);
        AdminLoginRateLimitService service = new AdminLoginRateLimitService(new AdminLoginRateLimitProperties(), redisTemplate);

        assertTrue(service.isLocked("admin", "198.51.100.1"));
    }

    @Test
    void shouldFallbackAllowWhenRedisCheckFails() {
        when(redisTemplate.hasKey(anyString())).thenThrow(new IllegalStateException("redis down"));
        AdminLoginRateLimitService service = new AdminLoginRateLimitService(new AdminLoginRateLimitProperties(), redisTemplate);

        assertFalse(service.isLocked("admin", "198.51.100.1"));
    }
}

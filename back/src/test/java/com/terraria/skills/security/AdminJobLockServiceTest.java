package com.terraria.skills.security;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.script.RedisScript;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminJobLockServiceTest {

    private final StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
    private final ValueOperations<String, String> valueOperations = mock(ValueOperations.class);

    @Test
    void shouldAcquireLockWithTtlAndToken() {
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.setIfAbsent(eq("security:admin-job-lock:admin-job:wiki-image-sync"), anyString(), eq(60L), eq(TimeUnit.SECONDS)))
            .thenReturn(true);
        AdminJobLockService service = new AdminJobLockService(redisTemplate);

        Optional<AdminJobLockService.JobLock> lock = service.tryAcquire("admin-job:wiki-image-sync", 60);

        assertTrue(lock.isPresent());
        assertEquals("security:admin-job-lock:admin-job:wiki-image-sync", lock.get().key());
    }

    @Test
    void shouldReturnEmptyWhenLockAlreadyHeld() {
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.setIfAbsent(eq("security:admin-job-lock:admin-job:item-import"), anyString(), eq(60L), eq(TimeUnit.SECONDS)))
            .thenReturn(false);
        AdminJobLockService service = new AdminJobLockService(redisTemplate);

        assertFalse(service.tryAcquire("admin-job:item-import", 60).isPresent());
    }

    @Test
    void shouldReleaseOnlyMatchingToken() {
        AdminJobLockService service = new AdminJobLockService(redisTemplate);
        AdminJobLockService.JobLock lock = new AdminJobLockService.JobLock(
            "security:admin-job-lock:admin-job:item-import",
            "token-123"
        );

        service.release(lock);

        verify(redisTemplate).execute(
            any(RedisScript.class),
            eq(List.of("security:admin-job-lock:admin-job:item-import")),
            eq("token-123")
        );
    }
}

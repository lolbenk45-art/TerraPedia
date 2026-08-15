package com.terraria.skills.security;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Service
public class AdminJobLockService {

    private static final String KEY_PREFIX = "security:admin-job-lock:";
    private static final DefaultRedisScript<Long> RELEASE_SCRIPT = new DefaultRedisScript<>(
        """
        if redis.call('get', KEYS[1]) == ARGV[1] then
          return redis.call('del', KEYS[1])
        end
        return 0
        """,
        Long.class
    );

    private final StringRedisTemplate redisTemplate;

    public AdminJobLockService(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public Optional<JobLock> tryAcquire(String jobKey, long ttlSeconds) {
        String key = KEY_PREFIX + jobKey;
        String token = UUID.randomUUID().toString();
        Boolean acquired = redisTemplate.opsForValue().setIfAbsent(
            key,
            token,
            Math.max(1L, ttlSeconds),
            TimeUnit.SECONDS
        );
        if (Boolean.TRUE.equals(acquired)) {
            return Optional.of(new JobLock(key, token));
        }
        return Optional.empty();
    }

    public void release(JobLock lock) {
        if (lock == null) {
            return;
        }
        redisTemplate.execute(RELEASE_SCRIPT, List.of(lock.key()), lock.token());
    }

    public record JobLock(String key, String token) {
    }
}

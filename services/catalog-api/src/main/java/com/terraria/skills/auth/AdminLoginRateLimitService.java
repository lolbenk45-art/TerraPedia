package com.terraria.skills.auth;

import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class AdminLoginRateLimitService {

    private final AdminLoginRateLimitProperties properties;
    private final StringRedisTemplate redisTemplate;

    public AdminLoginRateLimitService(AdminLoginRateLimitProperties properties, StringRedisTemplate redisTemplate) {
        this.properties = properties;
        this.redisTemplate = redisTemplate;
    }

    public boolean isLocked(String username, String ipAddress) {
        try {
            return Boolean.TRUE.equals(redisTemplate.hasKey(lockPairKey(username, ipAddress)))
                || Boolean.TRUE.equals(redisTemplate.hasKey(lockUsernameKey(username)))
                || Boolean.TRUE.equals(redisTemplate.hasKey(lockIpKey(ipAddress)));
        } catch (Exception exception) {
            log.warn("Failed to check admin login lock keys, fallback allow", exception);
            return false;
        }
    }

    public void recordFailure(String username, String ipAddress) {
        try {
            Long pairAttempts = incrementWithWindow(failurePairKey(username, ipAddress), properties.getFailureWindowSeconds());
            Long usernameAttempts = incrementWithWindow(failureUsernameKey(username), properties.getFailureWindowSeconds());
            Long ipAttempts = incrementWithWindow(failureIpKey(ipAddress), properties.getFailureWindowSeconds());

            if (pairAttempts != null && pairAttempts >= properties.getMaxFailures()) {
                redisTemplate.opsForValue().set(lockPairKey(username, ipAddress), "1", properties.getLockSeconds(), TimeUnit.SECONDS);
            }
            if (usernameAttempts != null && usernameAttempts >= properties.getMaxFailuresPerUsername()) {
                redisTemplate.opsForValue().set(lockUsernameKey(username), "1", properties.getLockSeconds(), TimeUnit.SECONDS);
            }
            if (ipAttempts != null && ipAttempts >= properties.getMaxFailuresPerIp()) {
                redisTemplate.opsForValue().set(lockIpKey(ipAddress), "1", properties.getLockSeconds(), TimeUnit.SECONDS);
            }
        } catch (Exception exception) {
            log.warn("Failed to record admin login failure", exception);
        }
    }

    public void recordSuccess(String username, String ipAddress) {
        try {
            redisTemplate.delete(failurePairKey(username, ipAddress));
            redisTemplate.delete(lockPairKey(username, ipAddress));
            redisTemplate.delete(failureUsernameKey(username));
            redisTemplate.delete(lockUsernameKey(username));
        } catch (Exception exception) {
            log.warn("Failed to clear admin login rate-limit keys", exception);
        }
    }

    private Long incrementWithWindow(String key, long seconds) {
        Long attempts = redisTemplate.opsForValue().increment(key);
        if (attempts == null) {
            return null;
        }
        if (attempts == 1L) {
            redisTemplate.expire(key, Math.max(1L, seconds), TimeUnit.SECONDS);
        }
        return attempts;
    }

    private String failurePairKey(String username, String ipAddress) {
        return "security:admin-login:failure:" + digest(normalize(username) + "|" + normalize(ipAddress));
    }

    private String lockPairKey(String username, String ipAddress) {
        return "security:admin-login:lock:" + digest(normalize(username) + "|" + normalize(ipAddress));
    }

    private String failureUsernameKey(String username) {
        return "security:admin-login:failure:username:" + digest(normalize(username));
    }

    private String lockUsernameKey(String username) {
        return "security:admin-login:lock:username:" + digest(normalize(username));
    }

    private String failureIpKey(String ipAddress) {
        return "security:admin-login:failure:ip:" + digest(normalize(ipAddress));
    }

    private String lockIpKey(String ipAddress) {
        return "security:admin-login:lock:ip:" + digest(normalize(ipAddress));
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }

    private String digest(String value) {
        try {
            MessageDigest messageDigest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(messageDigest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            return Integer.toHexString(value.hashCode());
        }
    }
}

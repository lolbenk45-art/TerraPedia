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
public class LoginRateLimitService {

    private final LoginRateLimitProperties properties;
    private final StringRedisTemplate redisTemplate;

    public LoginRateLimitService(LoginRateLimitProperties properties, StringRedisTemplate redisTemplate) {
        this.properties = properties;
        this.redisTemplate = redisTemplate;
    }

    public boolean isLocked(String email, String ipAddress) {
        String pairKey = lockPairKey(email, ipAddress);
        String emailKey = lockEmailKey(email);
        String ipKey = lockIpKey(ipAddress);
        try {
            return Boolean.TRUE.equals(redisTemplate.hasKey(pairKey))
                || Boolean.TRUE.equals(redisTemplate.hasKey(emailKey))
                || Boolean.TRUE.equals(redisTemplate.hasKey(ipKey));
        } catch (Exception exception) {
            log.warn("Failed to check login lock keys, fallback allow", exception);
            return false;
        }
    }

    public void recordFailure(String email, String ipAddress) {
        String failurePairKey = failurePairKey(email, ipAddress);
        String failureEmailKey = failureEmailKey(email);
        String failureIpKey = failureIpKey(ipAddress);

        String lockPairKey = lockPairKey(email, ipAddress);
        String lockEmailKey = lockEmailKey(email);
        String lockIpKey = lockIpKey(ipAddress);

        try {
            Long pairAttempts = incrementWithWindow(failurePairKey, properties.getFailureWindowSeconds());
            Long emailAttempts = incrementWithWindow(failureEmailKey, properties.getFailureWindowSeconds());
            Long ipAttempts = incrementWithWindow(failureIpKey, properties.getFailureWindowSeconds());

            if (pairAttempts != null && pairAttempts >= properties.getMaxFailures()) {
                redisTemplate.opsForValue().set(lockPairKey, "1", properties.getLockSeconds(), TimeUnit.SECONDS);
            }

            if (emailAttempts != null && emailAttempts >= properties.getMaxFailuresPerEmail()) {
                redisTemplate.opsForValue().set(lockEmailKey, "1", properties.getLockSeconds(), TimeUnit.SECONDS);
            }

            if (ipAttempts != null && ipAttempts >= properties.getMaxFailuresPerIp()) {
                redisTemplate.opsForValue().set(lockIpKey, "1", properties.getLockSeconds(), TimeUnit.SECONDS);
            }
        } catch (Exception exception) {
            log.warn("Failed to record login failure", exception);
        }
    }

    public void recordSuccess(String email, String ipAddress) {
        try {
            redisTemplate.delete(failurePairKey(email, ipAddress));
            redisTemplate.delete(lockPairKey(email, ipAddress));
            redisTemplate.delete(failureEmailKey(email));
            redisTemplate.delete(lockEmailKey(email));
            redisTemplate.delete(failureIpKey(ipAddress));
            redisTemplate.delete(lockIpKey(ipAddress));
        } catch (Exception exception) {
            log.warn("Failed to clear login rate-limit keys", exception);
        }
    }

    private Long incrementWithWindow(String key, long seconds) {
        Long attempts = redisTemplate.opsForValue().increment(key);
        if (attempts == null) {
            return null;
        }

        if (attempts == 1L) {
            redisTemplate.expire(key, seconds, TimeUnit.SECONDS);
        }
        return attempts;
    }

    private String failurePairKey(String email, String ipAddress) {
        return "security:login:failure:" + digest(normalize(email) + "|" + normalize(ipAddress));
    }

    private String lockPairKey(String email, String ipAddress) {
        return "security:login:lock:" + digest(normalize(email) + "|" + normalize(ipAddress));
    }

    private String failureEmailKey(String email) {
        return "security:login:failure:email:" + digest(normalize(email));
    }

    private String lockEmailKey(String email) {
        return "security:login:lock:email:" + digest(normalize(email));
    }

    private String failureIpKey(String ipAddress) {
        return "security:login:failure:ip:" + digest(normalize(ipAddress));
    }

    private String lockIpKey(String ipAddress) {
        return "security:login:lock:ip:" + digest(normalize(ipAddress));
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

package com.terraria.skills.auth;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserRefreshTokenStoreService {

    private final StringRedisTemplate redisTemplate;

    public void saveToken(Long userId, String refreshToken, long ttlSeconds) {
        if (userId == null || userId <= 0 || refreshToken == null || refreshToken.isBlank()) {
            throw new IllegalArgumentException("Invalid refresh token payload");
        }

        long safeTtl = Math.max(60L, ttlSeconds);
        String hash = digest(refreshToken);
        String tokenKey = tokenKey(hash);
        String userSetKey = userSetKey(userId);

        try {
            redisTemplate.opsForValue().set(tokenKey, String.valueOf(userId), safeTtl, TimeUnit.SECONDS);
            redisTemplate.opsForSet().add(userSetKey, hash);
            redisTemplate.expire(userSetKey, safeTtl, TimeUnit.SECONDS);
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to persist refresh token in redis", exception);
        }
    }

    public void revokeToken(Long userId, String refreshToken) {
        if (userId == null || userId <= 0 || refreshToken == null || refreshToken.isBlank()) {
            return;
        }

        String hash = digest(refreshToken);
        try {
            redisTemplate.delete(tokenKey(hash));
            redisTemplate.opsForSet().remove(userSetKey(userId), hash);
        } catch (Exception exception) {
            log.warn("Failed to revoke refresh token in redis userId={}", userId, exception);
        }
    }

    public void revokeAllTokens(Long userId) {
        if (userId == null || userId <= 0) {
            return;
        }

        String userSetKey = userSetKey(userId);
        try {
            Set<String> hashes = redisTemplate.opsForSet().members(userSetKey);
            if (hashes != null && !hashes.isEmpty()) {
                List<String> keys = hashes.stream().map(this::tokenKey).toList();
                redisTemplate.delete(keys);
            }
            redisTemplate.delete(userSetKey);
        } catch (Exception exception) {
            log.warn("Failed to revoke all refresh tokens in redis userId={}", userId, exception);
        }
    }

    private String userSetKey(Long userId) {
        return "auth:user:refresh:user:" + userId;
    }

    private String tokenKey(String hash) {
        return "auth:user:refresh:token:" + hash;
    }

    private String digest(String value) {
        try {
            MessageDigest messageDigest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(messageDigest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to hash refresh token", exception);
        }
    }
}

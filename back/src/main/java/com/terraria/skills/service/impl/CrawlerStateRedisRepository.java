package com.terraria.skills.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.service.CrawlerMonitorRedisUnavailableException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class CrawlerStateRedisRepository {

    private static final TypeReference<LinkedHashMap<String, Object>> MAP_TYPE = new TypeReference<>() {};

    private final ObjectMapper objectMapper;
    private final StringRedisTemplate redisTemplate;

    public CrawlerStateRedisRepository(ObjectMapper objectMapper, StringRedisTemplate redisTemplate) {
        this.objectMapper = objectMapper;
        this.redisTemplate = redisTemplate;
    }

    public RedisState readRequired(String key) {
        return read(key, true);
    }

    public RedisState readOptional(String key) {
        return read(key, false);
    }

    private RedisState read(String key, boolean required) {
        if (redisTemplate == null) {
            if (required) {
                throw new CrawlerMonitorRedisUnavailableException("redis offline: crawler monitor Redis template is unavailable");
            }
            return RedisState.missing(key);
        }

        String rawValue;
        try {
            rawValue = redisTemplate.opsForValue().get(key);
        } catch (Exception exception) {
            throw new CrawlerMonitorRedisUnavailableException(
                "redis offline: backend-refresh monitor state is unavailable",
                exception
            );
        }
        if (rawValue == null || rawValue.isBlank()) {
            if (required) {
                return RedisState.missing(key);
            }
            return RedisState.missing(key);
        }

        try {
            return RedisState.readable(key, objectMapper.readValue(rawValue, MAP_TYPE));
        } catch (IOException exception) {
            return RedisState.unreadable(key, exception.getMessage());
        }
    }

    public record RedisState(
        String key,
        String path,
        boolean found,
        boolean readable,
        Map<String, Object> payload,
        String errorMessage
    ) {

        static RedisState missing(String key) {
            return new RedisState(key, "redis://" + key, false, false, Collections.emptyMap(), null);
        }

        static RedisState readable(String key, Map<String, Object> payload) {
            return new RedisState(key, "redis://" + key, true, true, new LinkedHashMap<>(payload), null);
        }

        static RedisState unreadable(String key, String errorMessage) {
            return new RedisState(key, "redis://" + key, true, false, Collections.emptyMap(), errorMessage);
        }
    }
}

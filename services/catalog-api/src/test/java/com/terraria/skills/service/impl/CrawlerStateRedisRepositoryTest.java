package com.terraria.skills.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.service.CrawlerMonitorRedisUnavailableException;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CrawlerStateRedisRepositoryTest {

    @Test
    void shouldReadJsonStateFromRedisKey() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.get("terrapedia:crawler:backend-refresh:scheduler")).thenReturn("""
            {
              "status": "sleeping",
              "generatedAt": "2026-05-20T05:00:00Z"
            }
            """);

        CrawlerStateRedisRepository repository = new CrawlerStateRedisRepository(new ObjectMapper(), redisTemplate);

        CrawlerStateRedisRepository.RedisState state = repository.readRequired("terrapedia:crawler:backend-refresh:scheduler");

        assertTrue(state.found());
        assertTrue(state.readable());
        assertEquals("redis://terrapedia:crawler:backend-refresh:scheduler", state.path());
        assertEquals("sleeping", state.payload().get("status"));
    }

    @Test
    void shouldExposeMissingOptionalStateWithoutThrowing() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.get("terrapedia:crawler:item-pages-refresh:progress")).thenReturn(null);

        CrawlerStateRedisRepository repository = new CrawlerStateRedisRepository(new ObjectMapper(), redisTemplate);

        CrawlerStateRedisRepository.RedisState state = repository.readOptional("terrapedia:crawler:item-pages-refresh:progress");

        assertFalse(state.found());
        assertFalse(state.readable());
        assertEquals(Map.of(), state.payload());
    }

    @Test
    void shouldThrowServiceUnavailableWhenRedisReadFails() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        when(redisTemplate.opsForValue()).thenThrow(new IllegalStateException("connection refused"));

        CrawlerStateRedisRepository repository = new CrawlerStateRedisRepository(new ObjectMapper(), redisTemplate);

        CrawlerMonitorRedisUnavailableException exception = assertThrows(
            CrawlerMonitorRedisUnavailableException.class,
            () -> repository.readRequired("terrapedia:crawler:backend-refresh:daemon")
        );
        assertTrue(exception.getMessage().contains("redis offline"));
    }

    @Test
    void shouldTreatInvalidJsonAsUnreadableState() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.get("terrapedia:crawler:backend-refresh:daemon")).thenReturn("{ broken");

        CrawlerStateRedisRepository repository = new CrawlerStateRedisRepository(new ObjectMapper(), redisTemplate);

        CrawlerStateRedisRepository.RedisState state = repository.readOptional("terrapedia:crawler:backend-refresh:daemon");

        assertTrue(state.found());
        assertFalse(state.readable());
        assertFalse(state.errorMessage().isBlank());
    }
}

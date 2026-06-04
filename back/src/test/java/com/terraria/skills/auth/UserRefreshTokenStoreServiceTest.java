package com.terraria.skills.auth;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentCaptor.forClass;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserRefreshTokenStoreServiceTest {

    private static final String RAW_REFRESH_TOKEN_HASH = "0881b36898a91d864edaf39d2b2bd5801d5f873e3142a9ec5b3b574c4f6b51e5";

    private StringRedisTemplate redisTemplate;
    private ValueOperations<String, String> valueOperations;
    private SetOperations<String, String> setOperations;
    private UserRefreshTokenStoreService service;

    @BeforeEach
    void setUp() {
        redisTemplate = mock(StringRedisTemplate.class);
        valueOperations = mock(ValueOperations.class);
        setOperations = mock(SetOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(redisTemplate.opsForSet()).thenReturn(setOperations);
        service = new UserRefreshTokenStoreService(redisTemplate);
    }

    @Test
    void shouldPersistOnlyHashedRefreshTokenWithMinimumTtl() {
        service.saveToken(42L, "raw-refresh-token", 10L);

        verify(valueOperations).set(
            eq("auth:user:refresh:token:" + RAW_REFRESH_TOKEN_HASH),
            eq("42"),
            eq(60L),
            eq(TimeUnit.SECONDS)
        );
        verify(setOperations).add(
            eq("auth:user:refresh:user:42"),
            eq(RAW_REFRESH_TOKEN_HASH)
        );
    }

    @Test
    void shouldConsumeRefreshTokenOnceAndRemoveHashFromUserSet() {
        when(valueOperations.getAndDelete("auth:user:refresh:token:" + RAW_REFRESH_TOKEN_HASH))
            .thenReturn("42")
            .thenReturn(null);

        assertEquals(42L, service.consumeToken("raw-refresh-token"));
        assertNull(service.consumeToken("raw-refresh-token"));
        verify(setOperations).remove(
            eq("auth:user:refresh:user:42"),
            eq(RAW_REFRESH_TOKEN_HASH)
        );
    }

    @Test
    void shouldRevokeAllTokenHashesForUser() {
        when(setOperations.members("auth:user:refresh:user:42")).thenReturn(Set.of(
            "hash-a",
            "hash-b"
        ));

        service.revokeAllTokens(42L);

        ArgumentCaptor<List<String>> keysCaptor = forClass(List.class);
        verify(redisTemplate).delete(keysCaptor.capture());
        assertEquals(Set.of(
            "auth:user:refresh:token:hash-a",
            "auth:user:refresh:token:hash-b"
        ), Set.copyOf(keysCaptor.getValue()));
        verify(redisTemplate).delete("auth:user:refresh:user:42");
    }
}

package com.terraria.skills.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class HttpRateLimitInterceptorTest {

    private final ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
    private final StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ClientIpResolver clientIpResolver = new ClientIpResolver(networkProperties());

    @Test
    void shouldAllowPublicReadWithinLimitAndExpireNewWindowKey() throws Exception {
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.increment("security:http-rate:public-read:203.0.113.9:1000")).thenReturn(1L);
        HttpRateLimitInterceptor interceptor = newInterceptor(enabledProperties());
        MockHttpServletRequest request = request("GET", "/items");
        request.setRemoteAddr("203.0.113.9");
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertTrue(interceptor.preHandle(request, response, new Object()));

        verify(redisTemplate).expire("security:http-rate:public-read:203.0.113.9:1000", 60, TimeUnit.SECONDS);
        assertEquals(200, response.getStatus());
    }

    @Test
    void shouldRejectAuthEndpointWhenLimitExceeded() throws Exception {
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.increment("security:http-rate:auth:198.51.100.10:1000")).thenReturn(21L);
        HttpRateLimitInterceptor interceptor = newInterceptor(enabledProperties());
        MockHttpServletRequest request = request("POST", "/auth/login");
        request.setRemoteAddr("198.51.100.10");
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertFalse(interceptor.preHandle(request, response, new Object()));

        assertEquals(429, response.getStatus());
        JsonNode body = objectMapper.readTree(response.getContentAsString());
        assertEquals(false, body.get("success").asBoolean());
        assertEquals(429, body.get("statusCode").asInt());
        assertEquals("请求过于频繁，请稍后再试", body.get("message").asText());
    }

    @Test
    void shouldApplyUserWriteTierBeforeAuthenticationInterceptors() throws Exception {
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.increment("security:http-rate:user-write:192.0.2.44:1000")).thenReturn(60L);
        HttpRateLimitInterceptor interceptor = newInterceptor(enabledProperties());
        MockHttpServletRequest request = request("POST", "/user/favorites/42");
        request.setRemoteAddr("192.0.2.44");

        assertTrue(interceptor.preHandle(request, new MockHttpServletResponse(), new Object()));
    }

    @Test
    void shouldUseUploadTierForMultipartUploadRoutes() throws Exception {
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.increment("security:http-rate:upload:203.0.113.55:1000")).thenReturn(1L);
        HttpRateLimitInterceptor interceptor = newInterceptor(enabledProperties());
        MockHttpServletRequest request = request("POST", "/files/upload");
        request.setRemoteAddr("203.0.113.55");

        assertTrue(interceptor.preHandle(request, new MockHttpServletResponse(), new Object()));
    }

    @Test
    void shouldSkipRedisWhenDisabled() throws Exception {
        HttpRateLimitProperties properties = enabledProperties();
        properties.setEnabled(false);
        HttpRateLimitInterceptor interceptor = newInterceptor(properties);

        assertTrue(interceptor.preHandle(request("POST", "/auth/login"), new MockHttpServletResponse(), new Object()));

        verify(redisTemplate, never()).opsForValue();
    }

    private HttpRateLimitInterceptor newInterceptor(HttpRateLimitProperties properties) {
        return new HttpRateLimitInterceptor(
            properties,
            redisTemplate,
            clientIpResolver,
            objectMapper,
            Clock.fixed(Instant.ofEpochSecond(60_000), ZoneOffset.UTC)
        );
    }

    private HttpRateLimitProperties enabledProperties() {
        HttpRateLimitProperties properties = new HttpRateLimitProperties();
        properties.setEnabled(true);
        return properties;
    }

    private SecurityNetworkProperties networkProperties() {
        SecurityNetworkProperties properties = new SecurityNetworkProperties();
        properties.setTrustLoopbackProxies(false);
        return properties;
    }

    private MockHttpServletRequest request(String method, String path) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        request.setServletPath(path);
        return request;
    }
}

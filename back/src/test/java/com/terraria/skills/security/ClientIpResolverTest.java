package com.terraria.skills.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ClientIpResolverTest {

    @Test
    void shouldUseRemoteAddressWhenProxyIsNotTrusted() {
        SecurityNetworkProperties properties = new SecurityNetworkProperties();
        properties.setTrustedProxies(List.of("10.0.0.1"));
        ClientIpResolver resolver = new ClientIpResolver(properties);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("203.0.113.9");
        request.addHeader("X-Forwarded-For", "198.51.100.77, 10.0.0.1");

        assertEquals("203.0.113.9", resolver.resolve(request));
    }

    @Test
    void shouldUseNearestUntrustedForwardedAddressWhenProxyIsTrusted() {
        SecurityNetworkProperties properties = new SecurityNetworkProperties();
        properties.setTrustedProxies(List.of("10.0.0.1"));
        ClientIpResolver resolver = new ClientIpResolver(properties);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("10.0.0.1");
        request.addHeader("X-Forwarded-For", "198.51.100.77, 10.0.0.1");

        assertEquals("198.51.100.77", resolver.resolve(request));
    }

    @Test
    void shouldIgnoreSpoofedLeftmostForwardedAddressWhenProxyAppendsClientIp() {
        SecurityNetworkProperties properties = new SecurityNetworkProperties();
        properties.setTrustedProxies(List.of("10.0.0.1"));
        ClientIpResolver resolver = new ClientIpResolver(properties);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("10.0.0.1");
        request.addHeader("X-Forwarded-For", "6.6.6.6, 198.51.100.77, 10.0.0.1");

        assertEquals("198.51.100.77", resolver.resolve(request));
    }
}

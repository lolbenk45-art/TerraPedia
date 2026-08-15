package com.terraria.skills.config;

import org.junit.jupiter.api.Test;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.filter.CorsFilter;

import java.lang.reflect.Field;

import static org.junit.jupiter.api.Assertions.assertNotNull;

class CorsConfigTest {

    @Test
    void shouldAllowWslAndLanAdminOriginsForLocalDevelopment() throws Exception {
        CorsConfiguration configuration = extractCorsConfiguration(new CorsConfig().corsFilter());

        assertNotNull(configuration.checkOrigin("http://172.21.103.232:3001"));
        assertNotNull(configuration.checkOrigin("http://192.168.1.20:3001"));
        assertNotNull(configuration.checkOrigin("http://10.0.0.8:3001"));
    }

    @Test
    void shouldStillAllowLoopbackAdminOrigins() throws Exception {
        CorsConfiguration configuration = extractCorsConfiguration(new CorsConfig().corsFilter());

        assertNotNull(configuration.checkOrigin("http://localhost:3001"));
        assertNotNull(configuration.checkOrigin("http://127.0.0.1:3001"));
    }

    private CorsConfiguration extractCorsConfiguration(CorsFilter filter) throws Exception {
        Field configSourceField = CorsFilter.class.getDeclaredField("configSource");
        configSourceField.setAccessible(true);
        Object configSource = configSourceField.get(filter);
        return (CorsConfiguration) configSource.getClass()
            .getMethod("getCorsConfiguration", jakarta.servlet.http.HttpServletRequest.class)
            .invoke(configSource, new org.springframework.mock.web.MockHttpServletRequest("POST", "/api/auth/login"));
    }
}

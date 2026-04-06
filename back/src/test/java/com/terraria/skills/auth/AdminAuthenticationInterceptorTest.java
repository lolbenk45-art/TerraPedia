package com.terraria.skills.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AdminAuthenticationInterceptorTest {

    private AdminJwtService jwtService;
    private AdminAuthenticationInterceptor interceptor;

    @BeforeEach
    void setUp() {
        AdminAuthProperties properties = new AdminAuthProperties();
        properties.setUsername("admin");
        properties.setPassword("unit-test-admin-password");
        properties.setDisplayName("管理员");
        properties.setTokenSecret("unit-test-secret");
        properties.setTokenTtlSeconds(3600L);

        jwtService = new AdminJwtService(properties, new ObjectMapper());
        interceptor = new AdminAuthenticationInterceptor(jwtService, new ObjectMapper());
    }

    @Test
    void shouldAllowPublicStatisticsWithoutToken() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/statistics/overview");
        request.setServletPath("/statistics/overview");
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertTrue(allowed);
        assertEquals(200, response.getStatus());
    }

    @Test
    void shouldRejectProtectedAdminStatisticsWithoutToken() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/statistics/admin/overview");
        request.setServletPath("/statistics/admin/overview");
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertFalse(allowed);
        assertEquals(401, response.getStatus());
    }

    @Test
    void shouldAllowProtectedWriteRequestWithValidToken() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/items");
        request.setServletPath("/items");
        request.addHeader("Authorization", "Bearer " + jwtService.createToken(jwtService.issueToken()));
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertTrue(allowed);
        assertNotNull(request.getAttribute(AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE));
    }
}

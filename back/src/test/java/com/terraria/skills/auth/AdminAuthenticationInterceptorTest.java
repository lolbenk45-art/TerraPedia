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
    void shouldRejectAdminAudioStreamWithoutToken() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/admin/audio-assets/1/stream");
        request.setServletPath("/admin/audio-assets/1/stream");
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertFalse(allowed);
        assertEquals(401, response.getStatus());
    }

    @Test
    void shouldAllowPublicObjectReadWithoutToken() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/files/objects/avatars/3/avatar.png");
        request.setServletPath("/files/objects/avatars/3/avatar.png");
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertTrue(allowed);
        assertEquals(200, response.getStatus());
    }

    @Test
    void shouldStillRejectFileUploadWithoutToken() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/files/images");
        request.setServletPath("/files/images");
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

    @RequireAdminAuth
    static class AnnotatedHandler {
        public void write() {}
    }

    static class UnannotatedHandler {
        public void read() {}
    }

    private org.springframework.web.method.HandlerMethod handlerFor(Class<?> type, String method) throws Exception {
        return new org.springframework.web.method.HandlerMethod(
            type.getDeclaredConstructor().newInstance(),
            type.getDeclaredMethod(method)
        );
    }

    @Test
    void annotatedHandlerOutsideKnownPathsMustStillRequireAuth() throws Exception {
        // fail-open 根因: 新端点不在硬编码前缀清单里就直接公开。注解声明后,
        // 即使路径未登记也必须验 token。
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/future-module/write");
        request.setServletPath("/future-module/write");
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, handlerFor(AnnotatedHandler.class, "write"));

        assertFalse(allowed);
        assertEquals(401, response.getStatus());
    }

    @Test
    void annotatedHandlerAcceptsValidAdminToken() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/future-module/write");
        request.setServletPath("/future-module/write");
        request.addHeader("Authorization", "Bearer " + jwtService.createToken(jwtService.issueToken()));
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, handlerFor(AnnotatedHandler.class, "write"));

        assertTrue(allowed);
        assertNotNull(request.getAttribute(AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE));
    }

    @Test
    void unannotatedPublicPathStaysPublic() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/public/items");
        request.setServletPath("/public/items");
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertTrue(interceptor.preHandle(request, response, handlerFor(UnannotatedHandler.class, "read")));
    }

    @Test
    void tokenWithoutAdminRoleMustBeRejectedOnAdminPaths() throws Exception {
        // 13/14 写端点只验 token 不验 role; role 校验必须集中在拦截器,
        // 且 role claim 缺失/非 ADMIN 一律拒绝(解析层不许缺省成 ADMIN)。
        String forged = jwtService.createToken(AdminTokenClaims.builder()
            .username("admin")
            .displayName("管理员")
            .role("USER")
            .issuedAt(java.time.Instant.now().getEpochSecond())
            .expiresAt(java.time.Instant.now().getEpochSecond() + 3600)
            .build());
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/admin/recipes");
        request.setServletPath("/admin/recipes");
        request.addHeader("Authorization", "Bearer " + forged);
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertFalse(allowed);
        assertEquals(401, response.getStatus());
    }
}

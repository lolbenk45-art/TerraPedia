package com.terraria.skills.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UserWriteOriginInterceptorTest {

    private UserWriteOriginInterceptor interceptor;

    @BeforeEach
    void setUp() {
        UserAuthProperties properties = new UserAuthProperties();
        properties.setAccessCookieName("tp_user_access");
        properties.setRefreshCookieName("tp_user_refresh");
        interceptor = new UserWriteOriginInterceptor(properties, new ObjectMapper());
    }

    @Test
    void shouldBlockCookieAuthenticatedUserWriteFromUnknownOrigin() throws Exception {
        MockHttpServletRequest request = userWriteRequest("POST", "/user/favorites/items/77");
        request.addHeader(HttpHeaders.ORIGIN, "https://evil.example");
        request.setCookies(new Cookie("tp_user_access", "access-token"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertFalse(allowed);
        assertEquals(403, response.getStatus());
        assertTrue(response.getContentAsString().contains("Origin is not allowed"));
    }

    @Test
    void shouldBlockCookieAuthenticatedHistoryWriteFromUnknownOrigin() throws Exception {
        MockHttpServletRequest request = userWriteRequest("POST", "/user/history/ARTICLE/77");
        request.addHeader(HttpHeaders.ORIGIN, "https://evil.example");
        request.setCookies(new Cookie("tp_user_access", "access-token"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertFalse(allowed);
        assertEquals(403, response.getStatus());
    }

    @Test
    void shouldProtectCookieAuthenticatedHistoryDeleteFromUnknownOrigin() throws Exception {
        MockHttpServletRequest request = userWriteRequest("DELETE", "/user/history/ITEM/88");
        request.addHeader(HttpHeaders.ORIGIN, "https://evil.example");
        request.setCookies(new Cookie("tp_user_access", "access-token"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertFalse(allowed);
        assertEquals(403, response.getStatus());
    }

    @Test
    void shouldProtectRoutesNotificationsAndPreferencesWritesFromUnknownOrigin() throws Exception {
        for (String[] route : new String[][] {
            {"POST", "/user/saved-routes"},
            {"DELETE", "/user/saved-routes/7"},
            {"PATCH", "/user/notifications/9/read"},
            {"PATCH", "/user/notifications/read-all"},
            {"PATCH", "/user/preferences"}
        }) {
            MockHttpServletRequest request = userWriteRequest(route[0], route[1]);
            request.addHeader(HttpHeaders.ORIGIN, "https://evil.example");
            request.setCookies(new Cookie("tp_user_access", "access-token"));
            MockHttpServletResponse response = new MockHttpServletResponse();

            boolean allowed = interceptor.preHandle(request, response, new Object());

            assertFalse(allowed, route[0] + " " + route[1]);
            assertEquals(403, response.getStatus(), route[0] + " " + route[1]);
        }
    }

    @Test
    void shouldAllowCookieAuthenticatedUserWriteFromLocalhostPreviewOrigin() throws Exception {
        MockHttpServletRequest request = userWriteRequest("PATCH", "/user-auth/profile");
        request.addHeader(HttpHeaders.ORIGIN, "http://localhost:5177");
        request.setCookies(new Cookie("tp_user_access", "access-token"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertTrue(allowed);
        assertEquals(200, response.getStatus());
    }

    @Test
    void shouldAllowCookieAuthenticatedUserWriteFromLoopbackPreviewOrigin() throws Exception {
        MockHttpServletRequest request = userWriteRequest("DELETE", "/user-auth/avatar");
        request.addHeader(HttpHeaders.ORIGIN, "http://127.0.0.1:5174");
        request.setCookies(new Cookie("tp_user_access", "access-token"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertTrue(allowed);
        assertEquals(200, response.getStatus());
    }

    @Test
    void shouldAllowServerSideOrCurlUserWriteWithoutOrigin() throws Exception {
        MockHttpServletRequest request = userWriteRequest("POST", "/user/articles/77/withdraw");
        request.setCookies(new Cookie("tp_user_access", "access-token"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertTrue(allowed);
        assertEquals(200, response.getStatus());
    }

    @Test
    void shouldAllowBearerWriteFromUnknownOrigin() throws Exception {
        MockHttpServletRequest request = userWriteRequest("PUT", "/user/favorites/items/77");
        request.addHeader(HttpHeaders.ORIGIN, "https://api-client.example");
        request.addHeader(HttpHeaders.AUTHORIZATION, "Bearer access-token");
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertTrue(allowed);
        assertEquals(200, response.getStatus());
    }

    @Test
    void shouldIgnoreUserReadRequests() throws Exception {
        MockHttpServletRequest request = userWriteRequest("GET", "/user/favorites");
        request.addHeader(HttpHeaders.ORIGIN, "https://evil.example");
        request.setCookies(new Cookie("tp_user_access", "access-token"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertTrue(allowed);
        assertEquals(200, response.getStatus());
    }

    private MockHttpServletRequest userWriteRequest(String method, String path) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        request.setServletPath(path);
        return request;
    }
}

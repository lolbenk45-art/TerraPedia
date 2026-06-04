package com.terraria.skills.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UserAuthenticationInterceptorTest {

    private UserAuthenticationInterceptor interceptor;

    @BeforeEach
    void setUp() {
        UserAuthProperties properties = new UserAuthProperties();
        properties.setAccessCookieName("tp_user_access");
        properties.setRefreshCookieName("tp_user_refresh");
        properties.setTokenSecret("unit-test-user-auth-secret-that-is-long-enough");
        properties.setAccessTokenTtlSeconds(3600L);
        properties.setRefreshTokenTtlSeconds(86400L);

        UserJwtService jwtService = new UserJwtService(properties, new ObjectMapper());
        interceptor = new UserAuthenticationInterceptor(jwtService, properties, new ObjectMapper());
    }

    @Test
    void shouldRejectAvatarUploadWithoutToken() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/user-auth/avatar");
        request.setServletPath("/user-auth/avatar");
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertFalse(allowed);
        assertEquals(401, response.getStatus());
    }

    @Test
    void shouldRejectFavoritesWithoutToken() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/user/favorites");
        request.setServletPath("/user/favorites");
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertFalse(allowed);
        assertEquals(401, response.getStatus());
    }

    @Test
    void shouldRejectHistoryWithoutToken() throws Exception {
        for (String[] route : new String[][] {
            {"GET", "/user/history"},
            {"POST", "/user/history/ARTICLE/77"},
            {"DELETE", "/user/history/ITEM/88"}
        }) {
            MockHttpServletRequest request = new MockHttpServletRequest(route[0], route[1]);
            request.setServletPath(route[1]);
            MockHttpServletResponse response = new MockHttpServletResponse();

            boolean allowed = interceptor.preHandle(request, response, new Object());

            assertFalse(allowed);
            assertEquals(401, response.getStatus());
        }
    }

    @Test
    void shouldRejectRoutesNotificationsAndPreferencesWithoutToken() throws Exception {
        for (String[] route : new String[][] {
            {"GET", "/user/saved-routes"},
            {"POST", "/user/saved-routes"},
            {"DELETE", "/user/saved-routes/7"},
            {"GET", "/user/notifications"},
            {"PATCH", "/user/notifications/9/read"},
            {"GET", "/user/preferences"},
            {"PATCH", "/user/preferences"}
        }) {
            MockHttpServletRequest request = new MockHttpServletRequest(route[0], route[1]);
            request.setServletPath(route[1]);
            MockHttpServletResponse response = new MockHttpServletResponse();

            boolean allowed = interceptor.preHandle(request, response, new Object());

            assertFalse(allowed);
            assertEquals(401, response.getStatus());
        }
    }

    @Test
    void shouldAllowPublicUserAuthRegistrationWithoutToken() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/user-auth/register");
        request.setServletPath("/user-auth/register");
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertTrue(allowed);
        assertEquals(200, response.getStatus());
    }

    @Test
    void shouldAllowRefreshWithoutAccessToken() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/user-auth/refresh");
        request.setServletPath("/user-auth/refresh");
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertTrue(allowed);
        assertEquals(200, response.getStatus());
    }
}

package com.terraria.skills.security;

import com.terraria.skills.service.SecurityAuditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class HttpSecurityAuditInterceptorTest {

    private final SecurityAuditService securityAuditService = mock(SecurityAuditService.class);
    private final ClientIpResolver clientIpResolver = mock(ClientIpResolver.class);
    private final SecurityNetworkProperties properties = new SecurityNetworkProperties();
    private HttpSecurityAuditInterceptor interceptor;

    @BeforeEach
    void setUp() {
        properties.setHttpAuditEnabled(true);
        when(clientIpResolver.resolve(org.mockito.ArgumentMatchers.any())).thenReturn("198.51.100.77");
        interceptor = new HttpSecurityAuditInterceptor(securityAuditService, clientIpResolver, properties);
    }

    @Test
    void shouldAuditForbiddenRequestAfterCompletion() {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/user/favorites/items/77");
        request.setServletPath("/user/favorites/items/77");
        request.setAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE, "req-1");
        MockHttpServletResponse response = new MockHttpServletResponse();
        response.setStatus(403);

        interceptor.afterCompletion(request, response, new Object(), null);

        verify(securityAuditService).log(
            eq("HTTP_REQUEST_DENIED"),
            eq("SYSTEM"),
            eq(null),
            eq(null),
            eq("198.51.100.77"),
            contains("requestId=req-1")
        );
    }

    @Test
    void shouldAuditServerErrorAfterCompletion() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/public/items");
        request.setServletPath("/public/items");
        request.setAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE, "req-2");
        MockHttpServletResponse response = new MockHttpServletResponse();
        response.setStatus(500);

        interceptor.afterCompletion(request, response, new Object(), new IllegalStateException("boom"));

        verify(securityAuditService).log(
            eq("HTTP_REQUEST_ERROR"),
            eq("SYSTEM"),
            eq(null),
            eq(null),
            eq("198.51.100.77"),
            contains("error=IllegalStateException")
        );
    }

    @Test
    void shouldSkipNormalSuccessfulRequests() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/public/items");
        request.setServletPath("/public/items");
        MockHttpServletResponse response = new MockHttpServletResponse();
        response.setStatus(200);

        interceptor.afterCompletion(request, response, new Object(), null);

        verify(securityAuditService, never()).log(
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.anyString()
        );
    }

    @Test
    void shouldSkipSuccessfulRedirectRequests() {
        for (int status : new int[] {200, 201, 204, 301, 302, 304}) {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/public/items");
            request.setServletPath("/public/items");
            MockHttpServletResponse response = new MockHttpServletResponse();
            response.setStatus(status);

            interceptor.afterCompletion(request, response, new Object(), null);
        }

        verify(securityAuditService, never()).log(anyString(), anyString(), any(), any(), anyString(), anyString());
    }

    @Test
    void shouldAuditUnauthorizedTooManyRequestsAndServerErrors() {
        for (int status : new int[] {401, 403, 429, 500}) {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/public/items");
            request.setServletPath("/public/items");
            request.setAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE, "req-" + status);
            MockHttpServletResponse response = new MockHttpServletResponse();
            response.setStatus(status);

            interceptor.afterCompletion(request, response, new Object(), null);
        }

        verify(securityAuditService, org.mockito.Mockito.times(3)).log(
            eq("HTTP_REQUEST_DENIED"),
            eq("SYSTEM"),
            eq(null),
            eq(null),
            eq("198.51.100.77"),
            contains("path=/public/items")
        );
        verify(securityAuditService).log(
            eq("HTTP_REQUEST_ERROR"),
            eq("SYSTEM"),
            eq(null),
            eq(null),
            eq("198.51.100.77"),
            contains("status=500")
        );
    }
}

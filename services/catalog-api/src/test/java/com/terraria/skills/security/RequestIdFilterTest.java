package com.terraria.skills.security;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class RequestIdFilterTest {

    @Test
    void shouldReuseIncomingRequestIdAndExposeResponseHeader() throws Exception {
        RequestIdFilter filter = new RequestIdFilter();
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/public/items");
        request.addHeader(RequestIdFilter.REQUEST_ID_HEADER, "client-request-1");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        assertEquals("client-request-1", response.getHeader(RequestIdFilter.REQUEST_ID_HEADER));
        assertEquals("client-request-1", request.getAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE));
        verify(chain).doFilter(request, response);
    }

    @Test
    void shouldGenerateRequestIdWhenMissing() throws Exception {
        RequestIdFilter filter = new RequestIdFilter();
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/public/items");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        assertNotNull(response.getHeader(RequestIdFilter.REQUEST_ID_HEADER));
        assertEquals(response.getHeader(RequestIdFilter.REQUEST_ID_HEADER), request.getAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE));
    }
}

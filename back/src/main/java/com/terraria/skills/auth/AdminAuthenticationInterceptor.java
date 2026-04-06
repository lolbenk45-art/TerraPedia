package com.terraria.skills.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.common.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class AdminAuthenticationInterceptor implements HandlerInterceptor {

    public static final String ADMIN_CLAIMS_ATTRIBUTE = "adminClaims";

    private final AdminJwtService adminJwtService;
    private final ObjectMapper objectMapper;

    public AdminAuthenticationInterceptor(AdminJwtService adminJwtService, ObjectMapper objectMapper) {
        this.adminJwtService = adminJwtService;
        this.objectMapper = objectMapper;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if (!requiresAuthentication(request)) {
            return true;
        }

        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            writeUnauthorizedResponse(response, "未登录或登录状态已失效");
            return false;
        }

        String token = authorization.substring("Bearer ".length()).trim();
        if (token.isEmpty()) {
            writeUnauthorizedResponse(response, "未提供有效令牌");
            return false;
        }

        try {
            AdminTokenClaims claims = adminJwtService.parseAndValidate(token);
            request.setAttribute(ADMIN_CLAIMS_ATTRIBUTE, claims);
            return true;
        } catch (IllegalArgumentException exception) {
            writeUnauthorizedResponse(response, exception.getMessage());
            return false;
        }
    }

    private boolean requiresAuthentication(HttpServletRequest request) {
        String path = request.getServletPath();
        String method = request.getMethod();

        if (HttpMethod.OPTIONS.matches(method)) {
            return false;
        }

        if ("/auth/me".equals(path)) {
            return true;
        }
        if (path.startsWith("/statistics/admin/")) {
            return true;
        }
        if (path.startsWith("/admin/")) {
            return true;
        }
        if (path.startsWith("/files/")) {
            return true;
        }
        if (path.startsWith("/items/import")) {
            return true;
        }
        if (path.startsWith("/items")) {
            return !HttpMethod.GET.matches(method) && !HttpMethod.HEAD.matches(method);
        }
        if (path.startsWith("/categories")) {
            return !HttpMethod.GET.matches(method) && !HttpMethod.HEAD.matches(method);
        }
        return false;
    }

    private void writeUnauthorizedResponse(HttpServletResponse response, String message) throws Exception {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setCharacterEncoding("UTF-8");
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getWriter(), ApiResponse.error(HttpServletResponse.SC_UNAUTHORIZED, message));
    }
}

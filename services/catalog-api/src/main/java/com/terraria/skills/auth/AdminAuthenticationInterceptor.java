package com.terraria.skills.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.common.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class AdminAuthenticationInterceptor implements HandlerInterceptor {

    public static final String ADMIN_CLAIMS_ATTRIBUTE = "adminClaims";
    private static final String ROLE_ADMIN = "ADMIN";

    private final AdminJwtService adminJwtService;
    private final ObjectMapper objectMapper;

    public AdminAuthenticationInterceptor(AdminJwtService adminJwtService, ObjectMapper objectMapper) {
        this.adminJwtService = adminJwtService;
        this.objectMapper = objectMapper;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if (!requiresAuthentication(request, handler)) {
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
            // 管理端令牌必须显式携带 ADMIN role；只验签名不验角色曾让
            // 13/14 个写端点对任意有效 token 放行。
            if (!ROLE_ADMIN.equals(claims.getRole())) {
                writeUnauthorizedResponse(response, "该令牌没有管理员权限");
                return false;
            }
            request.setAttribute(ADMIN_CLAIMS_ATTRIBUTE, claims);
            return true;
        } catch (IllegalArgumentException exception) {
            writeUnauthorizedResponse(response, exception.getMessage());
            return false;
        }
    }

    private boolean requiresAuthentication(HttpServletRequest request, Object handler) {
        String method = request.getMethod();
        if (HttpMethod.OPTIONS.matches(method)) {
            return false;
        }
        // 注解声明优先：标了 @RequireAdminAuth 的 handler 不依赖下面的
        // 路径清单，新端点漏登记也不会 fail-open。
        if (handlerRequiresAdminAuth(handler)) {
            return true;
        }
        return pathRequiresAuthentication(request.getServletPath(), method);
    }

    private boolean handlerRequiresAdminAuth(Object handler) {
        if (!(handler instanceof HandlerMethod handlerMethod)) {
            return false;
        }
        return handlerMethod.hasMethodAnnotation(RequireAdminAuth.class)
            || handlerMethod.getBeanType().isAnnotationPresent(RequireAdminAuth.class);
    }

    private boolean pathRequiresAuthentication(String path, String method) {
        if ("/auth/me".equals(path)) {
            return true;
        }
        if (path.startsWith("/statistics/admin/")) {
            return true;
        }
        if (path.startsWith("/admin/")) {
            return true;
        }
        if (path.startsWith("/files/objects/")) {
            return !HttpMethod.GET.matches(method) && !HttpMethod.HEAD.matches(method);
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

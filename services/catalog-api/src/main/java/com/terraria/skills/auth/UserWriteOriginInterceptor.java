package com.terraria.skills.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.common.ApiResponse;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.net.URI;

@Component
public class UserWriteOriginInterceptor implements HandlerInterceptor {

    private final UserAuthProperties userAuthProperties;
    private final ObjectMapper objectMapper;

    public UserWriteOriginInterceptor(UserAuthProperties userAuthProperties, ObjectMapper objectMapper) {
        this.userAuthProperties = userAuthProperties;
        this.objectMapper = objectMapper;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if (!requiresOriginGuard(request) || !usesUserCookie(request)) {
            return true;
        }

        String origin = request.getHeader(HttpHeaders.ORIGIN);
        if (origin == null || origin.isBlank() || isAllowedLocalOrigin(origin)) {
            return true;
        }

        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setCharacterEncoding("UTF-8");
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getWriter(), ApiResponse.error(HttpServletResponse.SC_FORBIDDEN, "Origin is not allowed"));
        return false;
    }

    private boolean requiresOriginGuard(HttpServletRequest request) {
        if (HttpMethod.OPTIONS.matches(request.getMethod()) || !isWriteMethod(request.getMethod())) {
            return false;
        }

        String path = request.getServletPath();
        return "/user-auth/profile".equals(path)
            || "/user-auth/password".equals(path)
            || "/user-auth/avatar".equals(path)
            || "/user-auth/account".equals(path)
            || "/user-auth/logout".equals(path)
            || "/user-auth/refresh".equals(path)
            || path.startsWith("/user/articles")
            || path.startsWith("/user/history")
            || path.startsWith("/user/saved-routes")
            || path.startsWith("/user/notifications")
            || path.startsWith("/user/preferences")
            || path.startsWith("/user/favorites")
            || isArticleCommentWrite(path);
    }

    private boolean isArticleCommentWrite(String path) {
        return path.matches("^/articles/[1-9]\\d*/comments$")
            || path.matches("^/articles/[1-9]\\d*/comments/[1-9]\\d*$")
            || path.matches("^/articles/[1-9]\\d*/comments/[1-9]\\d*/replies$")
            || path.matches("^/articles/[1-9]\\d*/comments/[1-9]\\d*/like$");
    }

    private boolean isWriteMethod(String method) {
        return HttpMethod.POST.matches(method)
            || HttpMethod.PUT.matches(method)
            || HttpMethod.PATCH.matches(method)
            || HttpMethod.DELETE.matches(method);
    }

    private boolean usesUserCookie(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return false;
        }

        for (Cookie cookie : cookies) {
            if (userAuthProperties.getAccessCookieName().equals(cookie.getName())
                || userAuthProperties.getRefreshCookieName().equals(cookie.getName())) {
                return true;
            }
        }
        return false;
    }

    private boolean isAllowedLocalOrigin(String origin) {
        try {
            URI uri = URI.create(origin);
            String scheme = uri.getScheme();
            String host = uri.getHost();
            return ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))
                && ("localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host));
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }
}

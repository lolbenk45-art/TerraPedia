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

@Component
public class UserAuthenticationInterceptor implements HandlerInterceptor {

    public static final String USER_CLAIMS_ATTRIBUTE = "userClaims";

    private final UserJwtService userJwtService;
    private final UserAuthProperties userAuthProperties;
    private final ObjectMapper objectMapper;

    public UserAuthenticationInterceptor(
        UserJwtService userJwtService,
        UserAuthProperties userAuthProperties,
        ObjectMapper objectMapper
    ) {
        this.userJwtService = userJwtService;
        this.userAuthProperties = userAuthProperties;
        this.objectMapper = objectMapper;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if (!requiresAuthentication(request)) {
            return true;
        }

        String token = resolveToken(request);
        if (token == null || token.isBlank()) {
            writeUnauthorizedResponse(response, "Not logged in");
            return false;
        }

        try {
            UserTokenClaims claims = userJwtService.parseAndValidate(token);
            request.setAttribute(USER_CLAIMS_ATTRIBUTE, claims);
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

        return "/user-auth/me".equals(path)
            || "/user-auth/logout".equals(path)
            || "/user-auth/profile".equals(path)
            || "/user-auth/password".equals(path)
            || "/user-auth/account".equals(path)
            || path.startsWith("/user/articles");
    }

    private String resolveToken(HttpServletRequest request) {
        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (authorization != null && authorization.startsWith("Bearer ")) {
            return authorization.substring("Bearer ".length()).trim();
        }

        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }

        for (Cookie cookie : cookies) {
            if (userAuthProperties.getAccessCookieName().equals(cookie.getName())) {
                return cookie.getValue();
            }
        }

        return null;
    }

    private void writeUnauthorizedResponse(HttpServletResponse response, String message) throws Exception {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setCharacterEncoding("UTF-8");
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getWriter(), ApiResponse.error(HttpServletResponse.SC_UNAUTHORIZED, message));
    }
}

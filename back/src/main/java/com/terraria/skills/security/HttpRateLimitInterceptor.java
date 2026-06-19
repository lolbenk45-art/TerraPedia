package com.terraria.skills.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.common.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.time.Clock;
import java.util.concurrent.TimeUnit;

@Slf4j
@Component
public class HttpRateLimitInterceptor implements HandlerInterceptor {

    private static final String PREFIX = "security:http-rate:";
    private static final String TOO_MANY_REQUESTS_MESSAGE = "请求过于频繁，请稍后再试";
    private static final int TOO_MANY_REQUESTS_STATUS = 429;

    private final HttpRateLimitProperties properties;
    private final StringRedisTemplate redisTemplate;
    private final ClientIpResolver clientIpResolver;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    @Autowired
    public HttpRateLimitInterceptor(
        HttpRateLimitProperties properties,
        StringRedisTemplate redisTemplate,
        ClientIpResolver clientIpResolver,
        ObjectMapper objectMapper
    ) {
        this(properties, redisTemplate, clientIpResolver, objectMapper, Clock.systemUTC());
    }

    HttpRateLimitInterceptor(
        HttpRateLimitProperties properties,
        StringRedisTemplate redisTemplate,
        ClientIpResolver clientIpResolver,
        ObjectMapper objectMapper,
        Clock clock
    ) {
        this.properties = properties;
        this.redisTemplate = redisTemplate;
        this.clientIpResolver = clientIpResolver;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if (!properties.isEnabled()) {
            return true;
        }

        TierMatch tierMatch = resolveTier(request);
        if (tierMatch == null) {
            return true;
        }

        try {
            String ip = clientIpResolver.resolve(request);
            long window = clock.instant().getEpochSecond() / Math.max(1L, tierMatch.tier().getWindowSeconds());
            String key = PREFIX + tierMatch.name() + ":" + ip + ":" + window;
            Long count = redisTemplate.opsForValue().increment(key);
            if (count != null && count == 1L) {
                redisTemplate.expire(key, Math.max(1L, tierMatch.tier().getWindowSeconds()), TimeUnit.SECONDS);
            }
            if (count != null && count > tierMatch.tier().getRequests()) {
                writeTooManyRequests(response);
                return false;
            }
        } catch (Exception exception) {
            log.warn("Failed to apply HTTP rate limit, fallback allow", exception);
        }

        return true;
    }

    private TierMatch resolveTier(HttpServletRequest request) {
        String method = request.getMethod();
        if (HttpMethod.OPTIONS.matches(method)) {
            return null;
        }

        String path = request.getServletPath();
        if (path == null || path.isBlank()) {
            path = request.getRequestURI();
        }

        if (isAuthPath(path)) {
            return new TierMatch("auth", properties.getAuth());
        }
        if (isUploadPath(path, method)) {
            return new TierMatch("upload", properties.getUpload());
        }
        if (isAdminWritePath(path, method)) {
            return new TierMatch("admin-write", properties.getAdminWrite());
        }
        if (isUserWritePath(path, method)) {
            return new TierMatch("user-write", properties.getUserWrite());
        }
        if (HttpMethod.GET.matches(method) || HttpMethod.HEAD.matches(method)) {
            return new TierMatch("public-read", properties.getPublicRead());
        }
        return null;
    }

    private boolean isAuthPath(String path) {
        return path.startsWith("/auth/") || path.startsWith("/user-auth/login") || path.startsWith("/user-auth/register") || path.startsWith("/user-auth/refresh");
    }

    private boolean isUploadPath(String path, String method) {
        return isWriteMethod(method)
            && (path.startsWith("/files/upload") || "/user-auth/avatar".equals(path) || path.startsWith("/user/articles/images"));
    }

    private boolean isAdminWritePath(String path, String method) {
        return isWriteMethod(method)
            && (path.startsWith("/admin/")
            || path.startsWith("/items/import")
            || path.startsWith("/files/")
            || path.startsWith("/items")
            || path.startsWith("/categories"));
    }

    private boolean isUserWritePath(String path, String method) {
        return isWriteMethod(method)
            && (path.startsWith("/user/")
            || path.startsWith("/user-auth/")
            || path.matches("^/articles/[1-9]\\d*/comments.*$"));
    }

    private boolean isWriteMethod(String method) {
        return HttpMethod.POST.matches(method)
            || HttpMethod.PUT.matches(method)
            || HttpMethod.PATCH.matches(method)
            || HttpMethod.DELETE.matches(method);
    }

    private void writeTooManyRequests(HttpServletResponse response) throws Exception {
        response.setStatus(TOO_MANY_REQUESTS_STATUS);
        response.setCharacterEncoding("UTF-8");
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(
            response.getWriter(),
            ApiResponse.error(TOO_MANY_REQUESTS_STATUS, TOO_MANY_REQUESTS_MESSAGE)
        );
    }

    private record TierMatch(String name, HttpRateLimitProperties.Tier tier) {
    }
}

package com.terraria.skills.security;

import com.terraria.skills.service.SecurityAuditService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class HttpSecurityAuditInterceptor implements HandlerInterceptor {

    private final SecurityAuditService securityAuditService;
    private final ClientIpResolver clientIpResolver;
    private final SecurityNetworkProperties properties;

    public HttpSecurityAuditInterceptor(
        SecurityAuditService securityAuditService,
        ClientIpResolver clientIpResolver,
        SecurityNetworkProperties properties
    ) {
        this.securityAuditService = securityAuditService;
        this.clientIpResolver = clientIpResolver;
        this.properties = properties;
    }

    @Override
    public void afterCompletion(
        HttpServletRequest request,
        HttpServletResponse response,
        Object handler,
        Exception exception
    ) {
        if (!properties.isHttpAuditEnabled()) {
            return;
        }

        int status = response.getStatus();
        String eventType = resolveEventType(status, exception);
        if (eventType == null) {
            return;
        }

        securityAuditService.log(
            eventType,
            "SYSTEM",
            null,
            null,
            clientIpResolver.resolve(request),
            buildDetails(request, status, exception)
        );
    }

    private String resolveEventType(int status, Exception exception) {
        if (status == 401 || status == 403 || status == 429) {
            return "HTTP_REQUEST_DENIED";
        }
        if (exception != null || status >= 500) {
            return "HTTP_REQUEST_ERROR";
        }
        return null;
    }

    private String buildDetails(HttpServletRequest request, int status, Exception exception) {
        String requestId = String.valueOf(request.getAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE));
        String path = request.getServletPath();
        if (path == null || path.isBlank()) {
            path = request.getRequestURI();
        }
        String details = "requestId=" + nullToEmpty(requestId)
            + ",method=" + nullToEmpty(request.getMethod())
            + ",path=" + nullToEmpty(path)
            + ",status=" + status
            + ",userAgent=" + safeHeader(request.getHeader("User-Agent"));
        if (exception != null) {
            details += ",error=" + exception.getClass().getSimpleName();
        }
        return details.length() > 600 ? details.substring(0, 600) : details;
    }

    private String safeHeader(String value) {
        return nullToEmpty(value).replace(',', ' ').replace('\n', ' ').replace('\r', ' ');
    }

    private String nullToEmpty(String value) {
        return value == null || "null".equals(value) ? "" : value;
    }
}

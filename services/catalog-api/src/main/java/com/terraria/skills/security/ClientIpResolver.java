package com.terraria.skills.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class ClientIpResolver {

    private final SecurityNetworkProperties properties;

    public ClientIpResolver(SecurityNetworkProperties properties) {
        this.properties = properties;
    }

    public String resolve(HttpServletRequest request) {
        if (request == null) {
            return "";
        }

        String remoteAddress = trimToEmpty(request.getRemoteAddr());
        if (!isTrustedProxy(remoteAddress)) {
            return remoteAddress;
        }

        String forwardedFor = trimToEmpty(request.getHeader("X-Forwarded-For"));
        if (forwardedFor.isEmpty()) {
            return remoteAddress;
        }

        String[] chain = forwardedFor.split(",");
        for (int i = chain.length - 1; i >= 0; i--) {
            String candidate = chain[i].trim();
            if (!candidate.isEmpty() && !isTrustedProxy(candidate)) {
                return candidate;
            }
        }
        return remoteAddress;
    }

    private boolean isTrustedProxy(String remoteAddress) {
        if (!StringUtils.hasText(remoteAddress)) {
            return false;
        }
        if (properties.isTrustLoopbackProxies()
            && ("127.0.0.1".equals(remoteAddress)
            || "0:0:0:0:0:0:0:1".equals(remoteAddress)
            || "::1".equals(remoteAddress))) {
            return true;
        }
        return properties.getTrustedProxies() != null
            && properties.getTrustedProxies().stream().anyMatch(remoteAddress::equals);
    }

    private String trimToEmpty(String value) {
        return value == null ? "" : value.trim();
    }
}

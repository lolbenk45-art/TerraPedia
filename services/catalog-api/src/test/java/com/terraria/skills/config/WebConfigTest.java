package com.terraria.skills.config;

import com.terraria.skills.auth.AdminAuthenticationInterceptor;
import com.terraria.skills.auth.UserAuthenticationInterceptor;
import com.terraria.skills.auth.UserWriteOriginInterceptor;
import com.terraria.skills.security.HttpRateLimitInterceptor;
import com.terraria.skills.security.HttpSecurityAuditInterceptor;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.handler.MappedInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.Mockito.mock;

class WebConfigTest {

    @Test
    void shouldRegisterHttpSecurityAuditInterceptorBeforeBlockingInterceptors() {
        AdminAuthenticationInterceptor adminInterceptor = mock(AdminAuthenticationInterceptor.class);
        UserAuthenticationInterceptor userInterceptor = mock(UserAuthenticationInterceptor.class);
        UserWriteOriginInterceptor originInterceptor = mock(UserWriteOriginInterceptor.class);
        HttpSecurityAuditInterceptor auditInterceptor = mock(HttpSecurityAuditInterceptor.class);
        HttpRateLimitInterceptor rateLimitInterceptor = mock(HttpRateLimitInterceptor.class);
        WebConfig webConfig = new WebConfig(adminInterceptor, userInterceptor, originInterceptor, auditInterceptor, rateLimitInterceptor);
        ExposedInterceptorRegistry registry = new ExposedInterceptorRegistry();

        webConfig.addInterceptors(registry);

        List<Object> interceptors = registry.exposedInterceptors();
        assertSame(auditInterceptor, unwrap(interceptors.get(0)));
        assertSame(rateLimitInterceptor, unwrap(interceptors.get(1)));
        assertSame(originInterceptor, unwrap(interceptors.get(2)));
        assertSame(adminInterceptor, unwrap(interceptors.get(3)));
        assertSame(userInterceptor, unwrap(interceptors.get(4)));
    }

    private Object unwrap(Object interceptor) {
        if (interceptor instanceof MappedInterceptor mappedInterceptor) {
            return mappedInterceptor.getInterceptor();
        }
        return interceptor;
    }

    private static class ExposedInterceptorRegistry extends InterceptorRegistry {
        List<Object> exposedInterceptors() {
            return getInterceptors();
        }
    }
}

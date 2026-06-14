package com.terraria.skills.config;

import com.terraria.skills.auth.AdminAuthProperties;
import com.terraria.skills.auth.AdminAuthenticationInterceptor;
import com.terraria.skills.auth.AdminLoginRateLimitProperties;
import com.terraria.skills.auth.LoginRateLimitProperties;
import com.terraria.skills.auth.RegisterVerificationProperties;
import com.terraria.skills.auth.UserAuthProperties;
import com.terraria.skills.auth.UserAuthenticationInterceptor;
import com.terraria.skills.auth.UserWriteOriginInterceptor;
import com.terraria.skills.mail.MailProperties;
import com.terraria.skills.security.AdminJobLockProperties;
import com.terraria.skills.security.HttpSecurityAuditInterceptor;
import com.terraria.skills.security.HttpRateLimitInterceptor;
import com.terraria.skills.security.HttpRateLimitProperties;
import com.terraria.skills.security.SecurityNetworkProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@EnableConfigurationProperties({
    ArticleReviewProperties.class,
    RelationCompatibilityProperties.class,
    AdminAuthProperties.class,
    AdminLoginRateLimitProperties.class,
    UserAuthProperties.class,
    LoginRateLimitProperties.class,
    RegisterVerificationProperties.class,
    SecurityNetworkProperties.class,
    HttpRateLimitProperties.class,
    AdminJobLockProperties.class,
    MailProperties.class
})
public class WebConfig implements WebMvcConfigurer {

    private final AdminAuthenticationInterceptor adminAuthenticationInterceptor;
    private final UserAuthenticationInterceptor userAuthenticationInterceptor;
    private final UserWriteOriginInterceptor userWriteOriginInterceptor;
    private final HttpSecurityAuditInterceptor httpSecurityAuditInterceptor;
    private final HttpRateLimitInterceptor httpRateLimitInterceptor;

    public WebConfig(
        AdminAuthenticationInterceptor adminAuthenticationInterceptor,
        UserAuthenticationInterceptor userAuthenticationInterceptor,
        UserWriteOriginInterceptor userWriteOriginInterceptor,
        HttpSecurityAuditInterceptor httpSecurityAuditInterceptor,
        HttpRateLimitInterceptor httpRateLimitInterceptor
    ) {
        this.adminAuthenticationInterceptor = adminAuthenticationInterceptor;
        this.userAuthenticationInterceptor = userAuthenticationInterceptor;
        this.userWriteOriginInterceptor = userWriteOriginInterceptor;
        this.httpSecurityAuditInterceptor = httpSecurityAuditInterceptor;
        this.httpRateLimitInterceptor = httpRateLimitInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(httpSecurityAuditInterceptor).addPathPatterns("/**");
        registry.addInterceptor(httpRateLimitInterceptor).addPathPatterns("/**");
        registry.addInterceptor(userWriteOriginInterceptor).addPathPatterns("/**");
        registry.addInterceptor(adminAuthenticationInterceptor).addPathPatterns("/**");
        registry.addInterceptor(userAuthenticationInterceptor).addPathPatterns("/**");
    }
}

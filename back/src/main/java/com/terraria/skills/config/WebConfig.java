package com.terraria.skills.config;

import com.terraria.skills.auth.AdminAuthProperties;
import com.terraria.skills.auth.AdminAuthenticationInterceptor;
import com.terraria.skills.auth.LoginRateLimitProperties;
import com.terraria.skills.auth.RegisterVerificationProperties;
import com.terraria.skills.auth.UserAuthProperties;
import com.terraria.skills.auth.UserAuthenticationInterceptor;
import com.terraria.skills.auth.UserWriteOriginInterceptor;
import com.terraria.skills.mail.MailProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@EnableConfigurationProperties({
    ArticleReviewProperties.class,
    RelationCompatibilityProperties.class,
    AdminAuthProperties.class,
    UserAuthProperties.class,
    LoginRateLimitProperties.class,
    RegisterVerificationProperties.class,
    MailProperties.class
})
public class WebConfig implements WebMvcConfigurer {

    private final AdminAuthenticationInterceptor adminAuthenticationInterceptor;
    private final UserAuthenticationInterceptor userAuthenticationInterceptor;
    private final UserWriteOriginInterceptor userWriteOriginInterceptor;

    public WebConfig(
        AdminAuthenticationInterceptor adminAuthenticationInterceptor,
        UserAuthenticationInterceptor userAuthenticationInterceptor,
        UserWriteOriginInterceptor userWriteOriginInterceptor
    ) {
        this.adminAuthenticationInterceptor = adminAuthenticationInterceptor;
        this.userAuthenticationInterceptor = userAuthenticationInterceptor;
        this.userWriteOriginInterceptor = userWriteOriginInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(userWriteOriginInterceptor).addPathPatterns("/**");
        registry.addInterceptor(adminAuthenticationInterceptor).addPathPatterns("/**");
        registry.addInterceptor(userAuthenticationInterceptor).addPathPatterns("/**");
    }
}

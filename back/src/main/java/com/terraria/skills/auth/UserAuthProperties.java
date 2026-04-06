package com.terraria.skills.auth;

import jakarta.annotation.PostConstruct;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.StringUtils;

@Data
@ConfigurationProperties(prefix = "terraria.auth.user")
public class UserAuthProperties {

    private String tokenSecret;
    private long accessTokenTtlSeconds = 7200L;
    private long refreshTokenTtlSeconds = 1209600L;
    private String accessCookieName = "tp_user_access";
    private String refreshCookieName = "tp_user_refresh";
    private boolean cookieSecure = false;
    private String cookieSameSite = "Lax";

    @PostConstruct
    void validate() {
        if (!StringUtils.hasText(tokenSecret)) {
            throw new IllegalStateException("Missing required property: terraria.auth.user.token-secret");
        }
    }
}

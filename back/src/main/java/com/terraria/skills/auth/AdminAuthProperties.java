package com.terraria.skills.auth;

import jakarta.annotation.PostConstruct;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.StringUtils;

@Data
@ConfigurationProperties(prefix = "terraria.auth.admin")
public class AdminAuthProperties {

    private String username;
    private String password;
    private String displayName;
    private String tokenSecret;
    private long tokenTtlSeconds = 28800L;

    @PostConstruct
    void validate() {
        requireText("terraria.auth.admin.username", username);
        requireText("terraria.auth.admin.password", password);
        requireText("terraria.auth.admin.token-secret", tokenSecret);
    }

    private void requireText(String propertyName, String value) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalStateException("Missing required property: " + propertyName);
        }
    }
}

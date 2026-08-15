package com.terraria.skills.auth;

import jakarta.annotation.PostConstruct;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.StringUtils;

@Data
@ConfigurationProperties(prefix = "terraria.auth.admin")
public class AdminAuthProperties {

    /** HS256 密钥最小长度；短密钥可被离线暴破,双域隔离全押在密钥强度上。 */
    public static final int MIN_TOKEN_SECRET_LENGTH = 32;

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
        if (tokenSecret.length() < MIN_TOKEN_SECRET_LENGTH) {
            throw new IllegalStateException(
                "terraria.auth.admin.token-secret must be at least "
                    + MIN_TOKEN_SECRET_LENGTH + " characters (got " + tokenSecret.length() + ")");
        }
    }

    private void requireText(String propertyName, String value) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalStateException("Missing required property: " + propertyName);
        }
    }
}

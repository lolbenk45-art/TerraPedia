package com.terraria.skills.auth;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "terraria.security.login-rate-limit")
public class LoginRateLimitProperties {

    private int maxFailures = 5;
    private int maxFailuresPerEmail = 12;
    private int maxFailuresPerIp = 25;
    private long failureWindowSeconds = 600L;
    private long lockSeconds = 900L;
}

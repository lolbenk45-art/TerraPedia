package com.terraria.skills.auth;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "terraria.security.admin-login-rate-limit")
public class AdminLoginRateLimitProperties {

    private int maxFailures = 5;
    private int maxFailuresPerUsername = 12;
    private int maxFailuresPerIp = 20;
    private long failureWindowSeconds = 600L;
    private long lockSeconds = 900L;
}

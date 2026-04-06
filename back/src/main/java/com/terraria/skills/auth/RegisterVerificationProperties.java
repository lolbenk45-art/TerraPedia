package com.terraria.skills.auth;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "terraria.security.register-verification")
public class RegisterVerificationProperties {

    private int codeLength = 6;
    private long codeTtlSeconds = 600L;
    private long sendCooldownSeconds = 60L;
    private boolean localDevFallbackEnabled = false;
    private int maxSendsPerEmailPerHour = 10;
    private int maxSendsPerIpPerHour = 30;
    private int maxVerifyFailures = 5;
    private long verifyFailureWindowSeconds = 900L;
    private long verifyLockSeconds = 900L;
}

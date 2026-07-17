package com.terraria.skills.auth;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Startup guard for auth secret hygiene.
 * - Admin and user token secrets sharing the same value collapses the two token
 *   domains into one (role claim does not participate in authorization), so the
 *   application refuses to start in that configuration.
 * - Short secrets only log a warning to avoid breaking existing deployments.
 */
@Component
public class AuthSecretsGuard {

    private static final Logger log = LoggerFactory.getLogger(AuthSecretsGuard.class);
    private static final int RECOMMENDED_MIN_SECRET_LENGTH = 32;

    private final AdminAuthProperties adminAuthProperties;
    private final UserAuthProperties userAuthProperties;

    public AuthSecretsGuard(AdminAuthProperties adminAuthProperties, UserAuthProperties userAuthProperties) {
        this.adminAuthProperties = adminAuthProperties;
        this.userAuthProperties = userAuthProperties;
    }

    @PostConstruct
    void validate() {
        String adminSecret = adminAuthProperties.getTokenSecret();
        String userSecret = userAuthProperties.getTokenSecret();

        if (adminSecret != null && adminSecret.equals(userSecret)) {
            throw new IllegalStateException(
                "terraria.auth.admin.token-secret and terraria.auth.user.token-secret must differ: "
                    + "identical secrets collapse the admin/user token domains");
        }
        warnIfShort("terraria.auth.admin.token-secret", adminSecret);
        warnIfShort("terraria.auth.user.token-secret", userSecret);
    }

    private void warnIfShort(String propertyName, String secret) {
        if (secret != null && secret.length() < RECOMMENDED_MIN_SECRET_LENGTH) {
            log.warn("{} is shorter than {} characters; consider rotating to a longer secret",
                propertyName, RECOMMENDED_MIN_SECRET_LENGTH);
        }
    }
}

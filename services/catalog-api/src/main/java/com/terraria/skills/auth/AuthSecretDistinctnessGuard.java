package com.terraria.skills.auth;

import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Component;

/**
 * admin/user 双域 JWT 的隔离完全依赖两个 HS256 secret 相异——role claim 直到
 * 2026-07 才参与鉴权,历史上任何一侧令牌在另一侧都可验签通过。这里在启动期
 * fail-fast: 两个 secret 配成同值时直接拒绝启动,而不是静默运行成单域。
 */
@Component
public class AuthSecretDistinctnessGuard {

    private final AdminAuthProperties adminAuthProperties;
    private final UserAuthProperties userAuthProperties;

    public AuthSecretDistinctnessGuard(
        AdminAuthProperties adminAuthProperties,
        UserAuthProperties userAuthProperties
    ) {
        this.adminAuthProperties = adminAuthProperties;
        this.userAuthProperties = userAuthProperties;
    }

    @PostConstruct
    void validate() {
        if (adminAuthProperties.getTokenSecret().equals(userAuthProperties.getTokenSecret())) {
            throw new IllegalStateException(
                "terraria.auth.admin.token-secret and terraria.auth.user.token-secret must differ: "
                    + "identical secrets collapse the admin/user token domains into one");
        }
    }
}

package com.terraria.skills.auth;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class AdminTokenClaims {

    private final String username;
    private final String displayName;
    private final String role;
    private final long issuedAt;
    private final long expiresAt;
}

package com.terraria.skills.auth;

import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class UserTokenClaims {
    Long userId;
    String email;
    String displayName;
    String role;
    long issuedAt;
    long expiresAt;
}

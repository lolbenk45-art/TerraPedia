package com.terraria.skills.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class UserSessionDTO {
    private UserProfileDTO user;
    private String accessToken;
    private String refreshToken;
    private long expiresAt;
}

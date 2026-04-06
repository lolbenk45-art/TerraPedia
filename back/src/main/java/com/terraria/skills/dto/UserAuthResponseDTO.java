package com.terraria.skills.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class UserAuthResponseDTO {
    private UserProfileDTO user;
    private String tokenType;
    private long expiresAt;
}

package com.terraria.skills.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class UserRegisterCodeResponseDTO {
    private long expiresInSeconds;
    private long cooldownSeconds;
    private String debugVerificationCode;
}

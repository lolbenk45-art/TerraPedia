package com.terraria.skills.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class AdminUserResetPasswordResponseDTO {
    private Long userId;
    private String email;
    private String temporaryPassword;
}

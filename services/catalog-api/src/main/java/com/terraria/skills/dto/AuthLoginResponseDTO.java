package com.terraria.skills.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuthLoginResponseDTO {

    private String token;
    private String tokenType;
    private Long expiresAt;
    private AdminProfileDTO user;
}

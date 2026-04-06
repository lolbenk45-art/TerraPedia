package com.terraria.skills.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UserDeleteAccountRequestDTO {

    @NotBlank(message = "Current password is required")
    @Size(max = 128, message = "Current password is too long")
    private String currentPassword;
}

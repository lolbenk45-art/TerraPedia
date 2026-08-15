package com.terraria.skills.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UserChangePasswordRequestDTO {

    @NotBlank(message = "Current password is required")
    @Size(max = 128, message = "Current password is too long")
    private String currentPassword;

    @NotBlank(message = "New password is required")
    @Size(min = 10, max = 64, message = "Password length must be between 10 and 64")
    @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$", message = "Password must contain letters and numbers")
    private String newPassword;
}

package com.terraria.skills.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UserRegisterRequestDTO {

    @Email(message = "Invalid email format")
    @NotBlank(message = "Email is required")
    @Size(max = 190, message = "Email is too long")
    private String email;

    @NotBlank(message = "Password is required")
    @Size(min = 10, max = 64, message = "Password length must be between 10 and 64")
    @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$", message = "Password must contain letters and numbers")
    private String password;

    @NotBlank(message = "Verification code is required")
    @Pattern(regexp = "^\\d{4,8}$", message = "Verification code must be 4-8 digits")
    private String verificationCode;

    @Size(max = 120, message = "Display name is too long")
    private String displayName;
}

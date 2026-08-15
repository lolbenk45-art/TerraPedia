package com.terraria.skills.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UserLoginRequestDTO {

    @Email(message = "Invalid email format")
    @NotBlank(message = "Email is required")
    @Size(max = 190, message = "Email is too long")
    private String email;

    @NotBlank(message = "Password is required")
    @Size(max = 128, message = "Password is too long")
    private String password;
}

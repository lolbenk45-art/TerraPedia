package com.terraria.skills.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UserUpdateProfileRequestDTO {

    @NotBlank(message = "Display name is required")
    @Size(min = 2, max = 120, message = "Display name length must be between 2 and 120")
    private String displayName;
}

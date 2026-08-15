package com.terraria.skills.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class AdminUserCreateRequestDTO {

    @NotBlank
    @Email
    @Size(max = 190)
    private String email;

    @NotBlank
    @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).{10,64}$")
    private String password;

    @Size(min = 2, max = 120)
    private String displayName;

    @Min(0)
    @Max(1)
    private Integer status = 1;
}

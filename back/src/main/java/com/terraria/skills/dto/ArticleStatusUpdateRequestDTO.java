package com.terraria.skills.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class ArticleStatusUpdateRequestDTO {

    @NotBlank(message = "status is required")
    private String status;
}

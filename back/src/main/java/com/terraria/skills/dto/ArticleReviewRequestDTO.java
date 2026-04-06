package com.terraria.skills.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ArticleReviewRequestDTO {

    @NotBlank(message = "action is required")
    private String action;

    @Size(max = 600, message = "comment is too long")
    private String comment;
}

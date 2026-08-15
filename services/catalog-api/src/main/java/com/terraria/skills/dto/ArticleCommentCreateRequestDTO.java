package com.terraria.skills.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ArticleCommentCreateRequestDTO {
    @NotBlank(message = "comment content is required")
    @Size(max = 1000, message = "comment content is too long")
    private String content;
}

package com.terraria.skills.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class AdminArticleCommentStatusRequestDTO {

    @NotBlank(message = "comment status is required")
    private String status;

    @Size(max = 300, message = "comment moderation reason is too long")
    private String reason;
}

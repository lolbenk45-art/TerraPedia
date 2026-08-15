package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ArticleUpsertRequestDTO {

    @NotBlank(message = "title is required")
    @Size(max = 255, message = "title is too long")
    private String title;

    @Size(max = 255, message = "slug is too long")
    private String slug;

    @Size(max = 600, message = "summary is too long")
    private String summary;

    @Size(max = 500, message = "coverImage is too long")
    private String coverImage;

    @JsonAlias("contentMarkdown")
    @NotBlank(message = "contentHtml is required")
    private String contentHtml;

    @NotBlank(message = "status is required")
    private String status;
}

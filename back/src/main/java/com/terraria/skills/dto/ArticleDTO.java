package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.time.LocalDateTime;

@Data
public class ArticleDTO {
    private Long id;
    private String title;
    private String slug;
    private String summary;
    private String coverImage;
    private String contentHtml;
    private String status;
    private String reviewStatus;
    private String reviewComment;
    private LocalDateTime reviewedAt;
    private LocalDateTime submittedAt;
    private String reviewerName;
    private LocalDateTime publishedAt;
    private Long authorId;
    private String authorDisplayName;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @JsonProperty("contentMarkdown")
    public String getContentMarkdownCompat() {
        return contentHtml;
    }
}

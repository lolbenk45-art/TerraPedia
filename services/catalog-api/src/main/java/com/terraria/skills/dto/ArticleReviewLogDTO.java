package com.terraria.skills.dto;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class ArticleReviewLogDTO {

    private Long id;
    private Long articleId;
    private String action;
    private String fromReviewStatus;
    private String toReviewStatus;
    private String comment;
    private String reviewerName;
    private LocalDateTime createdAt;
}

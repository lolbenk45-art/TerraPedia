package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
public class ArticleCommentDTO {
    private Long id;
    private Long articleId;
    private Long parentId;
    private Long rootId;
    private Long authorId;
    private String authorDisplayName;
    private String authorAvatarUrl;
    @JsonIgnore
    private String authorAvatarObjectKey;
    private Long replyToUserId;
    private String replyToDisplayName;
    private String content;
    private Integer likeCount;
    private Boolean likedByCurrentUser;
    private Integer replyCount;
    private List<ArticleCommentDTO> replies;
    private String status;
    private Boolean deleted;
    private String deletedByType;
    private Long deletedById;
    private String deletedByName;
    private String deletedReason;
    private LocalDateTime deletedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

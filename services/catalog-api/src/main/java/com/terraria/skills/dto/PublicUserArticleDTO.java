package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Builder;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PublicUserArticleDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private String title;
    private String slug;
    private String summary;
    private String coverImage;
    private LocalDateTime publishedAt;
    private Long authorId;
    private String authorDisplayName;
    private String authorAvatarUrl;
    @JsonIgnore
    private String authorAvatarObjectKey;
    private Long viewCount;
    private Long likeCount;
    private Long commentCount;
    private Long favoriteCount;
}

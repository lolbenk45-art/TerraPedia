package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Builder;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PublicUserProfileDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private String displayName;
    private String avatarUrl;
    private LocalDateTime joinedAt;
    private Long publishedArticleCount;
    private List<PublicUserArticleDTO> publishedArticles;
}

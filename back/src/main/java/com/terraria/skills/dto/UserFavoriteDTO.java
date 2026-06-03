package com.terraria.skills.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class UserFavoriteDTO {
    private String targetType;
    private Long targetId;
    private String title;
    private String imageUrl;
    private String url;
    private LocalDateTime createdAt;
}

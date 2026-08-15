package com.terraria.skills.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class UserFavoriteStatusDTO {
    private String targetType;
    private Long targetId;
    private boolean favorited;
}

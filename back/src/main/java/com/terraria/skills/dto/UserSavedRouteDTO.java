package com.terraria.skills.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserSavedRouteDTO {
    private Long id;
    private String targetType;
    private Long targetId;
    private String title;
    private String imageUrl;
    private String routeMode;
    private String selectedVariant;
    private String selectedRecipeKey;
    private Integer maxDepth;
    private String note;
    private String url;
    private String snapshotJson;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

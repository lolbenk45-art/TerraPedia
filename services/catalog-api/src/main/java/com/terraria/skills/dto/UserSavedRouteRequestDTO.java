package com.terraria.skills.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UserSavedRouteRequestDTO {
    @NotBlank(message = "targetType is required")
    private String targetType;

    @NotNull(message = "targetId is required")
    @Positive(message = "targetId must be positive")
    private Long targetId;

    @NotBlank(message = "title is required")
    @Size(max = 255, message = "title must be within 255 characters")
    private String title;

    @Size(max = 40, message = "routeMode must be within 40 characters")
    private String routeMode;

    @Size(max = 120, message = "selectedVariant must be within 120 characters")
    private String selectedVariant;

    @Size(max = 120, message = "selectedRecipeKey must be within 120 characters")
    private String selectedRecipeKey;

    private Integer maxDepth;

    @Size(max = 600, message = "note must be within 600 characters")
    private String note;

    @NotBlank(message = "url is required")
    @Size(max = 500, message = "url must be within 500 characters")
    private String url;

    private String snapshotJson;
}

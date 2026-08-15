package com.terraria.skills.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class RecipeTreeMetaDTO {
    private Integer maxDepth;
    private String mode;
    private LocalDateTime generatedAt;
}

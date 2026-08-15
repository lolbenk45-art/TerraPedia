package com.terraria.skills.dto;

import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserReadingHistoryDTO {
    private Long id;
    private String targetType;
    private Long targetId;
    private String title;
    private String imageUrl;
    private String url;
    private Integer viewCount;
    private LocalDateTime lastViewedAt;
}

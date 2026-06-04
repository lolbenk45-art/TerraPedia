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
public class UserNotificationDTO {
    private Long id;
    private String type;
    private String title;
    private String body;
    private String targetUrl;
    private Boolean read;
    private LocalDateTime readAt;
    private LocalDateTime createdAt;
}

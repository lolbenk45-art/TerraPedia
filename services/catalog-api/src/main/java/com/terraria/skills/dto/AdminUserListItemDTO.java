package com.terraria.skills.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AdminUserListItemDTO {
    private Long id;
    private String email;
    private String displayName;
    private Integer status;
    private LocalDateTime lastLoginAt;
    private LocalDateTime createdAt;
}

package com.terraria.skills.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class UserProfileDTO {
    private Long id;
    private String email;
    private String displayName;
    private Integer status;
}

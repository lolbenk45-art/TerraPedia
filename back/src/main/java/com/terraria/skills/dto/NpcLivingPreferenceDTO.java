package com.terraria.skills.dto;

import lombok.Data;

@Data
public class NpcLivingPreferenceDTO {
    private String targetType;
    private String preference;
    private Long targetId;
    private String targetName;
    private String targetNameZh;
}

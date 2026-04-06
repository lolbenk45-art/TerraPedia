package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class BiomeDTO {
    private Long id;
    private String code;
    private String nameEn;
    private String nameZh;
    private String aliasEn;
    private String aliasZh;
    private String layerType;
    private String biomeType;
    private String description;
    private String iconUrl;
    private String sourceProvider;
    private String sourcePage;
    private LocalDateTime sourceRevisionTimestamp;
    private LocalDateTime lastSyncedAt;
    private List<BiomeRelationDTO> relations = new ArrayList<>();
    private List<BiomeResourceDTO> resources = new ArrayList<>();
}

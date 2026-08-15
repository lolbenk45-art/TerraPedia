package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class BiomeNpcRelationDTO {
    private Long id;
    private Long biomeId;
    private Long npcId;
    private String relationType;
    private String spawnContext;
    private String notes;
    private String sourceProvider;
    private String sourcePage;
    private Integer sortOrder;
    private String npcName;
    private String npcNameZh;
    private String npcInternalName;
    private String npcImageUrl;
    private Boolean missingNpc;
}

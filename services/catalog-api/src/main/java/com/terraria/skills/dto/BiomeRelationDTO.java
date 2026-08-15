package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class BiomeRelationDTO {
    private Long id;
    private Long biomeId;
    private Long relatedBiomeId;
    private String relationType;
    private String notes;
    private String relatedBiomeCode;
    private String relatedBiomeNameEn;
    private String relatedBiomeNameZh;
}

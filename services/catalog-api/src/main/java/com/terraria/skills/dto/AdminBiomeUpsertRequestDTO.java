package com.terraria.skills.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
public class AdminBiomeUpsertRequestDTO {
    private String code;
    private String nameEn;
    private String nameZh;
    private String aliasEn;
    private String aliasZh;
    private String layerType;
    private String biomeType;
    private String wikiGroupCode;
    private String wikiGroupNameEn;
    private String wikiGroupNameZh;
    private String wikiParentGroupCode;
    private String wikiParentGroupNameEn;
    private String wikiParentGroupNameZh;
    private Integer wikiSectionLevel;
    private Integer wikiSortOrder;
    private String wikiSectionAnchor;
    private String description;
    private String iconUrl;
    private String sourceProvider;
    private String sourcePage;
    private LocalDateTime sourceRevisionTimestamp;
    private LocalDateTime lastSyncedAt;
    private Integer status;
    private List<AdminBiomeRelationUpsertRequestDTO> relations = new ArrayList<>();
    private List<AdminBiomeResourceUpsertRequestDTO> resources = new ArrayList<>();
}

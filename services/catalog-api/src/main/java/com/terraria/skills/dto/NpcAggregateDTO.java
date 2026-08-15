package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class NpcAggregateDTO {
    private NpcDetailDTO npc;
    private List<NpcLootEntryDTO> loot = new ArrayList<>();
    private List<NpcShopEntryDTO> shopEntries = new ArrayList<>();
    private List<NpcBuffRelationDTO> buffRelations = new ArrayList<>();
    private Map<String, String> moduleStatus = new LinkedHashMap<>();
    private LocalDateTime aggregatedAt;
}

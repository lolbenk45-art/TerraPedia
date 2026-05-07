package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.ArrayList;
import java.util.List;

@Data
@EqualsAndHashCode(callSuper = true)
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PublicBossDetailDTO extends PublicBossListDTO {

    private List<PublicBossMemberDTO> members = new ArrayList<>();
    private List<PublicBossMemberDTO> referenceMembers = new ArrayList<>();
    private PublicBossLootOwnerDTO lootOwnerNpc;
    private List<PublicBossLootEntryDTO> lootEntries = new ArrayList<>();
    private Integer directLootCount;
    private Integer treasureBagLootCount;
}

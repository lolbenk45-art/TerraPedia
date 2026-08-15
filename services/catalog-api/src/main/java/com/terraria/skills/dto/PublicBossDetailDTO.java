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

    private static final long serialVersionUID = 1L;

    private List<PublicBossMemberDTO> members = new ArrayList<>();
    private List<PublicBossMemberDTO> referenceMembers = new ArrayList<>();
    private PublicBossLootOwnerDTO lootOwnerNpc;
    private List<PublicBossLootEntryDTO> lootEntries = new ArrayList<>();
    private List<PublicBossMoneyDropDTO> moneyDrops;
    private Integer directLootCount;
    private Integer treasureBagLootCount;
    private String summonMethodResolved;
    private List<BossSummonItemDTO> summonItems = new ArrayList<>();
    private List<BossConditionDTO> summonConditions = new ArrayList<>();
    private List<BossMechanicNoteDTO> mechanicNotes = new ArrayList<>();
    private List<BossDifficultyNoteDTO> difficultyNotes = new ArrayList<>();
}

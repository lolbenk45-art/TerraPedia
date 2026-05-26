package com.terraria.skills.dto;

import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.ArrayList;
import java.util.List;

@Data
@EqualsAndHashCode(callSuper = true)
public class NpcDetailDTO extends NpcListItemDTO {
    private String behaviorNotes;
    private Integer status;
    private NpcWikiAssetsDTO wikiAssets;
    private List<NpcLivingPreferenceDTO> livingPreferences = new ArrayList<>();
}

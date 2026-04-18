package com.terraria.skills.dto;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class NpcDetailDTO extends NpcListItemDTO {
    private String behaviorNotes;
    private Integer status;
}

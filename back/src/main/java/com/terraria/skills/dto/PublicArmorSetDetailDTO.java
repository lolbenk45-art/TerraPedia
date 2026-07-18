package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.List;
import java.util.Map;

@Data
@EqualsAndHashCode(callSuper = true)
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PublicArmorSetDetailDTO extends PublicArmorSetListDTO {

    private static final long serialVersionUID = 1L;

    private Map<Long, List<PublicItemEquipmentEffectDTO>> pieceEffects;
    private Map<Long, RecipeTreeResponseDTO> pieceRecipes;
}

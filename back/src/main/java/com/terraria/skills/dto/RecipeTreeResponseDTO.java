package com.terraria.skills.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class RecipeTreeResponseDTO {
    private RecipeTreeItemDTO item;
    private RecipeTreeMetaDTO treeMeta;
    private List<RecipeTreeVariantDTO> variants = new ArrayList<>();
}

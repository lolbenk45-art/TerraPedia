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
public class ItemAggregateDTO {
    private ItemDTO item;
    private List<ItemImageDTO> images = new ArrayList<>();
    private List<ItemSourceDTO> sources = new ArrayList<>();
    private List<RecipeDTO> recipes = new ArrayList<>();
    private Map<String, String> moduleStatus = new LinkedHashMap<>();
    private LocalDateTime aggregatedAt;
}

package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AdminCraftingStationDTO {
    private Long id;
    private Long itemId;
    private String internalName;
    private String nameEn;
    private String nameZh;
    private String stationType;
    private String notes;
    private String imageUrl;
    private Integer sortOrder;
    private Integer status;
    private Integer deleted;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private String itemName;
    private String itemNameZh;
    private String itemInternalName;
    private String itemImage;
    private Integer usageRecipeCount;
    private Integer usageItemCount;
    private List<Long> usageRecipeIds = new ArrayList<>();
    private List<AdminCraftingStationUsageItemDTO> usageItems = new ArrayList<>();
}

package com.terraria.skills.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

@Data
public class NpcShopEntryDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private Long itemId;
    private Integer sourceItemId;
    private String priceText;
    private String notes;
    private Integer sortOrder;
    private String itemName;
    private String itemNameZh;
    private String itemInternalName;
    private String imageUrl;
    private List<NpcShopConditionDTO> conditions = new ArrayList<>();
}

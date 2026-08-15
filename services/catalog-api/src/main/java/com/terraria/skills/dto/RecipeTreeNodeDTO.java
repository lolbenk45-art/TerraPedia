package com.terraria.skills.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class RecipeTreeNodeDTO {
    private String nodeType;
    private Long recipeId;
    private Long itemId;
    private String itemInternalName;
    private String itemName;
    private String itemNameZh;
    private String itemImage;
    private String displayName;
    private String secondaryName;
    private String groupCanonicalName;
    private List<String> groupMemberNames = new ArrayList<>();
    private List<RecipeGroupMemberDTO> groupMembers = new ArrayList<>();
    private Integer resultQuantity;
    private String quantityText;
    private Integer quantityMin;
    private Integer quantityMax;
    private String ingredientGroupType;
    private Boolean expandable;
    private Boolean cycleDetected;
    private Boolean isReference;
    private String referenceKey;
    private Integer depth;
    private List<RecipeTreeStationDTO> stations = new ArrayList<>();
    private List<RecipeTreeNodeDTO> children = new ArrayList<>();
}

package com.terraria.skills.dto;

import lombok.Data;

import java.io.Serializable;

@Data
public class NpcListItemDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private Long gameId;
    private String internalName;
    private String name;
    private String nameZh;
    private String subName;
    private String subNameZh;
    private Long categoryId;
    private String categoryName;
    private Boolean isBoss;
    private Boolean isFriendly;
    private Boolean isTownNpc;
    private Integer npcType;
    private Integer damage;
    private Integer defense;
    private Integer lifeMax;
    private Object knockBackResist;
    private Integer lootEntryCount;
    private Integer shopEntryCount;
    private Integer buffRelationCount;
    private String imageUrl;
    private String lootItemsJson;
    private String shopItemsJson;
    private String sourceItemsJson;
}

package com.terraria.skills.dto;

import lombok.Data;

import java.io.Serializable;

@Data
public class NpcShopConditionDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private Long shopEntryId;
    private String refType;
    private Long refId;
    private String conditionRole;
    private String notes;
    private Integer sortOrder;
    private String biomeCode;
    private String biomeNameEn;
    private String biomeNameZh;
    private String contextCode;
    private String contextNameEn;
    private String contextNameZh;
    private String contextType;
}

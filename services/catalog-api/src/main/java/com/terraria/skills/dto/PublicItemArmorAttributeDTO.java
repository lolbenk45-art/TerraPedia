package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PublicItemArmorAttributeDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private Long itemId;
    private String itemInternalName;
    private String itemNameZh;
    private String itemPageTitle;
    private String itemHref;
    private String sectionCode;
    private String slotGroup;
    private Integer defenseValue;
    private String rawCellsJson;
    private String sourceProvider;
    private String sourcePage;
    private String sourceRevisionTimestamp;
}

package com.terraria.skills.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

@Data
public class ItemGroupDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String canonicalName;
    private String displayNameEn;
    private String displayNameZh;
    private List<String> aliases = new ArrayList<>();
    private List<String> domains = new ArrayList<>();
    private String sourceKind;
    private String sourceProvider;
    private String sourcePage;
    private String sourceRevisionTimestamp;
    private String sourceUpdatedAt;
    private String sourceLabel;
    private String sourceFile;
    private List<String> sourceUrls = new ArrayList<>();
    private boolean manualOnly;
    private List<ItemGroupMemberDTO> members = new ArrayList<>();
}

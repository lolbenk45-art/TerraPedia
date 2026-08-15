package com.terraria.skills.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

@Data
public class RecipeGroupDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String canonicalName;
    private String displayNameEn;
    private String displayNameZh;
    private List<RecipeGroupMemberDTO> members = new ArrayList<>();
}

package com.terraria.skills.dto;

import lombok.Data;

import java.io.Serializable;

@Data
public class ItemGroupMemberDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long itemId;
    private String internalName;
    private String name;
    private String nameZh;
    private String image;
}

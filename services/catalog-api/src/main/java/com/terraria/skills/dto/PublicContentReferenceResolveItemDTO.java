package com.terraria.skills.dto;

import lombok.Data;

import java.io.Serializable;

@Data
public class PublicContentReferenceResolveItemDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String type;
    private String id;
}

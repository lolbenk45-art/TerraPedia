package com.terraria.skills.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

@Data
public class PublicContentReferenceResolveRequestDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private List<PublicContentReferenceResolveItemDTO> refs = new ArrayList<>();
}

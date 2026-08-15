package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PublicContentReferenceDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String type;
    private String id;
    private String label;
    private String name;
    private String internalName;
    private String imageUrl;
    private String categoryName;
    private String summary;
    private String detailPath;
    private Boolean available;
}

package com.terraria.skills.dto;

import lombok.Data;

import java.io.Serializable;

@Data
public class SupportCategoryOptionDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private Long parentId;
    private String code;
    private String label;
    private String pathLabel;
    private Integer level;
    private Integer sortOrder;
    private Integer status;
}

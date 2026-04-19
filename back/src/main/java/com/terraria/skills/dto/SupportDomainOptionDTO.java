package com.terraria.skills.dto;

import lombok.Data;

import java.io.Serializable;

@Data
public class SupportDomainOptionDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private String code;
    private String label;
    private String labelZh;
    private String labelEn;
    private String contextType;
    private Integer sortOrder;
    private Integer status;
}

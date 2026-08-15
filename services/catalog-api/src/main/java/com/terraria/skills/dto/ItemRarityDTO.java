package com.terraria.skills.dto;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
public class ItemRarityDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private String code;
    private String displayNameZh;
    private String displayNameEn;
    private Integer sortOrder;
    private Integer status;
    private Long itemCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

package com.terraria.skills.vo;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CategoryVO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private Long parentId;
    private String name;
    private String code;
    private String topType;
    private Integer sort;
    private String description;
    private String icon;
    private Integer status;
    private Long creatorId;
    private List<CategoryVO> children;
    private Integer level;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

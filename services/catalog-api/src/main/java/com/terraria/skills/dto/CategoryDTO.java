package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class CategoryDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private Long parentId;
    private String name;
    private String code;
    private String topType;

    @JsonAlias({"sortOrder", "sort_order"})
    private Integer sort;

    private String description;
    private String icon;
    private Integer status;
    private Long creatorId;
    private List<CategoryDTO> children;
    private Integer level;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

package com.terraria.skills.vo;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;
import java.util.List;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CategoryNavigationChildVO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private String code;
    private String name;
    private List<Long> categoryIds;
    private String itemPath;
    private long itemCount;
    @JsonInclude(JsonInclude.Include.ALWAYS)
    private String image;
}

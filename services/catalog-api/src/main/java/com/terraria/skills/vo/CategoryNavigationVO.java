package com.terraria.skills.vo;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;
import java.util.List;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CategoryNavigationVO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String slug;
    private String filterKey;
    private String name;
    private String description;
    private String icon;
    private String categoryPath;
    private String itemPath;
    private List<String> categoryCodes;
    private List<Long> categoryIds;
    private long itemCount;
    private List<CategoryNavigationChildVO> children;
}

package com.terraria.skills.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class CategoryNavigationParentScopeMembershipDTO {

    private Long parentId;
    private Long categoryId;
}

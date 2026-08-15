package com.terraria.skills.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class CategoryNavigationScopeMembershipDTO {

    private Long childId;
    private Long categoryId;
}

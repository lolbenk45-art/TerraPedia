package com.terraria.skills.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

@Data
public class SupportDomainCatalogDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private List<SupportCategoryOptionDTO> itemCategories = List.of();
    private List<SupportDomainOptionDTO> gamePeriods = List.of();
    private List<SupportDomainOptionDTO> worldContexts = List.of();
}

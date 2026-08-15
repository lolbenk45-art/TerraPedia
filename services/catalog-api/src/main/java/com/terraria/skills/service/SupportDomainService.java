package com.terraria.skills.service;

import com.terraria.skills.dto.SupportDomainCatalogDTO;

import java.util.Map;

public interface SupportDomainService {

    SupportDomainCatalogDTO getAdminCatalog();

    Map<Long, String> getGamePeriodLabelMap();

    String getGamePeriodLabel(Long gamePeriodId);
}

package com.terraria.skills.service;

import com.terraria.skills.dto.RelationCompatibilityStatusDTO;
import com.terraria.skills.dto.RelationHealthStatusDTO;

public interface RelationCompatibilityService {

    RelationCompatibilityStatusDTO getStatus();

    RelationHealthStatusDTO getHealth();
}

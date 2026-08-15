package com.terraria.skills.dto;

import lombok.Data;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Data
public class RelationCompatibilityStatusDTO {

    private Instant generatedAt;
    private boolean switchable;
    private List<String> switchableDomains = new ArrayList<>();
    private List<String> blockedDomains = new ArrayList<>();
    private Map<String, RelationCompatibilityDomainStatusDTO> domains = new LinkedHashMap<>();
}

package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CrawlerV2AutomationDTO {
    private boolean enabled;
    private String mode = "changed-only";
    private int sweepIntervalMinutes = 60;
    private CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO lastSweep;
}

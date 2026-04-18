package com.terraria.skills.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Data
public class TownNpcOverviewDTO {
    private Boolean reportFound;
    private String reportFileName;
    private String reportPath;
    private String reportUpdatedAt;
    private Map<String, Object> reportSummary = new LinkedHashMap<>();
    private String reportGeneratedAt;
    private String sourceMode;
    private Boolean importReportFound;
    private String importReportFileName;
    private String importReportPath;
    private String importReportUpdatedAt;
    private Map<String, Object> latestImportReport = new LinkedHashMap<>();
    private Map<String, String> coinIcons = new LinkedHashMap<>();
    private List<TownNpcRowDTO> records = new ArrayList<>();
    private Map<String, Object> summary = new LinkedHashMap<>();
}

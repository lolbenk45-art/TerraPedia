package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.util.LinkedHashMap;
import java.util.Map;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CrawlerMonitorTestStateDTO {

    private String path;
    private boolean found;
    private boolean readable;
    private String updatedAt;
    private String errorMessage;
    private Map<String, Object> payload = new LinkedHashMap<>();
    private CrawlerMonitorOverviewDTO overview;
}

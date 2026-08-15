package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CrawlerMonitorReportDetailDTO {

    private boolean found;
    private boolean readable;
    private String name;
    private String path;
    private String category;
    private String updatedAt;
    private Long sizeBytes;
    private String contentType;
    private String content;
    private boolean truncated;
    private Long maxBytes;
    private String errorMessage;
}

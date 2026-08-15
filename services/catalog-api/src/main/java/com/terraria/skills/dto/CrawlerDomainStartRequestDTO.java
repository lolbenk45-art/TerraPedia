package com.terraria.skills.dto;

import lombok.Data;

@Data
public class CrawlerDomainStartRequestDTO {
    private String operationId;
    private String resumeMode;
    private Boolean confirmed;
}

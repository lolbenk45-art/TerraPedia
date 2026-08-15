package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CrawlerQueueV2ErrorDTO {
    private String reasonCode;
    private String messageZh;
    private String suggestedAction;
}

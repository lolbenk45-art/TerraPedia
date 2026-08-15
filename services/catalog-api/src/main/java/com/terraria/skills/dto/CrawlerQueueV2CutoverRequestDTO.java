package com.terraria.skills.dto;

import lombok.Data;

@Data
public class CrawlerQueueV2CutoverRequestDTO {
    private String cutoverId;
    private String resetId;
    private String confirmation;
    private String gitSha;
}

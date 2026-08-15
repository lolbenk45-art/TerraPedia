package com.terraria.skills.dto;

import lombok.Data;

@Data
public class AdminWikiImageSyncFailureDTO {

    private String scope;
    private Long recordId;
    private String sourceUrl;
    private String message;
}

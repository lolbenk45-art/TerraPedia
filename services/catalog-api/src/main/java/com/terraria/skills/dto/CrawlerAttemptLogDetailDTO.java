package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.time.Instant;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CrawlerAttemptLogDetailDTO {
    private String attemptId;
    private String path;
    private String availability;
    private boolean previewable;
    private Long sizeBytes;
    private Instant lastWriteAt;
    private Instant retentionExpiresAt;
    private String reasonCode;
    private long offset;
    private long nextOffset;
    private String content;
    private boolean truncated;
}

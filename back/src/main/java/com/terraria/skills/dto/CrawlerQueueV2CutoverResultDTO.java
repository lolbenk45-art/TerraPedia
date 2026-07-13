package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CrawlerQueueV2CutoverResultDTO {
    private String cutoverId;
    private String resetId;
    private String engineMode;
    private String stateStoreEpoch;
    private String manifestPath;
    private int v1QueueItemCount;
    private int v1NonTerminalCount;
    private int v1RecordedProcessCount;
    private int v2LiveAttemptCount;
    private boolean stateStoreReset;
    private boolean rollbackAllowed;
    private String firstLiveMutationAt;
    private String streamCursor;
    private String reasonCode;
    private String messageZh;
}

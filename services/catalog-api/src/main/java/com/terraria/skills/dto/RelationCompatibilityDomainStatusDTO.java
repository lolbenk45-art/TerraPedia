package com.terraria.skills.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class RelationCompatibilityDomainStatusDTO {

    private String domain;
    private String status;
    private int localRows;
    private int projectionRows;
    private int sharedRows;
    private int missingInProjectionCount;
    private int extraInProjectionCount;
    private List<String> missingInProjectionSamples = new ArrayList<>();
    private List<String> extraInProjectionSamples = new ArrayList<>();
    private List<BlockingFieldDTO> blockingFields = new ArrayList<>();

    @Data
    public static class BlockingFieldDTO {
        private String field;
        private int localNonNull;
        private int projectionNonNull;
        private int gap;
    }
}

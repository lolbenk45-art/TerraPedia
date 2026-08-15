package com.terraria.skills.dto;

import lombok.Data;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Data
public class RelationHealthStatusDTO {

    private Instant generatedAt;
    private boolean found;
    private boolean readable;
    private String reportPath;
    private String errorMessage;
    private SummaryDTO summary = new SummaryDTO();
    private List<CheckDTO> checks = new ArrayList<>();

    @Data
    public static class SummaryDTO {
        private String status;
        private int blockingCount;
        private int warningCount;
    }

    @Data
    public static class CheckDTO {
        private String id;
        private String status;
        private String message;
        private String reportPath;
    }
}

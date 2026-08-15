package com.terraria.skills.dto;

import java.util.ArrayList;
import java.util.List;

public class AdminWikiImageSyncScopeResultDTO {

    private static final int SAMPLE_URL_LIMIT = 5;
    private static final int SAMPLE_ERROR_LIMIT = 10;

    private final String scope;
    private int candidateCount;
    private int syncedCount;
    private int skippedCount;
    private int failedCount;
    private final List<String> sampleUrls = new ArrayList<>();
    private final List<String> sampleErrors = new ArrayList<>();

    public AdminWikiImageSyncScopeResultDTO(String scope) {
        this.scope = scope;
    }

    public String getScope() {
        return scope;
    }

    public int getCandidateCount() {
        return candidateCount;
    }

    public void setCandidateCount(int candidateCount) {
        this.candidateCount = candidateCount;
    }

    public int getSyncedCount() {
        return syncedCount;
    }

    public void setSyncedCount(int syncedCount) {
        this.syncedCount = syncedCount;
    }

    public int getSkippedCount() {
        return skippedCount;
    }

    public void setSkippedCount(int skippedCount) {
        this.skippedCount = skippedCount;
    }

    public int getFailedCount() {
        return failedCount;
    }

    public void setFailedCount(int failedCount) {
        this.failedCount = failedCount;
    }

    public List<String> getSampleUrls() {
        return sampleUrls;
    }

    public List<String> getSampleErrors() {
        return sampleErrors;
    }

    public void addSampleUrl(String url) {
        if (url == null || url.isBlank() || sampleUrls.size() >= SAMPLE_URL_LIMIT) {
            return;
        }
        sampleUrls.add(url);
    }

    public void addSampleError(String error) {
        if (error == null || error.isBlank() || sampleErrors.size() >= SAMPLE_ERROR_LIMIT) {
            return;
        }
        sampleErrors.add(error);
    }
}

package com.terraria.skills.dto;

import java.time.LocalDateTime;

public class AdminWikiImageSyncResultDTO {

    private String bucket;
    private String managedUrlPrefix;
    private LocalDateTime startedAt;
    private LocalDateTime finishedAt;
    private long durationMs;
    private int totalCandidateCount;
    private int totalSyncedCount;
    private int totalSkippedCount;
    private int totalFailedCount;
    private AdminWikiImageSyncScopeResultDTO itemImages = new AdminWikiImageSyncScopeResultDTO("itemImages");
    private AdminWikiImageSyncScopeResultDTO buffs = new AdminWikiImageSyncScopeResultDTO("buffs");
    private AdminWikiImageSyncScopeResultDTO biomes = new AdminWikiImageSyncScopeResultDTO("biomes");
    private AdminWikiImageSyncScopeResultDTO armorSets = new AdminWikiImageSyncScopeResultDTO("armorSets");

    public String getBucket() {
        return bucket;
    }

    public void setBucket(String bucket) {
        this.bucket = bucket;
    }

    public String getManagedUrlPrefix() {
        return managedUrlPrefix;
    }

    public void setManagedUrlPrefix(String managedUrlPrefix) {
        this.managedUrlPrefix = managedUrlPrefix;
    }

    public LocalDateTime getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(LocalDateTime startedAt) {
        this.startedAt = startedAt;
    }

    public LocalDateTime getFinishedAt() {
        return finishedAt;
    }

    public void setFinishedAt(LocalDateTime finishedAt) {
        this.finishedAt = finishedAt;
    }

    public long getDurationMs() {
        return durationMs;
    }

    public void setDurationMs(long durationMs) {
        this.durationMs = durationMs;
    }

    public int getTotalCandidateCount() {
        return totalCandidateCount;
    }

    public void setTotalCandidateCount(int totalCandidateCount) {
        this.totalCandidateCount = totalCandidateCount;
    }

    public int getTotalSyncedCount() {
        return totalSyncedCount;
    }

    public void setTotalSyncedCount(int totalSyncedCount) {
        this.totalSyncedCount = totalSyncedCount;
    }

    public int getTotalSkippedCount() {
        return totalSkippedCount;
    }

    public void setTotalSkippedCount(int totalSkippedCount) {
        this.totalSkippedCount = totalSkippedCount;
    }

    public int getTotalFailedCount() {
        return totalFailedCount;
    }

    public void setTotalFailedCount(int totalFailedCount) {
        this.totalFailedCount = totalFailedCount;
    }

    public AdminWikiImageSyncScopeResultDTO getItemImages() {
        return itemImages;
    }

    public void setItemImages(AdminWikiImageSyncScopeResultDTO itemImages) {
        this.itemImages = itemImages;
    }

    public AdminWikiImageSyncScopeResultDTO getBuffs() {
        return buffs;
    }

    public void setBuffs(AdminWikiImageSyncScopeResultDTO buffs) {
        this.buffs = buffs;
    }

    public AdminWikiImageSyncScopeResultDTO getBiomes() {
        return biomes;
    }

    public void setBiomes(AdminWikiImageSyncScopeResultDTO biomes) {
        this.biomes = biomes;
    }

    public AdminWikiImageSyncScopeResultDTO getArmorSets() {
        return armorSets;
    }

    public void setArmorSets(AdminWikiImageSyncScopeResultDTO armorSets) {
        this.armorSets = armorSets;
    }

    public void accumulate(AdminWikiImageSyncScopeResultDTO scopeResult) {
        totalCandidateCount += scopeResult.getCandidateCount();
        totalSyncedCount += scopeResult.getSyncedCount();
        totalSkippedCount += scopeResult.getSkippedCount();
        totalFailedCount += scopeResult.getFailedCount();
    }
}

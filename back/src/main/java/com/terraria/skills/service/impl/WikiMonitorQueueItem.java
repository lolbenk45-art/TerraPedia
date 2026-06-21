package com.terraria.skills.service.impl;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

@JsonInclude(JsonInclude.Include.NON_NULL)
class WikiMonitorQueueItem {

    private static final Set<String> TERMINAL_STATUSES = Set.of("completed", "failed", "timed_out", "cancelled");

    private String queueId;
    private String dispatchId;
    private String lane;
    private String domain;
    private List<String> coveredDomains = new ArrayList<>();
    private String actionId;
    private String status;
    private Instant requestedAt;
    private Instant startedAt;
    private Instant completedAt;
    private String claimOwner;
    private Instant claimedAt;
    private Instant claimExpiresAt;
    private Long pid;
    private Instant processStartedAt;
    private String requestedBy;
    private String blockedByDispatchId;
    private String blockedByDomain;
    private String blockedByActionId;
    private Instant blockedSince;
    private Instant cooldownUntil;
    private String progressPath;
    private String reportPath;
    private String lockPath;
    private String outputPath;
    private String message;

    boolean isTerminal() {
        return TERMINAL_STATUSES.contains(status);
    }

    boolean isWaiting() {
        return "queued".equals(status) || "blocked_cooldown".equals(status);
    }

    boolean isDedupeActive() {
        return "queued".equals(status)
            || "blocked_cooldown".equals(status)
            || "starting".equals(status)
            || "running".equals(status);
    }

    String dedupeKeyPart() {
        return lane + ":" + actionId;
    }

    public String getQueueId() {
        return queueId;
    }

    public void setQueueId(String queueId) {
        this.queueId = queueId;
    }

    public String getDispatchId() {
        return dispatchId;
    }

    public void setDispatchId(String dispatchId) {
        this.dispatchId = dispatchId;
    }

    public String getLane() {
        return lane;
    }

    public void setLane(String lane) {
        this.lane = lane;
    }

    public String getDomain() {
        return domain;
    }

    public void setDomain(String domain) {
        this.domain = domain;
    }

    public List<String> getCoveredDomains() {
        return coveredDomains;
    }

    public void setCoveredDomains(List<String> coveredDomains) {
        this.coveredDomains = coveredDomains == null ? new ArrayList<>() : new ArrayList<>(coveredDomains);
    }

    public String getActionId() {
        return actionId;
    }

    public void setActionId(String actionId) {
        this.actionId = actionId;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Instant getRequestedAt() {
        return requestedAt;
    }

    public void setRequestedAt(Instant requestedAt) {
        this.requestedAt = requestedAt;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(Instant startedAt) {
        this.startedAt = startedAt;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public void setCompletedAt(Instant completedAt) {
        this.completedAt = completedAt;
    }

    public String getClaimOwner() {
        return claimOwner;
    }

    public void setClaimOwner(String claimOwner) {
        this.claimOwner = claimOwner;
    }

    public Instant getClaimedAt() {
        return claimedAt;
    }

    public void setClaimedAt(Instant claimedAt) {
        this.claimedAt = claimedAt;
    }

    public Instant getClaimExpiresAt() {
        return claimExpiresAt;
    }

    public void setClaimExpiresAt(Instant claimExpiresAt) {
        this.claimExpiresAt = claimExpiresAt;
    }

    public Long getPid() {
        return pid;
    }

    public void setPid(Long pid) {
        this.pid = pid;
    }

    public Instant getProcessStartedAt() {
        return processStartedAt;
    }

    public void setProcessStartedAt(Instant processStartedAt) {
        this.processStartedAt = processStartedAt;
    }

    public String getRequestedBy() {
        return requestedBy;
    }

    public void setRequestedBy(String requestedBy) {
        this.requestedBy = requestedBy;
    }

    public String getBlockedByDispatchId() {
        return blockedByDispatchId;
    }

    public void setBlockedByDispatchId(String blockedByDispatchId) {
        this.blockedByDispatchId = blockedByDispatchId;
    }

    public String getBlockedByDomain() {
        return blockedByDomain;
    }

    public void setBlockedByDomain(String blockedByDomain) {
        this.blockedByDomain = blockedByDomain;
    }

    public String getBlockedByActionId() {
        return blockedByActionId;
    }

    public void setBlockedByActionId(String blockedByActionId) {
        this.blockedByActionId = blockedByActionId;
    }

    public Instant getBlockedSince() {
        return blockedSince;
    }

    public void setBlockedSince(Instant blockedSince) {
        this.blockedSince = blockedSince;
    }

    public Instant getCooldownUntil() {
        return cooldownUntil;
    }

    public void setCooldownUntil(Instant cooldownUntil) {
        this.cooldownUntil = cooldownUntil;
    }

    public String getProgressPath() {
        return progressPath;
    }

    public void setProgressPath(String progressPath) {
        this.progressPath = progressPath;
    }

    public String getReportPath() {
        return reportPath;
    }

    public void setReportPath(String reportPath) {
        this.reportPath = reportPath;
    }

    public String getLockPath() {
        return lockPath;
    }

    public void setLockPath(String lockPath) {
        this.lockPath = lockPath;
    }

    public String getOutputPath() {
        return outputPath;
    }

    public void setOutputPath(String outputPath) {
        this.outputPath = outputPath;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}

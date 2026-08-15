package com.terraria.skills.service.impl;

import java.time.Instant;

class WikiMonitorQueueStartResult {

    private String queueId;
    private String dispatchId;
    private StartStatus status;
    private String lockPath;
    private String progressPath;
    private String reportPath;
    private String outputPath;
    private String logPath;
    private Instant startedAt;
    private Long pid;
    private Instant processStartedAt;
    private Process process;
    private String message;

    String getQueueId() {
        return queueId;
    }

    void setQueueId(String queueId) {
        this.queueId = queueId;
    }

    String getDispatchId() {
        return dispatchId;
    }

    void setDispatchId(String dispatchId) {
        this.dispatchId = dispatchId;
    }

    StartStatus getStatus() {
        return status;
    }

    void setStatus(StartStatus status) {
        this.status = status;
    }

    String getLockPath() {
        return lockPath;
    }

    void setLockPath(String lockPath) {
        this.lockPath = lockPath;
    }

    String getProgressPath() {
        return progressPath;
    }

    void setProgressPath(String progressPath) {
        this.progressPath = progressPath;
    }

    String getReportPath() {
        return reportPath;
    }

    void setReportPath(String reportPath) {
        this.reportPath = reportPath;
    }

    String getOutputPath() {
        return outputPath;
    }

    void setOutputPath(String outputPath) {
        this.outputPath = outputPath;
    }

    String getLogPath() {
        return logPath;
    }

    void setLogPath(String logPath) {
        this.logPath = logPath;
    }

    Instant getStartedAt() {
        return startedAt;
    }

    void setStartedAt(Instant startedAt) {
        this.startedAt = startedAt;
    }

    Long getPid() {
        return pid;
    }

    void setPid(Long pid) {
        this.pid = pid;
    }

    Instant getProcessStartedAt() {
        return processStartedAt;
    }

    void setProcessStartedAt(Instant processStartedAt) {
        this.processStartedAt = processStartedAt;
    }

    Process getProcess() {
        return process;
    }

    void setProcess(Process process) {
        this.process = process;
    }

    String getMessage() {
        return message;
    }

    void setMessage(String message) {
        this.message = message;
    }
}

enum StartStatus {
    STARTED,
    LOCK_BUSY,
    LAUNCH_FAILED
}

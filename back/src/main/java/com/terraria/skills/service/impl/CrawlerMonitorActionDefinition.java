package com.terraria.skills.service.impl;

import java.util.List;

public record CrawlerMonitorActionDefinition(
    String domain,
    String label,
    String sourceKey,
    String locator,
    String actionId,
    String progressPath,
    List<String> command,
    boolean backendRefresh,
    boolean wikiDomain,
    boolean resumeSupported,
    String defaultResumeMode,
    String resumeStatePath,
    String restartBehavior,
    String operationId,
    String category,
    String mode,
    String descriptionZh,
    boolean networkAccess,
    String fileWriteSummary,
    String databaseAccess,
    Long estimatedRequests,
    Long estimatedRecords,
    boolean shortTask,
    boolean pauseSupported,
    String confirmationLevel,
    boolean defaultOperation
) {
    public CrawlerMonitorActionDefinition {
        command = List.copyOf(command);
    }

    public CrawlerMonitorActionDefinition(
        String domain,
        String label,
        String sourceKey,
        String locator,
        String actionId,
        String progressPath,
        List<String> command,
        boolean backendRefresh,
        boolean wikiDomain,
        boolean resumeSupported,
        String defaultResumeMode,
        String resumeStatePath,
        String restartBehavior
    ) {
        this(
            domain,
            label,
            sourceKey,
            locator,
            actionId,
            progressPath,
            command,
            backendRefresh,
            wikiDomain,
            resumeSupported,
            defaultResumeMode,
            resumeStatePath,
            restartBehavior,
            "fresh",
            "direct_crawl",
            "fresh",
            label,
            wikiDomain,
            "写入已登记的任务产物",
            "none",
            null,
            null,
            false,
            true,
            "summary",
            true
        );
    }

    public String labelZh() {
        return label;
    }

    public String sourceLocator() {
        return locator;
    }

    public List<String> coveredDomains() {
        return List.of(domain);
    }

    public List<String> renderCommand(String reportPath, String attemptProgressPath) {
        return renderBaseCommand(reportPath, attemptProgressPath);
    }

    public List<String> renderCommand(
        String reportPath,
        String attemptProgressPath,
        String effectiveResumeMode
    ) {
        String mode = effectiveResumeMode == null || effectiveResumeMode.isBlank()
            ? defaultResumeMode
            : effectiveResumeMode;
        if (!List.of("fresh", "resume", "auto").contains(mode)) {
            throw new IllegalArgumentException("不支持 resumeMode：" + mode);
        }
        if (!resumeSupported && !"fresh".equals(mode)) {
            throw new IllegalArgumentException("当前 action 不支持 resumeMode：" + mode);
        }
        List<String> rendered = renderBaseCommand(reportPath, attemptProgressPath);
        if (!resumeSupported) {
            return rendered;
        }
        java.util.ArrayList<String> resumable = new java.util.ArrayList<>(rendered);
        resumable.add("--resume-mode=" + mode);
        resumable.add("--resume-state=" + resumeStatePath);
        return List.copyOf(resumable);
    }

    private List<String> renderBaseCommand(String reportPath, String attemptProgressPath) {
        boolean reportRequired = command.stream().anyMatch(token -> token.contains("<reportPath>"));
        if (reportRequired && (reportPath == null || reportPath.isBlank())) {
            throw new IllegalArgumentException("reportPath 不能为空：actionId=" + actionId);
        }
        return command.stream()
            .map(token -> reportRequired ? token.replace("<reportPath>", reportPath) : token)
            .map(token -> token.startsWith("--progress-path=")
                ? "--progress-path=" + attemptProgressPath
                : token.replace("<progressPath>", attemptProgressPath))
            .toList();
    }
}

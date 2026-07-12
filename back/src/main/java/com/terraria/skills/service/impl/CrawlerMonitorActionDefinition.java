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
    String restartBehavior
) {
    public CrawlerMonitorActionDefinition {
        command = List.copyOf(command);
    }

    public List<String> coveredDomains() {
        return List.of(domain);
    }

    public List<String> renderCommand(String reportPath, String attemptProgressPath) {
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

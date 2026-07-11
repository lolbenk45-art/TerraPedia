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
        return command.stream()
            .map(token -> token.replace("<reportPath>", reportPath))
            .map(token -> token.startsWith("--progress-path=")
                ? "--progress-path=" + attemptProgressPath
                : token.replace("<progressPath>", attemptProgressPath))
            .toList();
    }
}

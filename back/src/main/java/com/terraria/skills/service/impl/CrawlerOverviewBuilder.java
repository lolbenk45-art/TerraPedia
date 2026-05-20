package com.terraria.skills.service.impl;

import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

public class CrawlerOverviewBuilder {

    private final CrawlerMonitorOverviewDTO overview = new CrawlerMonitorOverviewDTO();

    public CrawlerOverviewBuilder generatedAt(Instant generatedAt) {
        overview.setGeneratedAt(generatedAt);
        return this;
    }

    public CrawlerOverviewBuilder repoRoot(Path repoRoot) {
        overview.setRepoRoot(repoRoot == null ? null : repoRoot.toString());
        return this;
    }

    public CrawlerOverviewBuilder daemon(CrawlerMonitorOverviewDTO.MonitorFileDTO daemon) {
        overview.setDaemon(daemon);
        return this;
    }

    public CrawlerOverviewBuilder scheduler(CrawlerMonitorOverviewDTO.MonitorFileDTO scheduler) {
        overview.setScheduler(scheduler);
        return this;
    }

    public CrawlerOverviewBuilder lock(CrawlerMonitorOverviewDTO.MonitorFileDTO lock) {
        overview.setLock(lock);
        return this;
    }

    public CrawlerOverviewBuilder latestRun(CrawlerMonitorOverviewDTO.MonitorRunDTO latestRun) {
        overview.setLatestRun(latestRun);
        return this;
    }

    public CrawlerOverviewBuilder history(List<CrawlerMonitorOverviewDTO.MonitorRunDTO> history) {
        overview.setHistory(history == null ? List.of() : history);
        return this;
    }

    public CrawlerOverviewBuilder recentReports(List<CrawlerMonitorOverviewDTO.MonitorReportDTO> recentReports) {
        overview.setRecentReports(recentReports == null ? List.of() : recentReports);
        return this;
    }

    public CrawlerOverviewBuilder architectureLayers(List<CrawlerMonitorOverviewDTO.ArchitectureLayerDTO> architectureLayers) {
        overview.setArchitectureLayers(architectureLayers == null ? List.of() : architectureLayers);
        return this;
    }

    public CrawlerOverviewBuilder registeredTasks(List<CrawlerMonitorOverviewDTO.RegisteredTaskDTO> registeredTasks) {
        overview.setRegisteredTasks(registeredTasks == null ? List.of() : registeredTasks);
        return this;
    }

    public CrawlerOverviewBuilder imageNormalization(CrawlerMonitorOverviewDTO.ImageNormalizationSummaryDTO imageNormalization) {
        overview.setImageNormalization(imageNormalization);
        return this;
    }

    public CrawlerMonitorOverviewDTO build() {
        return overview;
    }
}

package com.terraria.skills.service.impl;

import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

class CrawlerOverviewBuilderTest {

    @Test
    void shouldAssembleCrawlerMonitorOverviewWithoutReadingState() {
        CrawlerMonitorOverviewDTO.MonitorFileDTO daemon = monitorFile("redis://daemon", "running");
        CrawlerMonitorOverviewDTO.MonitorFileDTO scheduler = monitorFile("redis://scheduler", "sleeping");
        CrawlerMonitorOverviewDTO.MonitorFileDTO lock = monitorFile("redis://lock", "locked");
        CrawlerMonitorOverviewDTO.MonitorRunDTO latestRun = new CrawlerMonitorOverviewDTO.MonitorRunDTO();
        latestRun.setFound(true);
        latestRun.setTotalActions(3);

        CrawlerMonitorOverviewDTO overview = new CrawlerOverviewBuilder()
            .generatedAt(Instant.parse("2026-05-20T05:00:00Z"))
            .repoRoot(Path.of("/tmp/TerraPedia"))
            .daemon(daemon)
            .scheduler(scheduler)
            .lock(lock)
            .latestRun(latestRun)
            .history(List.of(latestRun))
            .build();

        assertEquals(Instant.parse("2026-05-20T05:00:00Z"), overview.getGeneratedAt());
        assertEquals("/tmp/TerraPedia", overview.getRepoRoot());
        assertSame(daemon, overview.getDaemon());
        assertSame(scheduler, overview.getScheduler());
        assertSame(lock, overview.getLock());
        assertEquals(1, overview.getHistory().size());
    }

    private CrawlerMonitorOverviewDTO.MonitorFileDTO monitorFile(String path, String status) {
        CrawlerMonitorOverviewDTO.MonitorFileDTO dto = new CrawlerMonitorOverviewDTO.MonitorFileDTO();
        dto.setFound(true);
        dto.setReadable(true);
        dto.setPath(path);
        dto.setPayload(java.util.Map.of("status", status));
        return dto;
    }
}

package com.terraria.skills.service;

import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import com.terraria.skills.dto.CrawlerMonitorAutoDispatchDTO;
import com.terraria.skills.dto.CrawlerMonitorDispatchRequestDTO;
import com.terraria.skills.dto.CrawlerMonitorDispatchResultDTO;
import com.terraria.skills.dto.CrawlerMonitorReportDetailDTO;
import com.terraria.skills.dto.CrawlerMonitorTestStateDTO;

import java.util.Map;

public interface CrawlerMonitorService {

    CrawlerMonitorOverviewDTO getOverview();

    CrawlerMonitorReportDetailDTO getReportDetail(String path);

    CrawlerMonitorDispatchResultDTO dispatchWikiMonitorTask(CrawlerMonitorDispatchRequestDTO request);

    CrawlerMonitorDispatchResultDTO controlWikiMonitorDispatch(CrawlerMonitorDispatchRequestDTO request);

    CrawlerMonitorDispatchResultDTO dispatchWikiMonitorDomainSmoke(CrawlerMonitorDispatchRequestDTO request);

    CrawlerMonitorDispatchResultDTO cleanupWikiMonitorDomainSmoke();

    CrawlerMonitorAutoDispatchDTO getAutoDispatchSettings();

    CrawlerMonitorAutoDispatchDTO updateAutoDispatchSettings(CrawlerMonitorAutoDispatchDTO settings);

    CrawlerMonitorTestStateDTO getTestState();

    CrawlerMonitorTestStateDTO writeTestState(Map<String, Object> payload);

    CrawlerMonitorTestStateDTO resetTestState();
}

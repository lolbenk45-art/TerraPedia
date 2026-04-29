package com.terraria.skills.service;

import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import com.terraria.skills.dto.CrawlerMonitorReportDetailDTO;
import com.terraria.skills.dto.CrawlerMonitorTestStateDTO;

import java.util.Map;

public interface CrawlerMonitorService {

    CrawlerMonitorOverviewDTO getOverview();

    CrawlerMonitorReportDetailDTO getReportDetail(String path);

    CrawlerMonitorTestStateDTO getTestState();

    CrawlerMonitorTestStateDTO writeTestState(Map<String, Object> payload);

    CrawlerMonitorTestStateDTO resetTestState();
}

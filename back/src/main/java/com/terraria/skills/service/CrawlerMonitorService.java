package com.terraria.skills.service;

import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import com.terraria.skills.dto.CrawlerMonitorTestStateDTO;

import java.util.Map;

public interface CrawlerMonitorService {

    CrawlerMonitorOverviewDTO getOverview();

    CrawlerMonitorTestStateDTO getTestState();

    CrawlerMonitorTestStateDTO writeTestState(Map<String, Object> payload);

    CrawlerMonitorTestStateDTO resetTestState();
}

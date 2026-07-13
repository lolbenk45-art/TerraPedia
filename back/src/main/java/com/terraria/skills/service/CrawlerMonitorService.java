package com.terraria.skills.service;

import com.terraria.skills.dto.CrawlerAttemptLogDetailDTO;
import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import com.terraria.skills.dto.CrawlerMonitorAutoDispatchDTO;
import com.terraria.skills.dto.CrawlerMonitorDispatchRequestDTO;
import com.terraria.skills.dto.CrawlerMonitorDispatchResultDTO;
import com.terraria.skills.dto.CrawlerMonitorReportDetailDTO;
import com.terraria.skills.dto.CrawlerMonitorTestStateDTO;
import com.terraria.skills.dto.CrawlerQueueV2CutoverRequestDTO;
import com.terraria.skills.dto.CrawlerQueueV2CutoverResultDTO;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;

public interface CrawlerMonitorService {

    CrawlerMonitorOverviewDTO getOverview();

    CrawlerMonitorReportDetailDTO getReportDetail(String path);

    default CrawlerMonitorDispatchResultDTO dispatchWikiMonitorTask(CrawlerMonitorDispatchRequestDTO request) {
        return dispatchWikiMonitorTask(request, "system");
    }

    CrawlerMonitorDispatchResultDTO dispatchWikiMonitorTask(
        CrawlerMonitorDispatchRequestDTO request,
        String requestedBy
    );

    default CrawlerMonitorDispatchResultDTO controlWikiMonitorDispatch(CrawlerMonitorDispatchRequestDTO request) {
        return controlWikiMonitorDispatch(request, "system");
    }

    CrawlerMonitorDispatchResultDTO controlWikiMonitorDispatch(
        CrawlerMonitorDispatchRequestDTO request,
        String operator
    );

    CrawlerQueueV2CutoverResultDTO cutoverCrawlerQueueV2(
        CrawlerQueueV2CutoverRequestDTO request,
        String operator
    );

    CrawlerQueueV2CutoverResultDTO rollbackCrawlerQueueV2(
        CrawlerQueueV2CutoverRequestDTO request,
        String operator
    );

    CrawlerQueueV2CutoverResultDTO recoverCrawlerQueueV2Epoch(
        CrawlerQueueV2CutoverRequestDTO request,
        String operator
    );

    CrawlerAttemptLogDetailDTO getAttemptLog(String attemptId, long offset, int maxBytes);

    SseEmitter subscribeEvents(String after);

    CrawlerMonitorDispatchResultDTO dispatchWikiMonitorDomainSmoke(CrawlerMonitorDispatchRequestDTO request);

    CrawlerMonitorDispatchResultDTO cleanupWikiMonitorDomainSmoke();

    CrawlerMonitorAutoDispatchDTO getAutoDispatchSettings();

    CrawlerMonitorAutoDispatchDTO updateAutoDispatchSettings(CrawlerMonitorAutoDispatchDTO settings);

    CrawlerMonitorTestStateDTO getTestState();

    CrawlerMonitorTestStateDTO writeTestState(Map<String, Object> payload);

    CrawlerMonitorTestStateDTO resetTestState();
}

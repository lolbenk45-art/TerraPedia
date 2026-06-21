package com.terraria.skills.controller;

import com.terraria.skills.auth.AdminAccessDeniedException;
import com.terraria.skills.auth.AdminAuthenticationInterceptor;
import com.terraria.skills.auth.AdminTokenClaims;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.CrawlerMonitorAutoDispatchDTO;
import com.terraria.skills.dto.CrawlerMonitorDispatchRequestDTO;
import com.terraria.skills.dto.CrawlerMonitorDispatchResultDTO;
import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import com.terraria.skills.dto.CrawlerMonitorReportDetailDTO;
import com.terraria.skills.dto.CrawlerMonitorTestStateDTO;
import com.terraria.skills.dto.WikiImageLocalizationCacheMetricsDTO;
import com.terraria.skills.service.CrawlerMonitorService;
import com.terraria.skills.service.WikiImageLocalizationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/admin/crawler-monitor")
@RequiredArgsConstructor
@Tag(name = "AdminCrawlerMonitor", description = "Admin crawler and backend refresh monitor")
@SecurityRequirement(name = "bearerAuth")
public class AdminCrawlerMonitorController {

    private final CrawlerMonitorService crawlerMonitorService;
    private final WikiImageLocalizationService wikiImageLocalizationService;

    @GetMapping("/overview")
    @Operation(summary = "Get crawler monitor overview")
    public ApiResponse<CrawlerMonitorOverviewDTO> overview() {
        return ApiResponse.success(crawlerMonitorService.getOverview());
    }

    @GetMapping("/wiki-image-cache-metrics")
    @Operation(summary = "Get wiki image localization cache metrics")
    public ApiResponse<WikiImageLocalizationCacheMetricsDTO> wikiImageCacheMetrics() {
        return ApiResponse.success(wikiImageLocalizationService.cacheMetrics());
    }

    @GetMapping("/report")
    @Operation(summary = "Preview a crawler monitor report")
    public ApiResponse<CrawlerMonitorReportDetailDTO> report(@RequestParam String path) {
        return ApiResponse.success(crawlerMonitorService.getReportDetail(path));
    }

    @PostMapping("/dispatch")
    @Operation(summary = "Dispatch an approved crawler monitor task")
    public ApiResponse<CrawlerMonitorDispatchResultDTO> dispatch(HttpServletRequest httpRequest, @RequestBody CrawlerMonitorDispatchRequestDTO request) {
        requireAdminRole(httpRequest);
        return ApiResponse.success(crawlerMonitorService.dispatchWikiMonitorTask(request));
    }

    @PostMapping("/dispatch/control")
    @Operation(summary = "Pause or resume an active crawler monitor dispatch")
    public ApiResponse<CrawlerMonitorDispatchResultDTO> controlDispatch(HttpServletRequest httpRequest, @RequestBody CrawlerMonitorDispatchRequestDTO request) {
        requireAdminRole(httpRequest);
        return ApiResponse.success(crawlerMonitorService.controlWikiMonitorDispatch(request));
    }

    @PostMapping("/test-domain-smoke")
    @Operation(summary = "Dispatch a bounded wiki monitor domain smoke test")
    public ApiResponse<CrawlerMonitorDispatchResultDTO> dispatchTestDomainSmoke(HttpServletRequest httpRequest) {
        requireAdminRole(httpRequest);
        return ApiResponse.success(crawlerMonitorService.dispatchWikiMonitorDomainSmoke());
    }

    @PostMapping("/test-domain-smoke/cleanup")
    @Operation(summary = "Clean up bounded wiki monitor domain smoke artifacts")
    public ApiResponse<CrawlerMonitorDispatchResultDTO> cleanupTestDomainSmoke(HttpServletRequest httpRequest) {
        requireAdminRole(httpRequest);
        return ApiResponse.success(crawlerMonitorService.cleanupWikiMonitorDomainSmoke());
    }

    @GetMapping("/auto-dispatch")
    @Operation(summary = "Get crawler monitor auto-dispatch settings")
    public ApiResponse<CrawlerMonitorAutoDispatchDTO> getAutoDispatchSettings() {
        return ApiResponse.success(crawlerMonitorService.getAutoDispatchSettings());
    }

    @PutMapping("/auto-dispatch")
    @Operation(summary = "Update crawler monitor auto-dispatch settings")
    public ApiResponse<CrawlerMonitorAutoDispatchDTO> updateAutoDispatchSettings(
        HttpServletRequest httpRequest,
        @RequestBody CrawlerMonitorAutoDispatchDTO settings
    ) {
        requireAdminRole(httpRequest);
        return ApiResponse.success(crawlerMonitorService.updateAutoDispatchSettings(settings));
    }

    @GetMapping("/test-state")
    @Operation(summary = "Get manual crawler monitor test state")
    public ApiResponse<CrawlerMonitorTestStateDTO> testState() {
        return ApiResponse.success(crawlerMonitorService.getTestState());
    }

    @PutMapping("/test-state")
    @Operation(summary = "Write manual crawler monitor test state")
    public ApiResponse<CrawlerMonitorTestStateDTO> writeTestState(HttpServletRequest httpRequest, @RequestBody Map<String, Object> payload) {
        requireAdminRole(httpRequest);
        return ApiResponse.success(crawlerMonitorService.writeTestState(payload));
    }

    @PostMapping("/test-state/reset")
    @Operation(summary = "Reset manual crawler monitor test state")
    public ApiResponse<CrawlerMonitorTestStateDTO> resetTestState(HttpServletRequest httpRequest) {
        requireAdminRole(httpRequest);
        return ApiResponse.success(crawlerMonitorService.resetTestState());
    }

    private void requireAdminRole(HttpServletRequest httpRequest) {
        Object attribute = httpRequest.getAttribute(AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE);
        if (!(attribute instanceof AdminTokenClaims claims) || !"ADMIN".equalsIgnoreCase(claims.getRole())) {
            throw new AdminAccessDeniedException("无权执行该操作");
        }
    }
}

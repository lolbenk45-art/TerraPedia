package com.terraria.skills.controller;

import com.terraria.skills.auth.AdminAccessDeniedException;
import com.terraria.skills.auth.AdminAuthenticationInterceptor;
import com.terraria.skills.auth.AdminTokenClaims;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.CrawlerAttemptLogDetailDTO;
import com.terraria.skills.dto.CrawlerDomainStartRequestDTO;
import com.terraria.skills.dto.CrawlerMonitorAutoDispatchDTO;
import com.terraria.skills.dto.CrawlerV2AutomationDTO;
import com.terraria.skills.dto.CrawlerMonitorDispatchRequestDTO;
import com.terraria.skills.dto.CrawlerMonitorDispatchResultDTO;
import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import com.terraria.skills.dto.CrawlerMonitorReportDetailDTO;
import com.terraria.skills.dto.CrawlerMonitorTestStateDTO;
import com.terraria.skills.dto.CrawlerQueueV2CutoverRequestDTO;
import com.terraria.skills.dto.CrawlerQueueV2CutoverResultDTO;
import com.terraria.skills.dto.WikiImageLocalizationCacheMetricsDTO;
import com.terraria.skills.service.CrawlerMonitorService;
import com.terraria.skills.service.CrawlerV2SchedulerActivationPreflightService;
import com.terraria.skills.service.WikiImageLocalizationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;

@RestController
@RequestMapping("/admin/crawler-monitor")
@RequiredArgsConstructor
@Tag(name = "AdminCrawlerMonitor", description = "Admin crawler and backend refresh monitor")
@SecurityRequirement(name = "bearerAuth")
public class AdminCrawlerMonitorController {

    private final CrawlerMonitorService crawlerMonitorService;
    private final CrawlerV2SchedulerActivationPreflightService schedulerActivationPreflightService;
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
        AdminTokenClaims claims = requireAdminRole(httpRequest);
        return ApiResponse.success(crawlerMonitorService.dispatchWikiMonitorTask(request, claims.getUsername()));
    }

    @PostMapping("/domains/{domain}/start")
    @Operation(summary = "Start a registered crawler domain through V2")
    public ApiResponse<CrawlerMonitorDispatchResultDTO> startDomain(
        HttpServletRequest request,
        @PathVariable String domain,
        @RequestBody(required = false) CrawlerDomainStartRequestDTO payload
    ) {
        AdminTokenClaims claims = requireAdminRole(request);
        String operationId = payload == null ? null : payload.getOperationId();
        String resumeMode = payload == null ? null : payload.getResumeMode();
        boolean confirmed = payload != null && Boolean.TRUE.equals(payload.getConfirmed());
        return ApiResponse.success(crawlerMonitorService.startCrawlerDomain(
            domain,
            operationId,
            resumeMode,
            confirmed,
            claims.getUsername()
        ));
    }

    @PostMapping("/dispatch/control")
    @Operation(summary = "Pause or resume an active crawler monitor dispatch")
    public ApiResponse<CrawlerMonitorDispatchResultDTO> controlDispatch(HttpServletRequest httpRequest, @RequestBody CrawlerMonitorDispatchRequestDTO request) {
        AdminTokenClaims claims = requireAdminRole(httpRequest);
        return ApiResponse.success(crawlerMonitorService.controlWikiMonitorDispatch(request, claims.getUsername()));
    }

    @PostMapping("/cutover")
    @Operation(summary = "Explicitly cut over the crawler live queue to V2")
    public ApiResponse<CrawlerQueueV2CutoverResultDTO> cutover(
        HttpServletRequest request,
        @RequestBody CrawlerQueueV2CutoverRequestDTO payload
    ) {
        AdminTokenClaims claims = requireAdminRole(request);
        return ApiResponse.success(crawlerMonitorService.cutoverCrawlerQueueV2(payload, claims.getUsername()));
    }

    @PostMapping("/cutover/rollback")
    @Operation(summary = "Roll back crawler queue V2 only before its first live mutation")
    public ApiResponse<CrawlerQueueV2CutoverResultDTO> rollbackCutover(
        HttpServletRequest request,
        @RequestBody CrawlerQueueV2CutoverRequestDTO payload
    ) {
        AdminTokenClaims claims = requireAdminRole(request);
        return ApiResponse.success(crawlerMonitorService.rollbackCrawlerQueueV2(payload, claims.getUsername()));
    }

    @PostMapping("/cutover/recover-state-store-reset")
    @Operation(summary = "Explicitly reset a mismatched crawler V2 state-store epoch")
    public ApiResponse<CrawlerQueueV2CutoverResultDTO> recoverStateStoreReset(
        HttpServletRequest request,
        @RequestBody CrawlerQueueV2CutoverRequestDTO payload
    ) {
        AdminTokenClaims claims = requireAdminRole(request);
        return ApiResponse.success(crawlerMonitorService.recoverCrawlerQueueV2Epoch(payload, claims.getUsername()));
    }

    @GetMapping("/attempts/{attemptId}/log")
    @Operation(summary = "Read a V2 crawler attempt log incrementally")
    public ApiResponse<CrawlerAttemptLogDetailDTO> attemptLog(
        HttpServletRequest request,
        @PathVariable String attemptId,
        @RequestParam(defaultValue = "0") long offset,
        @RequestParam(defaultValue = "262144") int maxBytes
    ) {
        requireAdminRole(request);
        return ApiResponse.success(crawlerMonitorService.getAttemptLog(attemptId, offset, maxBytes));
    }

    @GetMapping("/events")
    @Operation(summary = "Subscribe to V2 crawler monitor events")
    public SseEmitter events(
        HttpServletRequest request,
        HttpServletResponse response,
        @RequestParam(defaultValue = "0-0") String after
    ) {
        requireAdminRole(request);
        SseEmitter emitter = crawlerMonitorService.subscribeEvents(after);
        response.setContentType(MediaType.TEXT_EVENT_STREAM_VALUE);
        return emitter;
    }

    @PostMapping("/test-domain-smoke")
    @Operation(summary = "Dispatch a bounded wiki monitor domain smoke test")
    public ApiResponse<CrawlerMonitorDispatchResultDTO> dispatchTestDomainSmoke(
        HttpServletRequest httpRequest,
        @RequestBody(required = false) CrawlerMonitorDispatchRequestDTO request
    ) {
        requireAdminRole(httpRequest);
        return ApiResponse.success(crawlerMonitorService.dispatchWikiMonitorDomainSmoke(request));
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

    @GetMapping("/v2/automation")
    @Operation(summary = "Get V2 crawler automation settings")
    public ApiResponse<CrawlerV2AutomationDTO> getV2AutomationSettings() {
        return ApiResponse.success(crawlerMonitorService.getV2AutomationSettings());
    }

    @GetMapping("/v2/automation/preflight")
    @Operation(summary = "Read V2 scheduler activation preflight")
    public ApiResponse<com.terraria.skills.dto.CrawlerV2SchedulerActivationPreflightDTO> getV2AutomationPreflight(
        HttpServletRequest httpRequest
    ) {
        requireAdminRole(httpRequest);
        return ApiResponse.success(schedulerActivationPreflightService.getPreflight());
    }

    @PutMapping("/v2/automation")
    @Operation(summary = "Update V2 crawler automation settings")
    public ApiResponse<CrawlerV2AutomationDTO> updateV2AutomationSettings(
        HttpServletRequest httpRequest,
        @RequestBody CrawlerV2AutomationDTO settings
    ) {
        requireAdminRole(httpRequest);
        return ApiResponse.success(crawlerMonitorService.updateV2AutomationSettings(settings));
    }

    @PostMapping("/v2/automation/sweep")
    @Operation(summary = "Run one V2 crawler automation sweep")
    public ApiResponse<CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO> runV2AutomationSweep(HttpServletRequest httpRequest) {
        requireAdminRole(httpRequest);
        return ApiResponse.success(crawlerMonitorService.runV2AutomationSweepOnce());
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

    private AdminTokenClaims requireAdminRole(HttpServletRequest httpRequest) {
        Object attribute = httpRequest.getAttribute(AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE);
        if (!(attribute instanceof AdminTokenClaims claims) || !"ADMIN".equalsIgnoreCase(claims.getRole())) {
            throw new AdminAccessDeniedException("无权执行该操作");
        }
        if (claims.getUsername() == null || claims.getUsername().isBlank()) {
            throw new AdminAccessDeniedException("管理员身份缺少用户名");
        }
        return claims;
    }
}

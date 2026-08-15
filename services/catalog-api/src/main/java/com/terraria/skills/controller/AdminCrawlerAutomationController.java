package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.CrawlerAutomationApprovalRequestDTO;
import com.terraria.skills.dto.CrawlerAutomationOverviewDTO;
import com.terraria.skills.dto.CrawlerAutomationRunDTO;
import com.terraria.skills.service.CrawlerAutomationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/admin/crawler-automation")
@RequiredArgsConstructor
@Tag(name = "AdminCrawlerAutomation", description = "Crawler automation policy, runs, and approvals")
@SecurityRequirement(name = "bearerAuth")
public class AdminCrawlerAutomationController {

    private final CrawlerAutomationService automationService;

    @GetMapping("/overview")
    @Operation(summary = "Get automation overview: circuit breakers, pending approvals, abnormal domains")
    public ResponseEntity<ApiResponse<CrawlerAutomationOverviewDTO>> getOverview() {
        return ResponseEntity.ok(ApiResponse.success(automationService.getOverview()));
    }

    @GetMapping("/runs")
    @Operation(summary = "List recent automation runs")
    public ResponseEntity<ApiResponse<List<CrawlerAutomationRunDTO>>> listRuns(
        @RequestParam(defaultValue = "20") int limit
    ) {
        if (limit < 1 || limit > 100) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.error("limit must be between 1 and 100"));
        }
        return ResponseEntity.ok(ApiResponse.success(automationService.listRecentRuns(limit)));
    }

    @GetMapping("/runs/{runId}")
    @Operation(summary = "Get a single automation run with its decision")
    public ResponseEntity<ApiResponse<CrawlerAutomationRunDTO>> getRun(
        @PathVariable String runId
    ) {
        CrawlerAutomationRunDTO run = automationService.getRun(runId);
        if (run == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error("run not found: " + runId));
        }
        return ResponseEntity.ok(ApiResponse.success(run));
    }

    @PostMapping("/approvals")
    @Operation(summary = "Submit an Owner approval for a pending L1 decision")
    public ResponseEntity<ApiResponse<Map<String, String>>> submitApproval(
        @RequestBody CrawlerAutomationApprovalRequestDTO request
    ) {
        if (automationService.isReadOnlyProfile()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiResponse.error("mutation controls are disabled in read-only profile"));
        }
        if (request == null || request.requestKey() == null || request.runId() == null) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.error("approval request is incomplete"));
        }
        try {
            String requestKey = automationService.submitApproval(request);
            return ResponseEntity.ok(ApiResponse.success(Map.of("requestKey", requestKey)));
        } catch (IllegalStateException ex) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ApiResponse.error(ex.getMessage()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.error(ex.getMessage()));
        }
    }

    @GetMapping("/profile")
    @Operation(summary = "Returns whether mutation controls are disabled (T2 read-only mode)")
    public ResponseEntity<ApiResponse<Map<String, Boolean>>> getProfile() {
        return ResponseEntity.ok(ApiResponse.success(
            Map.of("readOnly", automationService.isReadOnlyProfile())
        ));
    }
}

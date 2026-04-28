package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import com.terraria.skills.dto.CrawlerMonitorTestStateDTO;
import com.terraria.skills.service.CrawlerMonitorService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/admin/crawler-monitor")
@RequiredArgsConstructor
@Tag(name = "AdminCrawlerMonitor", description = "Admin crawler and backend refresh monitor")
@SecurityRequirement(name = "bearerAuth")
public class AdminCrawlerMonitorController {

    private final CrawlerMonitorService crawlerMonitorService;

    @GetMapping("/overview")
    @Operation(summary = "Get crawler monitor overview")
    public ApiResponse<CrawlerMonitorOverviewDTO> overview() {
        return ApiResponse.success(crawlerMonitorService.getOverview());
    }

    @GetMapping("/test-state")
    @Operation(summary = "Get manual crawler monitor test state")
    public ApiResponse<CrawlerMonitorTestStateDTO> testState() {
        return ApiResponse.success(crawlerMonitorService.getTestState());
    }

    @PutMapping("/test-state")
    @Operation(summary = "Write manual crawler monitor test state")
    public ApiResponse<CrawlerMonitorTestStateDTO> writeTestState(@RequestBody Map<String, Object> payload) {
        return ApiResponse.success(crawlerMonitorService.writeTestState(payload));
    }

    @PostMapping("/test-state/reset")
    @Operation(summary = "Reset manual crawler monitor test state")
    public ApiResponse<CrawlerMonitorTestStateDTO> resetTestState() {
        return ApiResponse.success(crawlerMonitorService.resetTestState());
    }
}

package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import com.terraria.skills.service.CrawlerMonitorService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
}

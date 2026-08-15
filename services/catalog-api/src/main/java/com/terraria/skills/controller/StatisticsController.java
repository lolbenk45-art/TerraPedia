package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.CatalogStatisticsDTO;
import com.terraria.skills.service.CatalogStatisticsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/statistics")
@RequiredArgsConstructor
@Tag(name = "Statistics", description = "公共统计与管理统计接口")
public class StatisticsController {

    private final CatalogStatisticsService statisticsService;

    @GetMapping("/overview")
    @Operation(summary = "公共统计概览", description = "前台可直接读取的物品与分类统计概览")
    public ApiResponse<CatalogStatisticsDTO> overview() {
        CatalogStatisticsDTO stats = statisticsService.getCatalogStatistics();
        return ApiResponse.success(stats);
    }

    @GetMapping("/admin/overview")
    @Operation(summary = "管理端统计概览", description = "管理端仪表盘读取的受保护统计接口")
    @SecurityRequirement(name = "bearerAuth")
    public ApiResponse<CatalogStatisticsDTO> adminOverview() {
        CatalogStatisticsDTO stats = statisticsService.getCatalogStatistics();
        return ApiResponse.success(stats);
    }
}

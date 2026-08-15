package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.DataSourceAcceptanceOverviewDTO;
import com.terraria.skills.service.DataSourceAcceptanceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin/data-source-acceptance")
@RequiredArgsConstructor
@Tag(name = "AdminDataSourceAcceptance", description = "Admin trusted data source acceptance overview")
@SecurityRequirement(name = "bearerAuth")
public class AdminDataSourceAcceptanceController {

    private final DataSourceAcceptanceService dataSourceAcceptanceService;

    @GetMapping("/overview")
    @Operation(summary = "Get trusted data source acceptance overview")
    public ApiResponse<DataSourceAcceptanceOverviewDTO> overview() {
        return ApiResponse.success(dataSourceAcceptanceService.getOverview());
    }
}

package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.DomainAcceptanceOverviewDTO;
import com.terraria.skills.service.DomainAcceptanceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin/domain-acceptance")
@RequiredArgsConstructor
@Tag(name = "AdminDomainAcceptance", description = "Admin B-tier domain acceptance overview")
@SecurityRequirement(name = "bearerAuth")
public class AdminDomainAcceptanceController {

    private final DomainAcceptanceService domainAcceptanceService;

    @GetMapping("/overview")
    @Operation(summary = "Get B-tier domain acceptance overview")
    public ApiResponse<DomainAcceptanceOverviewDTO> overview() {
        return ApiResponse.success(domainAcceptanceService.getOverview());
    }
}

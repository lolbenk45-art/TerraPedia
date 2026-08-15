package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.SupportDomainCatalogDTO;
import com.terraria.skills.service.SupportDomainService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin/support-domains")
@RequiredArgsConstructor
@Tag(name = "AdminSupportDomains", description = "Admin support domain lookup catalog")
@SecurityRequirement(name = "bearerAuth")
public class AdminSupportDomainController {

    private final SupportDomainService supportDomainService;

    @GetMapping("/catalog")
    @Operation(summary = "Get support domain catalog")
    public ApiResponse<SupportDomainCatalogDTO> getCatalog() {
        return ApiResponse.success(supportDomainService.getAdminCatalog());
    }
}

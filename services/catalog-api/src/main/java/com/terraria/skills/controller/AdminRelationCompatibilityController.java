package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.RelationCompatibilityStatusDTO;
import com.terraria.skills.dto.RelationHealthStatusDTO;
import com.terraria.skills.service.RelationCompatibilityService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin/relation")
@RequiredArgsConstructor
@Tag(name = "AdminRelationCompatibility", description = "Admin relation compatibility readiness")
@SecurityRequirement(name = "bearerAuth")
public class AdminRelationCompatibilityController {

    private final RelationCompatibilityService relationCompatibilityService;

    @GetMapping("/compatibility")
    @Operation(summary = "Get relation compatibility readiness")
    public ApiResponse<RelationCompatibilityStatusDTO> getCompatibility() {
        return ApiResponse.success(relationCompatibilityService.getStatus());
    }

    @GetMapping("/health")
    @Operation(summary = "Get latest relation health report status")
    public ApiResponse<RelationHealthStatusDTO> getHealth() {
        return ApiResponse.success(relationCompatibilityService.getHealth());
    }
}

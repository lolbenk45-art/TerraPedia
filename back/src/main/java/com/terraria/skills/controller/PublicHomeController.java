package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.PublicHomeFocusItemDTO;
import com.terraria.skills.service.PublicHomeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/public/home")
@RequiredArgsConstructor
@Tag(name = "Public Home", description = "Public homepage data APIs")
public class PublicHomeController {

    private final PublicHomeService publicHomeService;

    @GetMapping("/focus-item")
    @Operation(summary = "Get curated real item for homepage focus")
    public ApiResponse<PublicHomeFocusItemDTO> focusItem() {
        return ApiResponse.success(publicHomeService.getFocusItem());
    }
}

package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.dto.PublicUserProfileDTO;
import com.terraria.skills.service.PublicUserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
@Tag(name = "Users", description = "Public user profile APIs")
public class PublicUserController {

    private final PublicUserService publicUserService;

    @GetMapping("/{id}")
    @Operation(summary = "Get public user profile")
    public ResponseEntity<ApiResponse<PublicUserProfileDTO>> getPublicUserProfile(
        @PathVariable Long id,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size
    ) {
        try {
            if (id == null || id <= 0) {
                throw new IllegalArgumentException("Invalid user id");
            }
            int resolvedPage = PaginationParams.resolvePage(page);
            int resolvedLimit = PaginationParams.resolveLimit(limit, size, 6, 20);
            return ResponseEntity.ok(ApiResponse.success(publicUserService.getPublicProfile(id, resolvedPage, resolvedLimit)));
        } catch (IllegalArgumentException exception) {
            HttpStatus status = "User not found".equals(exception.getMessage()) ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
            return ResponseEntity.status(status).body(ApiResponse.error(status.value(), exception.getMessage()));
        }
    }
}

package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.AdminWikiImageSyncRequestDTO;
import com.terraria.skills.dto.AdminWikiImageSyncResultDTO;
import com.terraria.skills.security.AdminJobLockProperties;
import com.terraria.skills.security.AdminJobLockService;
import com.terraria.skills.service.WikiImageSyncService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin/storage")
@RequiredArgsConstructor
@Tag(name = "AdminStorage", description = "Admin storage and asset operations")
@SecurityRequirement(name = "bearerAuth")
@ConditionalOnProperty(prefix = "terraria.storage.minio", name = "enabled", havingValue = "true", matchIfMissing = true)
public class AdminStorageController {

    private final WikiImageSyncService wikiImageSyncService;
    private final AdminJobLockService adminJobLockService;
    private final AdminJobLockProperties adminJobLockProperties;

    @PostMapping("/wiki-images/sync")
    @Operation(summary = "Mirror wiki images to MinIO")
    public ResponseEntity<ApiResponse<AdminWikiImageSyncResultDTO>> syncWikiImages(
        @RequestBody(required = false) AdminWikiImageSyncRequestDTO request
    ) {
        return adminJobLockService.tryAcquire("admin-job:wiki-image-sync", adminJobLockProperties.getWikiImageSyncTtlSeconds())
            .map(lock -> {
                try {
                    AdminWikiImageSyncRequestDTO safeRequest = request == null ? new AdminWikiImageSyncRequestDTO() : request;
                    AdminWikiImageSyncResultDTO result = wikiImageSyncService.syncWikiImages(safeRequest);
                    return ResponseEntity.ok(ApiResponse.success(result, "Wiki image sync completed"));
                } finally {
                    adminJobLockService.release(lock);
                }
            })
            .orElseGet(() -> ResponseEntity
                .status(HttpStatus.CONFLICT)
                .body(ApiResponse.error(HttpStatus.CONFLICT.value(), "Wiki image sync is already running")));
    }
}

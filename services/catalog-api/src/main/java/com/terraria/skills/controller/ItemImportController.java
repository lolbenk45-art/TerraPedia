package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.ItemImportRequestDTO;
import com.terraria.skills.dto.ItemImportResultDTO;
import com.terraria.skills.security.AdminJobLockProperties;
import com.terraria.skills.security.AdminJobLockService;
import com.terraria.skills.service.ItemImportService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@RestController
@RequestMapping("/items/import")
@RequiredArgsConstructor
public class ItemImportController {

    private final ItemImportService itemImportService;
    private final AdminJobLockService adminJobLockService;
    private final AdminJobLockProperties adminJobLockProperties;

    @PostMapping
    public ResponseEntity<ApiResponse<ItemImportResultDTO>> importItems(
        @RequestBody ItemImportRequestDTO request,
        @RequestParam(name = "dryRun", defaultValue = "false") boolean dryRun
    ) {
        log.info("import items source={}, count={}, dryRun={}", request.getSource(), request.getItems() == null ? 0 : request.getItems().size(), dryRun);
        if (dryRun) {
            ItemImportResultDTO result = itemImportService.importItems(request, true);
            return ResponseEntity.ok(ApiResponse.success(result, "Items import dry-run finished"));
        }

        return adminJobLockService.tryAcquire("admin-job:item-import", adminJobLockProperties.getItemImportTtlSeconds())
            .map(lock -> {
                try {
                    ItemImportResultDTO result = itemImportService.importItems(request);
                    return ResponseEntity.ok(ApiResponse.success(result, "Items import finished"));
                } finally {
                    adminJobLockService.release(lock);
                }
            })
            .orElseGet(() -> ResponseEntity
                .status(HttpStatus.CONFLICT)
                .body(ApiResponse.error(HttpStatus.CONFLICT.value(), "Items import is already running")));
    }
}

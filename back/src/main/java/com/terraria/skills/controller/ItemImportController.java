package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.ItemImportRequestDTO;
import com.terraria.skills.dto.ItemImportResultDTO;
import com.terraria.skills.service.ItemImportService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@RestController
@RequestMapping("/items/import")
@RequiredArgsConstructor
public class ItemImportController {

    private final ItemImportService itemImportService;

    @PostMapping
    public ResponseEntity<ApiResponse<ItemImportResultDTO>> importItems(@RequestBody ItemImportRequestDTO request) {
        log.info("import items source={}, count={}", request.getSource(), request.getItems() == null ? 0 : request.getItems().size());
        ItemImportResultDTO result = itemImportService.importItems(request);
        return ResponseEntity.ok(ApiResponse.success(result, "Items import finished"));
    }
}

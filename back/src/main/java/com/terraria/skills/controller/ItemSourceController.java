package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.ItemSourceDTO;
import com.terraria.skills.service.ItemSourceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/items")
@RequiredArgsConstructor
@Tag(name = "Item Sources", description = "Read-only item acquisition source APIs")
public class ItemSourceController {

    private final ItemSourceService itemSourceService;

    @GetMapping("/{id}/sources")
    @Operation(summary = "Get acquisition sources for the item")
    public ResponseEntity<ApiResponse<List<ItemSourceDTO>>> getItemSources(@PathVariable("id") Long itemId) {
        return ResponseEntity.ok(ApiResponse.success(itemSourceService.getSourcesByItemId(itemId)));
    }
}

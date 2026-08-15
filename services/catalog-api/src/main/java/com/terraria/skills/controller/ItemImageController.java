package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.ItemImageDTO;
import com.terraria.skills.service.ItemImageService;
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
@Tag(name = "Item Images", description = "Read-only item image APIs")
public class ItemImageController {

    private final ItemImageService itemImageService;

    @GetMapping("/{id}/images")
    @Operation(summary = "Get images for the item")
    public ResponseEntity<ApiResponse<List<ItemImageDTO>>> getItemImages(@PathVariable("id") Long itemId) {
        return ResponseEntity.ok(ApiResponse.success(itemImageService.getImagesByItemId(itemId)));
    }
}

package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/public/items")
@Tag(name = "Public Item Aggregate", description = "Public aggregate item detail APIs")
public class PublicItemAggregateController {

    @GetMapping("/{id}/aggregate")
    @Operation(summary = "Deprecated aggregated public item detail")
    public ResponseEntity<ApiResponse<Void>> getItemAggregate(@PathVariable Long id) {
        return ResponseEntity.status(HttpStatus.GONE)
            .body(ApiResponse.error(410, "Public item aggregate is deprecated. Use split public item detail, images, sources, and recipe-tree endpoints."));
    }
}

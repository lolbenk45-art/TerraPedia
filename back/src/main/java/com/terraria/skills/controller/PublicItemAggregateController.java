package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.ItemAggregateDTO;
import com.terraria.skills.service.impl.PublicItemAggregateService;
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
@RequestMapping("/public/items")
@RequiredArgsConstructor
@Tag(name = "Public Item Aggregate", description = "Public aggregate item detail APIs")
public class PublicItemAggregateController {

    private final PublicItemAggregateService publicItemAggregateService;

    @GetMapping("/{id}/aggregate")
    @Operation(summary = "Get aggregated public item detail")
    public ResponseEntity<ApiResponse<ItemAggregateDTO>> getItemAggregate(
        @PathVariable Long id,
        @RequestParam(defaultValue = "images,sources,recipes") String include
    ) {
        ItemAggregateDTO response = publicItemAggregateService.getItemAggregate(id, include);
        if (response == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error(404, "Item not found"));
        }

        return ResponseEntity.ok(ApiResponse.success(response));
    }
}

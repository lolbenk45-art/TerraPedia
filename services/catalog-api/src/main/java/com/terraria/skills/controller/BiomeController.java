package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.BiomeDTO;
import com.terraria.skills.service.BiomeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/biomes")
@RequiredArgsConstructor
@Tag(name = "Biomes", description = "Read-only biome APIs")
public class BiomeController {

    private final BiomeService biomeService;

    @GetMapping
    @Operation(summary = "Get biomes")
    public ResponseEntity<ApiResponse<List<BiomeDTO>>> getBiomes() {
        return ResponseEntity.ok(ApiResponse.success(biomeService.getBiomes()));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get biome by id")
    public ResponseEntity<ApiResponse<BiomeDTO>> getBiomeById(@PathVariable Long id) {
        BiomeDTO biome = biomeService.getBiomeById(id);
        if (biome == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error(404, "Biome not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(biome));
    }
}

package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.dto.PublicProjectileListDTO;
import com.terraria.skills.dto.PublicProjectileQuery;
import com.terraria.skills.service.PublicProjectileService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/public/projectiles")
@RequiredArgsConstructor
@Tag(name = "Public Projectiles", description = "Public projectile list APIs")
public class PublicProjectileController {

    private final PublicProjectileService publicProjectileService;

    @GetMapping
    @Operation(summary = "Get public projectile list")
    public ResponseEntity<ApiResponse<List<PublicProjectileListDTO>>> getPublicProjectiles(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) String sortBy,
        @RequestParam(required = false) String sortDirection
    ) {
        PublicProjectileQuery query = new PublicProjectileQuery();
        query.setPage(PaginationParams.resolvePage(page));
        query.setLimit(PaginationParams.resolveLimit(limit, size, 20, 100));
        query.setSearch(search);
        query.setSortBy(sortBy);
        query.setSortDirection(sortDirection);

        Page<PublicProjectileListDTO> projectilePage = publicProjectileService.getPublicProjectiles(query);
        ApiResponse<List<PublicProjectileListDTO>> response = ApiResponse.success(projectilePage.getRecords());
        response.setPagination(new Pagination(
            projectilePage.getTotal(),
            (int) projectilePage.getCurrent(),
            (int) projectilePage.getSize()
        ));
        return ResponseEntity.ok(response);
    }
}

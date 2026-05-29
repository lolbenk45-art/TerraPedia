package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.dto.PublicArmorSetListDTO;
import com.terraria.skills.dto.PublicArmorSetQuery;
import com.terraria.skills.service.PublicArmorSetService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/public/armor-sets")
@RequiredArgsConstructor
@Tag(name = "Public Armor Sets", description = "Public armor set list APIs")
public class PublicArmorSetController {

    private final PublicArmorSetService publicArmorSetService;

    @GetMapping
    @Operation(summary = "Get public armor set list")
    public ResponseEntity<ApiResponse<List<PublicArmorSetListDTO>>> getPublicArmorSets(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) String sortBy,
        @RequestParam(required = false) String sortDirection
    ) {
        PublicArmorSetQuery query = new PublicArmorSetQuery();
        query.setPage(PaginationParams.resolvePage(page));
        query.setLimit(PaginationParams.resolveLimit(limit, size, 20, 100));
        query.setSearch(search);
        query.setSortBy(sortBy);
        query.setSortDirection(sortDirection);

        Page<PublicArmorSetListDTO> armorSetPage = publicArmorSetService.getPublicArmorSets(query);
        ApiResponse<List<PublicArmorSetListDTO>> response = ApiResponse.success(armorSetPage.getRecords());
        response.setPagination(new Pagination(
            armorSetPage.getTotal(),
            (int) armorSetPage.getCurrent(),
            (int) armorSetPage.getSize()
        ));
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get public armor set detail")
    public ResponseEntity<ApiResponse<PublicArmorSetListDTO>> getPublicArmorSetDetail(@PathVariable Long id) {
        PublicArmorSetListDTO armorSet = publicArmorSetService.getPublicArmorSetById(id);
        if (armorSet == null) {
            return ResponseEntity.ok(ApiResponse.success(null));
        }
        return ResponseEntity.ok(ApiResponse.success(armorSet));
    }
}

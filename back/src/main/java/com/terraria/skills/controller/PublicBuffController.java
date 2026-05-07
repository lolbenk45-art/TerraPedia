package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.dto.PublicBuffListDTO;
import com.terraria.skills.dto.PublicBuffQuery;
import com.terraria.skills.service.PublicBuffService;
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
@RequestMapping("/public/buffs")
@RequiredArgsConstructor
@Tag(name = "Public Buffs", description = "Public buff list APIs")
public class PublicBuffController {

    private final PublicBuffService publicBuffService;

    @GetMapping
    @Operation(summary = "Get public buff list")
    public ResponseEntity<ApiResponse<List<PublicBuffListDTO>>> getPublicBuffs(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) String sortBy,
        @RequestParam(required = false) String sortDirection
    ) {
        PublicBuffQuery query = new PublicBuffQuery();
        query.setPage(PaginationParams.resolvePage(page));
        query.setLimit(PaginationParams.resolveLimit(limit, size, 20, 100));
        query.setSearch(search);
        query.setSortBy(sortBy);
        query.setSortDirection(sortDirection);

        Page<PublicBuffListDTO> buffPage = publicBuffService.getPublicBuffs(query);
        ApiResponse<List<PublicBuffListDTO>> response = ApiResponse.success(buffPage.getRecords());
        response.setPagination(new Pagination(
            buffPage.getTotal(),
            (int) buffPage.getCurrent(),
            (int) buffPage.getSize()
        ));
        return ResponseEntity.ok(response);
    }
}

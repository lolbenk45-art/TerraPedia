package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.dto.PublicBossDetailDTO;
import com.terraria.skills.dto.PublicBossListDTO;
import com.terraria.skills.dto.PublicBossQuery;
import com.terraria.skills.service.PublicBossService;
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

import java.util.List;

@RestController
@RequestMapping("/public/bosses")
@RequiredArgsConstructor
@Tag(name = "Public Bosses", description = "Public boss archive APIs")
public class PublicBossController {

    private final PublicBossService publicBossService;

    @GetMapping
    @Operation(summary = "Get public boss list")
    public ResponseEntity<ApiResponse<List<PublicBossListDTO>>> getPublicBosses(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) String bossType,
        @RequestParam(required = false) String sortBy,
        @RequestParam(required = false) String sortDirection
    ) {
        PublicBossQuery query = new PublicBossQuery();
        query.setPage(PaginationParams.resolvePage(page));
        query.setLimit(PaginationParams.resolveLimit(limit, size, 20, 100));
        query.setSearch(search);
        query.setBossType(bossType);
        query.setSortBy(sortBy);
        query.setSortDirection(sortDirection);

        Page<PublicBossListDTO> bossPage = publicBossService.getPublicBosses(query);
        ApiResponse<List<PublicBossListDTO>> response = ApiResponse.success(bossPage.getRecords());
        response.setPagination(new Pagination(
            bossPage.getTotal(),
            (int) bossPage.getCurrent(),
            (int) bossPage.getSize()
        ));
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get public boss detail")
    public ResponseEntity<ApiResponse<PublicBossDetailDTO>> getPublicBossById(@PathVariable Long id) {
        PublicBossDetailDTO boss = publicBossService.getPublicBossById(id);
        if (boss == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error(404, "Boss not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(boss));
    }
}

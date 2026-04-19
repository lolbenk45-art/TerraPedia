package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.dto.NpcListItemDTO;
import com.terraria.skills.dto.PublicNpcQuery;
import com.terraria.skills.service.PublicNpcService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Slf4j
@RestController
@RequestMapping("/npcs")
@RequiredArgsConstructor
@Tag(name = "Public NPCs", description = "Public NPC list APIs")
public class NpcController {

    private final PublicNpcService publicNpcService;

    @GetMapping
    @Operation(summary = "Get public NPCs")
    public ResponseEntity<ApiResponse<List<NpcListItemDTO>>> getNpcs(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) Long categoryId,
        @RequestParam(required = false) Boolean isTownNpc
    ) {
        PublicNpcQuery query = new PublicNpcQuery();
        query.setPage(PaginationParams.resolvePage(page));
        query.setLimit(PaginationParams.resolveLimit(limit, null, 20));
        query.setSearch(search);
        query.setCategoryId(categoryId);
        query.setIsTownNpc(isTownNpc);

        log.info(
            "get public npcs page={}, limit={}, search={}, categoryId={}, isTownNpc={}",
            query.getPage(),
            query.getLimit(),
            search,
            categoryId,
            isTownNpc
        );

        Page<NpcListItemDTO> npcPage = publicNpcService.getNpcs(query);
        ApiResponse<List<NpcListItemDTO>> response = ApiResponse.success(npcPage.getRecords());
        response.setPagination(new Pagination(
            npcPage.getTotal(),
            (int) npcPage.getCurrent(),
            (int) npcPage.getSize()
        ));
        return ResponseEntity.ok(response);
    }
}

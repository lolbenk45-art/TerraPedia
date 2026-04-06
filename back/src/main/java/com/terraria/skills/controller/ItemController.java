package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.PageQuery;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.dto.ItemDTO;
import com.terraria.skills.service.ItemService;
import com.terraria.skills.vo.ItemVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@RestController
@RequestMapping("/items")
@RequiredArgsConstructor
@Tag(name = "Items", description = "物品查询与管理接口")
public class ItemController {

    private final ItemService itemService;

    @GetMapping
    @Operation(summary = "分页查询物品", description = "支持关键词、分类、稀有度和排序参数")
    public ResponseEntity<ApiResponse<List<ItemVO>>> getItems(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) Long categoryId,
        @RequestParam(required = false) String rarity,
        @RequestParam(required = false) Long gamePeriodId,
        @RequestParam(required = false) String sortBy,
        @RequestParam(required = false) String sortDirection
    ) {
        int resolvedPage = PaginationParams.resolvePage(page);
        int resolvedLimit = PaginationParams.resolveLimit(limit, size, 20);
        log.info(
            "get items page={}, limit={}, size={}, resolvedLimit={}, search={}, categoryId={}, rarity={}, gamePeriodId={}, sortBy={}, sortDirection={}",
            resolvedPage,
            limit,
            size,
            resolvedLimit,
            search,
            categoryId,
            rarity,
            gamePeriodId,
            sortBy,
            sortDirection
        );

        PageQuery pageQuery = new PageQuery();
        pageQuery.setPage(resolvedPage);
        pageQuery.setLimit(resolvedLimit);
        pageQuery.setSearch(search);
        pageQuery.setCategoryId(categoryId);
        pageQuery.setRarity(rarity);
        pageQuery.setGamePeriodId(gamePeriodId);
        pageQuery.setSortBy(sortBy);
        pageQuery.setSortDirection(sortDirection);

        Page<ItemDTO> itemPage = itemService.getItems(pageQuery);
        List<ItemVO> voList = itemPage.getRecords().stream()
            .map(this::toItemVO)
            .collect(Collectors.toList());

        Pagination pagination = new Pagination(
            itemPage.getTotal(),
            (int) itemPage.getCurrent(),
            (int) itemPage.getSize()
        );

        ApiResponse<List<ItemVO>> response = ApiResponse.success(voList);
        response.setPagination(pagination);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/suggestions")
    @Operation(summary = "搜索联想", description = "按关键词返回轻量级物品联想结果")
    public ResponseEntity<ApiResponse<List<ItemVO>>> getItemSuggestions(
        @RequestParam String keyword,
        @RequestParam(defaultValue = "8") int limit
    ) {
        log.info("get item suggestions keyword={}, limit={}", keyword, limit);
        List<ItemVO> suggestions = itemService.searchSuggestions(keyword, limit).stream()
            .map(this::toItemVO)
            .collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(suggestions));
    }

    @GetMapping("/{id}")
    @Operation(summary = "查询物品详情")
    public ResponseEntity<ApiResponse<ItemVO>> getItemById(@PathVariable Long id) {
        log.info("get item detail id={}", id);
        ItemDTO dto = itemService.getItemById(id);
        if (dto == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error(404, "Item not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(toItemVO(dto)));
    }

    @PostMapping
    @Operation(summary = "新增物品")
    @SecurityRequirement(name = "bearerAuth")
    public ResponseEntity<ApiResponse<ItemVO>> createItem(@RequestBody ItemDTO itemDTO) {
        log.info("create item: {}", itemDTO);
        try {
            ItemDTO created = itemService.createItem(itemDTO);
            return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(toItemVO(created), "Item created"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(400, e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    @Operation(summary = "更新物品")
    @SecurityRequirement(name = "bearerAuth")
    public ResponseEntity<ApiResponse<ItemVO>> updateItem(@PathVariable Long id, @RequestBody ItemDTO itemDTO) {
        log.info("update item id={}, data={}", id, itemDTO);
        try {
            ItemDTO updated = itemService.updateItem(id, itemDTO);
            if (updated == null) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.error(404, "Item not found"));
            }
            return ResponseEntity.ok(ApiResponse.success(toItemVO(updated), "Item updated"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(400, e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除物品")
    @SecurityRequirement(name = "bearerAuth")
    public ResponseEntity<ApiResponse<Void>> deleteItem(@PathVariable Long id) {
        log.info("delete item id={}", id);
        itemService.deleteItem(id);
        return ResponseEntity.ok(ApiResponse.success(null, "Item deleted"));
    }

    private ItemVO toItemVO(ItemDTO dto) {
        ItemVO vo = new ItemVO();
        BeanUtils.copyProperties(dto, vo);

        // Keep compatibility for existing front-end fields.
        if (vo.getImageUrl() == null) {
            vo.setImageUrl(vo.getImage());
        }
        if (vo.getCategory() == null) {
            vo.setCategory(vo.getCategoryName());
        }
        if (vo.getRare() == null) {
            vo.setRare(vo.getRarity());
        }
        return vo;
    }
}

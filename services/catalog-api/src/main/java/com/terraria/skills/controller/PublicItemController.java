package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.PageQuery;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.dto.PublicItemDetailDTO;
import com.terraria.skills.dto.PublicItemListDTO;
import com.terraria.skills.dto.PublicItemSuggestionDTO;
import com.terraria.skills.service.PublicItemService;
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

import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/public/items")
@RequiredArgsConstructor
@Tag(name = "Public Items", description = "Lightweight public item list APIs")
public class PublicItemController {

    private final PublicItemService publicItemService;

    @GetMapping
    @Operation(summary = "Get lightweight public item list")
    public ResponseEntity<ApiResponse<List<PublicItemListDTO>>> getPublicItems(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) Long categoryId,
        @RequestParam(required = false) List<String> categoryIds,
        @RequestParam(required = false) String rarity,
        @RequestParam(required = false) Long gamePeriodId,
        @RequestParam(required = false) String sortBy,
        @RequestParam(required = false) String sortDirection
    ) {
        PageQuery pageQuery = new PageQuery();
        pageQuery.setPage(PaginationParams.resolvePage(page));
        pageQuery.setLimit(PaginationParams.resolveLimit(limit, size, 100, 100));
        pageQuery.setSearch(search);
        pageQuery.setCategoryId(categoryId);
        pageQuery.setCategoryIds(parseCategoryIds(categoryIds));
        pageQuery.setRarity(rarity);
        pageQuery.setGamePeriodId(gamePeriodId);
        pageQuery.setSortBy(sortBy);
        pageQuery.setSortDirection(sortDirection);

        Page<PublicItemListDTO> itemPage = publicItemService.getPublicItems(pageQuery);
        ApiResponse<List<PublicItemListDTO>> response = ApiResponse.success(itemPage.getRecords());
        response.setPagination(new Pagination(
            itemPage.getTotal(),
            (int) itemPage.getCurrent(),
            (int) itemPage.getSize()
        ));
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get lightweight public item detail shell")
    public ResponseEntity<ApiResponse<PublicItemDetailDTO>> getPublicItemById(@PathVariable Long id) {
        PublicItemDetailDTO item = publicItemService.getPublicItemById(id);
        if (item == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error(404, "Item not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(item));
    }

    @GetMapping("/suggestions")
    @Operation(summary = "Get lightweight public item suggestions")
    public ResponseEntity<ApiResponse<List<PublicItemSuggestionDTO>>> getItemSuggestions(
        @RequestParam String keyword,
        @RequestParam(defaultValue = "8") int limit
    ) {
        String normalizedKeyword = keyword == null ? "" : keyword.trim();
        List<PublicItemSuggestionDTO> suggestions = publicItemService.searchSuggestions(normalizedKeyword, limit);
        return ResponseEntity.ok(ApiResponse.success(suggestions));
    }

    private List<Long> parseCategoryIds(List<String> values) {
        if (values == null || values.isEmpty()) {
            return null;
        }

        List<Long> parsed = new ArrayList<>();
        for (String value : values) {
            if (value == null || value.isBlank()) {
                continue;
            }
            for (String token : value.split(",")) {
                String trimmed = token.trim();
                if (trimmed.isEmpty()) {
                    continue;
                }
                try {
                    parsed.add(Long.parseLong(trimmed));
                } catch (NumberFormatException ignored) {
                    // Ignore malformed category ids so one bad token does not discard the whole filter.
                }
            }
        }
        return parsed.isEmpty() ? null : parsed;
    }
}

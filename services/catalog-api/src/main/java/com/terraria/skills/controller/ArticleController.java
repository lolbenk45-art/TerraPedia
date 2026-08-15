package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.dto.ArticleDTO;
import com.terraria.skills.service.ArticleService;
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
@RequestMapping("/articles")
@RequiredArgsConstructor
@Tag(name = "Articles", description = "Public article read APIs")
public class ArticleController {

    private final ArticleService articleService;

    @GetMapping
    @Operation(summary = "Get published articles")
    public ResponseEntity<ApiResponse<List<ArticleDTO>>> getArticles(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String keyword
    ) {
        int resolvedPage = PaginationParams.resolvePage(page);
        int resolvedLimit = PaginationParams.resolveLimit(limit, size, 10);
        Page<ArticleDTO> articlePage = articleService.getPublishedArticles(resolvedPage, resolvedLimit, keyword);
        ApiResponse<List<ArticleDTO>> response = ApiResponse.success(articlePage.getRecords());
        response.setPagination(new Pagination(articlePage.getTotal(), (int) articlePage.getCurrent(), (int) articlePage.getSize()));
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get published article by id")
    public ResponseEntity<ApiResponse<ArticleDTO>> getArticleById(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(articleService.getPublishedArticleById(id)));
    }

    @GetMapping("/slug/{slug}")
    @Operation(summary = "Get published article by slug")
    public ResponseEntity<ApiResponse<ArticleDTO>> getArticleBySlug(@PathVariable String slug) {
        return ResponseEntity.ok(ApiResponse.success(articleService.getPublishedArticleBySlug(slug)));
    }
}

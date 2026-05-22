package com.terraria.skills.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.entity.WorldContext;
import com.terraria.skills.mapper.WorldContextMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
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

@RestController
@RequestMapping("/admin/world-contexts")
@RequiredArgsConstructor
@Tag(name = "AdminWorldContexts", description = "Admin world context management")
@SecurityRequirement(name = "bearerAuth")
public class AdminWorldContextController {

    private final WorldContextMapper worldContextMapper;

    @GetMapping
    @Operation(summary = "Get world contexts")
    public ResponseEntity<ApiResponse<List<WorldContext>>> getWorldContexts(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) String contextType
    ) {
        int safePage = PaginationParams.resolvePage(page);
        int safeLimit = PaginationParams.resolveLimit(limit, size, 20, 200);
        LambdaQueryWrapper<WorldContext> wrapper = new LambdaQueryWrapper<WorldContext>()
            .orderByAsc(WorldContext::getContextType, WorldContext::getSortOrder, WorldContext::getId);
        if (contextType != null && !contextType.isBlank()) {
            wrapper.eq(WorldContext::getContextType, contextType.trim().toUpperCase());
        }
        if (search != null && !search.isBlank()) {
            String keyword = search.trim();
            wrapper.and(w -> w.like(WorldContext::getCode, keyword)
                .or().like(WorldContext::getNameEn, keyword)
                .or().like(WorldContext::getNameZh, keyword)
                .or().like(WorldContext::getDescription, keyword));
        }

        Page<WorldContext> mpPage = worldContextMapper.selectPage(new Page<>(safePage, safeLimit), wrapper);
        Pagination pagination = new Pagination(mpPage.getTotal(), (int) mpPage.getCurrent(), (int) mpPage.getSize());
        ApiResponse<List<WorldContext>> response = ApiResponse.success(mpPage.getRecords());
        response.setPagination(pagination);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get world context detail")
    public ResponseEntity<ApiResponse<WorldContext>> getWorldContextById(@PathVariable Long id) {
        WorldContext context = worldContextMapper.selectById(id);
        if (context == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "World context not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(context));
    }

    @PostMapping
    @Operation(summary = "Create world context")
    public ResponseEntity<ApiResponse<WorldContext>> createWorldContext(@RequestBody WorldContext request) {
        String code = trimToNull(request == null ? null : request.getCode());
        if (code == null || trimToNull(request.getNameEn()) == null || trimToNull(request.getContextType()) == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "code, nameEn and contextType are required"));
        }
        long duplicate = worldContextMapper.selectCount(new LambdaQueryWrapper<WorldContext>().eq(WorldContext::getCode, code));
        if (duplicate > 0) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "code already exists"));
        }
        WorldContext context = new WorldContext();
        applyFields(context, request, true);
        worldContextMapper.insert(context);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(worldContextMapper.selectById(context.getId()), "World context created"));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update world context")
    public ResponseEntity<ApiResponse<WorldContext>> updateWorldContext(@PathVariable Long id, @RequestBody WorldContext request) {
        WorldContext existing = worldContextMapper.selectById(id);
        if (existing == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "World context not found"));
        }
        String nextCode = trimToNull(request.getCode()) == null ? existing.getCode() : trimToNull(request.getCode());
        long duplicate = worldContextMapper.selectCount(new LambdaQueryWrapper<WorldContext>()
            .eq(WorldContext::getCode, nextCode)
            .ne(WorldContext::getId, id));
        if (duplicate > 0) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "code already exists"));
        }
        applyFields(existing, request, false);
        worldContextMapper.updateById(existing);
        return ResponseEntity.ok(ApiResponse.success(worldContextMapper.selectById(id), "World context updated"));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete world context")
    public ResponseEntity<ApiResponse<Void>> deleteWorldContext(@PathVariable Long id) {
        WorldContext existing = worldContextMapper.selectById(id);
        if (existing == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "World context not found"));
        }
        worldContextMapper.deleteById(id);
        return ResponseEntity.ok(ApiResponse.success(null, "World context deleted"));
    }

    private void applyFields(WorldContext target, WorldContext request, boolean creating) {
        if (creating || trimToNull(request.getCode()) != null) {
            target.setCode(trimToNull(request.getCode()));
        }
        if (creating || trimToNull(request.getNameEn()) != null) {
            target.setNameEn(trimToNull(request.getNameEn()));
        }
        if (request.getNameZh() != null || creating) {
            target.setNameZh(trimToNull(request.getNameZh()));
        }
        if (creating || trimToNull(request.getContextType()) != null) {
            target.setContextType(trimToNull(request.getContextType()) == null ? null : trimToNull(request.getContextType()).toUpperCase());
        }
        if (request.getDescription() != null || creating) {
            target.setDescription(trimToNull(request.getDescription()));
        }
        if (request.getIconUrl() != null || creating) {
            target.setIconUrl(trimToNull(request.getIconUrl()));
        }
        if (request.getSourceProvider() != null || creating) {
            target.setSourceProvider(trimToNull(request.getSourceProvider()));
        }
        if (request.getSourcePage() != null || creating) {
            target.setSourcePage(trimToNull(request.getSourcePage()));
        }
        if (request.getSourceRevisionTimestamp() != null || creating) {
            target.setSourceRevisionTimestamp(request.getSourceRevisionTimestamp());
        }
        if (request.getLastSyncedAt() != null || creating) {
            target.setLastSyncedAt(request.getLastSyncedAt());
        }
        if (request.getRawJson() != null || creating) {
            target.setRawJson(trimToNull(request.getRawJson()));
        }
        if (request.getSortOrder() != null || creating) {
            target.setSortOrder(request.getSortOrder() == null ? 0 : request.getSortOrder());
        }
        if (request.getStatus() != null || creating) {
            target.setStatus(request.getStatus() == null ? 1 : request.getStatus());
        }
        if (creating) {
            target.setDeleted(0);
        }
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}

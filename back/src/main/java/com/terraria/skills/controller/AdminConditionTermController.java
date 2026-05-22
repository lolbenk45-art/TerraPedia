package com.terraria.skills.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.entity.ConditionTerm;
import com.terraria.skills.mapper.ConditionTermMapper;
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
@RequestMapping("/admin/condition-terms")
@RequiredArgsConstructor
@Tag(name = "AdminConditionTerms", description = "Admin local condition term management")
@SecurityRequirement(name = "bearerAuth")
public class AdminConditionTermController {

    private final ConditionTermMapper conditionTermMapper;

    @GetMapping
    @Operation(summary = "Get condition terms")
    public ResponseEntity<ApiResponse<List<ConditionTerm>>> getConditionTerms(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) String termType
    ) {
        int safePage = PaginationParams.resolvePage(page);
        int safeLimit = PaginationParams.resolveLimit(limit, size, 20, 200);
        LambdaQueryWrapper<ConditionTerm> wrapper = new LambdaQueryWrapper<ConditionTerm>()
            .orderByAsc(ConditionTerm::getTermType, ConditionTerm::getSortOrder, ConditionTerm::getId);
        if (termType != null && !termType.isBlank()) {
            wrapper.eq(ConditionTerm::getTermType, termType.trim().toUpperCase());
        }
        if (search != null && !search.isBlank()) {
            String keyword = search.trim();
            wrapper.and(w -> w.like(ConditionTerm::getCode, keyword)
                .or().like(ConditionTerm::getNameEn, keyword)
                .or().like(ConditionTerm::getNameZh, keyword)
                .or().like(ConditionTerm::getDescription, keyword));
        }

        Page<ConditionTerm> mpPage = conditionTermMapper.selectPage(new Page<>(safePage, safeLimit), wrapper);
        Pagination pagination = new Pagination(mpPage.getTotal(), (int) mpPage.getCurrent(), (int) mpPage.getSize());
        ApiResponse<List<ConditionTerm>> response = ApiResponse.success(mpPage.getRecords());
        response.setPagination(pagination);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get condition term detail")
    public ResponseEntity<ApiResponse<ConditionTerm>> getConditionTermById(@PathVariable Long id) {
        ConditionTerm term = conditionTermMapper.selectById(id);
        if (term == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Condition term not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(term));
    }

    @PostMapping
    @Operation(summary = "Create condition term")
    public ResponseEntity<ApiResponse<ConditionTerm>> createConditionTerm(@RequestBody ConditionTerm request) {
        String code = normalizeCode(request == null ? null : request.getCode());
        if (code == null || trimToNull(request.getNameEn()) == null || normalizeCode(request.getTermType()) == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "code, nameEn and termType are required"));
        }
        long duplicate = conditionTermMapper.selectCount(new LambdaQueryWrapper<ConditionTerm>().eq(ConditionTerm::getCode, code));
        if (duplicate > 0) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "code already exists"));
        }
        ConditionTerm term = new ConditionTerm();
        applyFields(term, request, true);
        conditionTermMapper.insert(term);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(conditionTermMapper.selectById(term.getId()), "Condition term created"));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update condition term")
    public ResponseEntity<ApiResponse<ConditionTerm>> updateConditionTerm(@PathVariable Long id, @RequestBody ConditionTerm request) {
        ConditionTerm existing = conditionTermMapper.selectById(id);
        if (existing == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Condition term not found"));
        }
        String nextCode = normalizeCode(request.getCode()) == null ? existing.getCode() : normalizeCode(request.getCode());
        long duplicate = conditionTermMapper.selectCount(new LambdaQueryWrapper<ConditionTerm>()
            .eq(ConditionTerm::getCode, nextCode)
            .ne(ConditionTerm::getId, id));
        if (duplicate > 0) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "code already exists"));
        }
        applyFields(existing, request, false);
        conditionTermMapper.updateById(existing);
        return ResponseEntity.ok(ApiResponse.success(conditionTermMapper.selectById(id), "Condition term updated"));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete condition term")
    public ResponseEntity<ApiResponse<Void>> deleteConditionTerm(@PathVariable Long id) {
        ConditionTerm existing = conditionTermMapper.selectById(id);
        if (existing == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Condition term not found"));
        }
        conditionTermMapper.deleteById(id);
        return ResponseEntity.ok(ApiResponse.success(null, "Condition term deleted"));
    }

    private void applyFields(ConditionTerm target, ConditionTerm request, boolean creating) {
        if (creating || normalizeCode(request.getCode()) != null) {
            target.setCode(normalizeCode(request.getCode()));
        }
        if (creating || trimToNull(request.getNameEn()) != null) {
            target.setNameEn(trimToNull(request.getNameEn()));
        }
        if (request.getNameZh() != null || creating) {
            target.setNameZh(trimToNull(request.getNameZh()));
        }
        if (creating || normalizeCode(request.getTermType()) != null) {
            target.setTermType(normalizeCode(request.getTermType()));
        }
        if (request.getDescription() != null || creating) {
            target.setDescription(trimToNull(request.getDescription()));
        }
        if (request.getSourceProvider() != null || creating) {
            target.setSourceProvider(trimToNull(request.getSourceProvider()));
        }
        if (request.getSourcePage() != null || creating) {
            target.setSourcePage(trimToNull(request.getSourcePage()));
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

    private String normalizeCode(String value) {
        String text = trimToNull(value);
        return text == null ? null : text.toUpperCase();
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}

package com.terraria.skills.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.AdminRecipeConditionUpsertRequestDTO;
import com.terraria.skills.dto.RecipeConditionDTO;
import com.terraria.skills.entity.Biome;
import com.terraria.skills.entity.ConditionTerm;
import com.terraria.skills.entity.Recipe;
import com.terraria.skills.entity.RecipeContextRequirement;
import com.terraria.skills.entity.WorldContext;
import com.terraria.skills.mapper.BiomeMapper;
import com.terraria.skills.mapper.ConditionTermMapper;
import com.terraria.skills.mapper.RecipeContextRequirementMapper;
import com.terraria.skills.mapper.RecipeMapper;
import com.terraria.skills.mapper.WorldContextMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/admin/recipes")
@RequiredArgsConstructor
@Tag(name = "AdminRecipeConditions", description = "Admin recipe condition management")
@SecurityRequirement(name = "bearerAuth")
public class AdminRecipeConditionController {

    private final RecipeMapper recipeMapper;
    private final RecipeContextRequirementMapper recipeContextRequirementMapper;
    private final BiomeMapper biomeMapper;
    private final WorldContextMapper worldContextMapper;
    private final ConditionTermMapper conditionTermMapper;

    @GetMapping("/{id}/conditions")
    @Operation(summary = "Get recipe conditions")
    public ResponseEntity<ApiResponse<List<RecipeConditionDTO>>> getRecipeConditions(@PathVariable("id") Long recipeId) {
        Recipe recipe = recipeMapper.selectById(recipeId);
        if (recipe == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Recipe not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(loadConditions(recipeId)));
    }

    @PutMapping("/{id}/conditions")
    @Transactional
    @Operation(summary = "Replace recipe conditions")
    public ResponseEntity<ApiResponse<List<RecipeConditionDTO>>> replaceRecipeConditions(
        @PathVariable("id") Long recipeId,
        @RequestBody(required = false) List<AdminRecipeConditionUpsertRequestDTO> request
    ) {
        Recipe recipe = recipeMapper.selectById(recipeId);
        if (recipe == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Recipe not found"));
        }
        recipeContextRequirementMapper.delete(new LambdaQueryWrapper<RecipeContextRequirement>().eq(RecipeContextRequirement::getRecipeId, recipeId));
        List<AdminRecipeConditionUpsertRequestDTO> safeRequest = request == null ? List.of() : request;
        for (int index = 0; index < safeRequest.size(); index += 1) {
            AdminRecipeConditionUpsertRequestDTO item = safeRequest.get(index);
            String refType = normalizeRefType(item == null ? null : item.getRefType());
            if (refType == null || item == null || item.getRefId() == null || item.getRefId() <= 0) {
                continue;
            }
            RecipeContextRequirement condition = new RecipeContextRequirement();
            condition.setRecipeId(recipeId);
            condition.setRefType(refType);
            condition.setRefId(item.getRefId());
            condition.setRequirementRole(defaultIfBlank(item.getRequirementRole(), "required"));
            condition.setNotes(trimToNull(item.getNotes()));
            condition.setSortOrder(item.getSortOrder() == null ? index + 1 : item.getSortOrder());
            recipeContextRequirementMapper.insert(condition);
        }
        return ResponseEntity.ok(ApiResponse.success(loadConditions(recipeId), "Recipe conditions updated"));
    }

    private List<RecipeConditionDTO> loadConditions(Long recipeId) {
        List<RecipeContextRequirement> records = recipeContextRequirementMapper.selectList(new LambdaQueryWrapper<RecipeContextRequirement>()
            .eq(RecipeContextRequirement::getRecipeId, recipeId)
            .orderByAsc(RecipeContextRequirement::getSortOrder, RecipeContextRequirement::getId));
        if (records.isEmpty()) {
            return List.of();
        }
        List<Long> biomeIds = records.stream()
            .filter(record -> "BIOME".equalsIgnoreCase(record.getRefType()))
            .map(RecipeContextRequirement::getRefId)
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        List<Long> worldContextIds = records.stream()
            .filter(record -> "WORLD_CONTEXT".equalsIgnoreCase(record.getRefType()))
            .map(RecipeContextRequirement::getRefId)
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        List<Long> conditionTermIds = records.stream()
            .filter(record -> "CONDITION_TERM".equalsIgnoreCase(record.getRefType()))
            .map(RecipeContextRequirement::getRefId)
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        Map<Long, Biome> biomeById = biomeIds.isEmpty()
            ? Collections.emptyMap()
            : biomeMapper.selectBatchIds(biomeIds).stream().collect(Collectors.toMap(Biome::getId, Function.identity()));
        Map<Long, WorldContext> contextById = worldContextIds.isEmpty()
            ? Collections.emptyMap()
            : worldContextMapper.selectBatchIds(worldContextIds).stream().collect(Collectors.toMap(WorldContext::getId, Function.identity()));
        Map<Long, ConditionTerm> termById = conditionTermIds.isEmpty()
            ? Collections.emptyMap()
            : conditionTermMapper.selectBatchIds(conditionTermIds).stream().collect(Collectors.toMap(ConditionTerm::getId, Function.identity()));

        return records.stream().map(record -> {
            RecipeConditionDTO dto = new RecipeConditionDTO();
            BeanUtils.copyProperties(record, dto);
            Biome biome = biomeById.get(record.getRefId());
            WorldContext context = contextById.get(record.getRefId());
            ConditionTerm term = termById.get(record.getRefId());
            if (biome != null) {
                dto.setRefCode(biome.getCode());
                dto.setRefNameEn(biome.getNameEn());
                dto.setRefNameZh(biome.getNameZh());
                dto.setRefContextType("BIOME");
            } else if (context != null) {
                dto.setRefCode(context.getCode());
                dto.setRefNameEn(context.getNameEn());
                dto.setRefNameZh(context.getNameZh());
                dto.setRefContextType(context.getContextType());
            } else if (term != null) {
                dto.setRefCode(term.getCode());
                dto.setRefNameEn(term.getNameEn());
                dto.setRefNameZh(term.getNameZh());
                dto.setRefContextType(term.getTermType());
            }
            return dto;
        }).toList();
    }

    private String normalizeRefType(String rawType) {
        String type = trimToNull(rawType);
        if (type == null) {
            return null;
        }
        String normalized = type.toUpperCase();
        return switch (normalized) {
            case "BIOME" -> "BIOME";
            case "WORLD_CONTEXT", "CONTEXT", "ENVIRONMENT", "MOON_PHASE" -> "WORLD_CONTEXT";
            case "CONDITION_TERM", "LOCAL_CONDITION" -> "CONDITION_TERM";
            default -> null;
        };
    }

    private String defaultIfBlank(String value, String fallback) {
        String trimmed = trimToNull(value);
        return trimmed == null ? fallback : trimmed;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}

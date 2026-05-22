package com.terraria.skills.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.dto.AdminBiomeRelationUpsertRequestDTO;
import com.terraria.skills.dto.AdminBiomeResourceUpsertRequestDTO;
import com.terraria.skills.dto.AdminBiomeUpsertRequestDTO;
import com.terraria.skills.dto.BiomeDTO;
import com.terraria.skills.dto.BiomeRelationDTO;
import com.terraria.skills.dto.BiomeResourceDTO;
import com.terraria.skills.entity.Biome;
import com.terraria.skills.entity.BiomeRelation;
import com.terraria.skills.entity.BiomeResource;
import com.terraria.skills.entity.Item;
import com.terraria.skills.mapper.BiomeMapper;
import com.terraria.skills.mapper.BiomeRelationMapper;
import com.terraria.skills.mapper.BiomeResourceMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.ManagedItemImageResolver;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
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
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/admin/biomes")
@RequiredArgsConstructor
@Tag(name = "AdminBiomes", description = "Admin biome management")
@SecurityRequirement(name = "bearerAuth")
public class AdminBiomeController {

    private final BiomeMapper biomeMapper;
    private final BiomeRelationMapper biomeRelationMapper;
    private final BiomeResourceMapper biomeResourceMapper;
    private final ItemMapper itemMapper;
    private final ManagedItemImageResolver managedItemImageResolver;

    @GetMapping
    @Operation(summary = "Get biomes")
    public ResponseEntity<ApiResponse<List<Biome>>> getBiomes(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) String group,
        @RequestParam(required = false) String wikiGroupCode
    ) {
        int safePage = PaginationParams.resolvePage(page);
        int safeLimit = PaginationParams.resolveLimit(limit, size, 20, 100);
        LambdaQueryWrapper<Biome> wrapper = new LambdaQueryWrapper<Biome>()
            .orderByAsc(Biome::getWikiSortOrder)
            .orderByAsc(Biome::getId);
        String normalizedGroup = normalizeBiomeGroup(group);
        if (normalizedGroup != null) {
            wrapper.eq(Biome::getLayerType, normalizedGroup);
        }
        String normalizedWikiGroupCode = normalizeText(wikiGroupCode);
        if (normalizedWikiGroupCode != null) {
            wrapper.and(w -> w.eq(Biome::getWikiGroupCode, normalizedWikiGroupCode)
                .or().eq(Biome::getWikiParentGroupCode, normalizedWikiGroupCode));
        }
        if (search != null && !search.isBlank()) {
            String keyword = search.trim();
            wrapper.and(w -> w.like(Biome::getCode, keyword)
                .or().like(Biome::getNameEn, keyword)
                .or().like(Biome::getNameZh, keyword)
                .or().like(Biome::getAliasEn, keyword)
                .or().like(Biome::getAliasZh, keyword));
        }
        Page<Biome> mpPage = biomeMapper.selectPage(new Page<>(safePage, safeLimit), wrapper);
        Pagination pagination = new Pagination(mpPage.getTotal(), (int) mpPage.getCurrent(), (int) mpPage.getSize());
        ApiResponse<List<Biome>> response = ApiResponse.success(mpPage.getRecords());
        response.setPagination(pagination);
        return ResponseEntity.ok(response);
    }

    private String normalizeBiomeGroup(String value) {
        if (value == null || value.isBlank() || "all".equalsIgnoreCase(value.trim())) {
            return null;
        }
        String normalized = value.trim().toLowerCase();
        return switch (normalized) {
            case "space",
                 "surface",
                 "surface_hardmode",
                 "cavern",
                 "cavern_hardmode",
                 "underworld",
                 "mini_biome",
                 "micro_biome",
                 "treasure_room" -> normalized;
            default -> null;
        };
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get biome detail")
    public ResponseEntity<ApiResponse<BiomeDTO>> getBiomeById(@PathVariable Long id) {
        Biome biome = biomeMapper.selectById(id);
        if (biome == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Biome not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(toDetailDto(biome)));
    }

    @PostMapping
    @Operation(summary = "Create biome")
    @Transactional
    public ResponseEntity<ApiResponse<BiomeDTO>> createBiome(@RequestBody AdminBiomeUpsertRequestDTO request) {
        if (request == null || request.getCode() == null || request.getCode().isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "code is required"));
        }
        Long duplicate = biomeMapper.selectCount(new LambdaQueryWrapper<Biome>().eq(Biome::getCode, request.getCode().trim()));
        if (duplicate != null && duplicate > 0) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "code already exists"));
        }
        Biome biome = new Biome();
        applyBiomeFields(biome, request, true);
        biomeMapper.insert(biome);
        replaceRelationsAndResources(biome.getId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(toDetailDto(biomeMapper.selectById(biome.getId())), "Biome created"));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update biome")
    @Transactional
    public ResponseEntity<ApiResponse<BiomeDTO>> updateBiome(@PathVariable Long id, @RequestBody AdminBiomeUpsertRequestDTO request) {
        Biome existing = biomeMapper.selectById(id);
        if (existing == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Biome not found"));
        }
        if (request.getCode() != null && !request.getCode().isBlank()) {
            String code = request.getCode().trim();
            Long duplicate = biomeMapper.selectCount(
                new LambdaQueryWrapper<Biome>()
                    .eq(Biome::getCode, code)
                    .ne(Biome::getId, id)
            );
            if (duplicate != null && duplicate > 0) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "code already exists"));
            }
        }
        applyBiomeFields(existing, request, false);
        biomeMapper.updateById(existing);
        replaceRelationsAndResources(id, request);
        return ResponseEntity.ok(ApiResponse.success(toDetailDto(biomeMapper.selectById(id)), "Biome updated"));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete biome")
    public ResponseEntity<ApiResponse<Void>> deleteBiome(@PathVariable Long id) {
        Biome existing = biomeMapper.selectById(id);
        if (existing == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Biome not found"));
        }
        biomeRelationMapper.delete(new LambdaQueryWrapper<BiomeRelation>().eq(BiomeRelation::getBiomeId, id));
        biomeResourceMapper.delete(new LambdaQueryWrapper<BiomeResource>().eq(BiomeResource::getBiomeId, id));
        biomeMapper.deleteById(id);
        return ResponseEntity.ok(ApiResponse.success(null, "Biome deleted"));
    }

    private void applyBiomeFields(Biome biome, AdminBiomeUpsertRequestDTO request, boolean creating) {
        if (creating) {
            biome.setCode(request.getCode().trim());
            biome.setStatus(request.getStatus() == null ? 1 : request.getStatus());
        } else if (request.getCode() != null && !request.getCode().isBlank()) {
            biome.setCode(request.getCode().trim());
        }
        if (request.getNameEn() != null) biome.setNameEn(request.getNameEn());
        if (request.getNameZh() != null) biome.setNameZh(request.getNameZh());
        if (request.getAliasEn() != null) biome.setAliasEn(request.getAliasEn());
        if (request.getAliasZh() != null) biome.setAliasZh(request.getAliasZh());
        if (request.getLayerType() != null) biome.setLayerType(request.getLayerType());
        if (request.getBiomeType() != null) biome.setBiomeType(request.getBiomeType());
        if (request.getWikiGroupCode() != null) biome.setWikiGroupCode(trimToNull(request.getWikiGroupCode()));
        if (request.getWikiGroupNameEn() != null) biome.setWikiGroupNameEn(trimToNull(request.getWikiGroupNameEn()));
        if (request.getWikiGroupNameZh() != null) biome.setWikiGroupNameZh(trimToNull(request.getWikiGroupNameZh()));
        if (request.getWikiParentGroupCode() != null) biome.setWikiParentGroupCode(trimToNull(request.getWikiParentGroupCode()));
        if (request.getWikiParentGroupNameEn() != null) biome.setWikiParentGroupNameEn(trimToNull(request.getWikiParentGroupNameEn()));
        if (request.getWikiParentGroupNameZh() != null) biome.setWikiParentGroupNameZh(trimToNull(request.getWikiParentGroupNameZh()));
        if (request.getWikiSectionLevel() != null) biome.setWikiSectionLevel(request.getWikiSectionLevel());
        if (request.getWikiSortOrder() != null) biome.setWikiSortOrder(request.getWikiSortOrder());
        if (request.getWikiSectionAnchor() != null) biome.setWikiSectionAnchor(trimToNull(request.getWikiSectionAnchor()));
        if (request.getDescription() != null) biome.setDescription(request.getDescription());
        if (request.getIconUrl() != null) biome.setIconUrl(request.getIconUrl());
        if (request.getSourceProvider() != null) biome.setSourceProvider(request.getSourceProvider());
        if (request.getSourcePage() != null) biome.setSourcePage(request.getSourcePage());
        if (request.getSourceRevisionTimestamp() != null) biome.setSourceRevisionTimestamp(request.getSourceRevisionTimestamp());
        if (request.getLastSyncedAt() != null) biome.setLastSyncedAt(request.getLastSyncedAt());
        if (request.getStatus() != null) biome.setStatus(request.getStatus());
    }

    private String normalizeText(String value) {
        if (value == null || value.isBlank() || "all".equalsIgnoreCase(value.trim())) {
            return null;
        }
        return value.trim().toLowerCase();
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private void replaceRelationsAndResources(Long biomeId, AdminBiomeUpsertRequestDTO request) {
        biomeRelationMapper.delete(new LambdaQueryWrapper<BiomeRelation>().eq(BiomeRelation::getBiomeId, biomeId));
        biomeResourceMapper.delete(new LambdaQueryWrapper<BiomeResource>().eq(BiomeResource::getBiomeId, biomeId));

        List<AdminBiomeRelationUpsertRequestDTO> relations = request.getRelations() == null ? Collections.emptyList() : request.getRelations();
        for (int index = 0; index < relations.size(); index += 1) {
            AdminBiomeRelationUpsertRequestDTO relationRequest = relations.get(index);
            if (relationRequest == null || relationRequest.getRelatedBiomeId() == null || relationRequest.getRelationType() == null || relationRequest.getRelationType().isBlank()) {
                continue;
            }
            BiomeRelation relation = new BiomeRelation();
            relation.setBiomeId(biomeId);
            relation.setRelatedBiomeId(relationRequest.getRelatedBiomeId());
            relation.setRelationType(relationRequest.getRelationType().trim());
            relation.setNotes(relationRequest.getNotes());
            biomeRelationMapper.insert(relation);
        }

        List<AdminBiomeResourceUpsertRequestDTO> resources = request.getResources() == null ? Collections.emptyList() : request.getResources();
        for (int index = 0; index < resources.size(); index += 1) {
            AdminBiomeResourceUpsertRequestDTO resourceRequest = resources.get(index);
            if (resourceRequest == null) {
                continue;
            }
            boolean hasItemId = resourceRequest.getItemId() != null;
            boolean hasRawName = resourceRequest.getResourceNameRaw() != null && !resourceRequest.getResourceNameRaw().isBlank();
            if (!hasItemId && !hasRawName) {
                continue;
            }
            BiomeResource resource = new BiomeResource();
            resource.setBiomeId(biomeId);
            resource.setItemId(resourceRequest.getItemId());
            resource.setResourceNameRaw(resourceRequest.getResourceNameRaw());
            resource.setResourceType(resourceRequest.getResourceType());
            resource.setNotes(resourceRequest.getNotes());
            resource.setSortOrder(resourceRequest.getSortOrder() == null ? index : resourceRequest.getSortOrder());
            biomeResourceMapper.insert(resource);
        }
    }

    private BiomeDTO toDetailDto(Biome biome) {
        BiomeDTO dto = new BiomeDTO();
        BeanUtils.copyProperties(biome, dto);

        List<BiomeRelation> relations = biomeRelationMapper.selectList(new LambdaQueryWrapper<BiomeRelation>()
            .eq(BiomeRelation::getBiomeId, biome.getId())
            .orderByAsc(BiomeRelation::getId));
        List<BiomeResource> resources = biomeResourceMapper.selectList(new LambdaQueryWrapper<BiomeResource>()
            .eq(BiomeResource::getBiomeId, biome.getId())
            .orderByAsc(BiomeResource::getSortOrder, BiomeResource::getId));

        List<Long> relatedBiomeIds = relations.stream()
            .map(BiomeRelation::getRelatedBiomeId)
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        Map<Long, Biome> relatedBiomeById = relatedBiomeIds.isEmpty()
            ? Collections.emptyMap()
            : biomeMapper.selectBatchIds(relatedBiomeIds).stream().collect(Collectors.toMap(Biome::getId, Function.identity()));

        List<Long> itemIds = resources.stream()
            .map(BiomeResource::getItemId)
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        Map<Long, Item> itemById = itemIds.isEmpty()
            ? Collections.emptyMap()
            : itemMapper.selectBatchIds(itemIds).stream().collect(Collectors.toMap(Item::getId, Function.identity()));
        Map<Long, String> managedImagesByItemId = itemById.isEmpty()
            ? Collections.emptyMap()
            : managedItemImageResolver.resolveManagedImages(itemById.values());

        dto.setRelations(relations.stream().map(relation -> {
            BiomeRelationDTO relationDto = new BiomeRelationDTO();
            BeanUtils.copyProperties(relation, relationDto);
            Biome related = relatedBiomeById.get(relation.getRelatedBiomeId());
            if (related != null) {
                relationDto.setRelatedBiomeCode(related.getCode());
                relationDto.setRelatedBiomeNameEn(related.getNameEn());
                relationDto.setRelatedBiomeNameZh(related.getNameZh());
            }
            return relationDto;
        }).toList());

        dto.setResources(resources.stream().map(resource -> {
            BiomeResourceDTO resourceDto = new BiomeResourceDTO();
            BeanUtils.copyProperties(resource, resourceDto);
            Item item = itemById.get(resource.getItemId());
            if (item != null) {
                resourceDto.setItemName(item.getName());
                resourceDto.setItemInternalName(item.getInternalName());
                resourceDto.setItemImage(managedItemImageResolver.resolveManagedImage(item, managedImagesByItemId));
            }
            return resourceDto;
        }).toList());

        return dto;
    }
}

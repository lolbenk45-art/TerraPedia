package com.terraria.skills.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.dto.AdminCraftingStationDTO;
import com.terraria.skills.dto.AdminCraftingStationUsageItemDTO;
import com.terraria.skills.entity.CraftingStation;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.Recipe;
import com.terraria.skills.entity.RecipeStation;
import com.terraria.skills.mapper.CraftingStationMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.mapper.RecipeMapper;
import com.terraria.skills.mapper.RecipeStationMapper;
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

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/admin/crafting-stations")
@RequiredArgsConstructor
@Tag(name = "AdminCraftingStations", description = "Admin crafting station management")
@SecurityRequirement(name = "bearerAuth")
public class AdminCraftingStationController {

    private final CraftingStationMapper craftingStationMapper;
    private final ItemMapper itemMapper;
    private final RecipeMapper recipeMapper;
    private final RecipeStationMapper recipeStationMapper;

    @GetMapping
    @Operation(summary = "Get crafting stations")
    public ResponseEntity<ApiResponse<List<AdminCraftingStationDTO>>> getCraftingStations(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) String usageState
    ) {
        int safePage = PaginationParams.resolvePage(page);
        int safeLimit = PaginationParams.resolveLimit(limit, size, 20, 100);
        String normalizedUsageState = normalizeUsageState(usageState);

        LambdaQueryWrapper<CraftingStation> wrapper = new LambdaQueryWrapper<CraftingStation>()
            .orderByAsc(CraftingStation::getSortOrder, CraftingStation::getId);
        if (search != null && !search.isBlank()) {
            String keyword = search.trim();
            wrapper.and(w -> w.like(CraftingStation::getInternalName, keyword)
                .or().like(CraftingStation::getNameEn, keyword)
                .or().like(CraftingStation::getNameZh, keyword));
        }

        if (normalizedUsageState != null) {
            List<AdminCraftingStationDTO> allRecords = enrichStations(craftingStationMapper.selectList(wrapper)).stream()
                .filter(station -> matchesUsageState(station, normalizedUsageState))
                .toList();
            Pagination pagination = new Pagination(allRecords.size(), safePage, safeLimit);
            ApiResponse<List<AdminCraftingStationDTO>> response = ApiResponse.success(sliceStations(allRecords, safePage, safeLimit));
            response.setPagination(pagination);
            return ResponseEntity.ok(response);
        }

        Page<CraftingStation> mpPage = craftingStationMapper.selectPage(new Page<>(safePage, safeLimit), wrapper);
        Pagination pagination = new Pagination(mpPage.getTotal(), (int) mpPage.getCurrent(), (int) mpPage.getSize());
        ApiResponse<List<AdminCraftingStationDTO>> response = ApiResponse.success(enrichStations(mpPage.getRecords()));
        response.setPagination(pagination);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get crafting station detail")
    public ResponseEntity<ApiResponse<AdminCraftingStationDTO>> getCraftingStationById(@PathVariable Long id) {
        CraftingStation station = craftingStationMapper.selectById(id);
        if (station == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Crafting station not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(enrichStation(station)));
    }

    @GetMapping("/{id}/usage-items")
    @Operation(summary = "Get paged crafting station usage items")
    public ResponseEntity<ApiResponse<List<AdminCraftingStationUsageItemDTO>>> getCraftingStationUsageItems(
        @PathVariable Long id,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size
    ) {
        CraftingStation station = craftingStationMapper.selectById(id);
        if (station == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Crafting station not found"));
        }

        int safePage = PaginationParams.resolvePage(page);
        int safeLimit = PaginationParams.resolveLimit(limit, size, 20, 100);

        List<RecipeStation> relevantRecipeStations = loadRelevantRecipeStations(List.of(station));
        Map<Long, Recipe> recipeById = loadRecipesById(relevantRecipeStations.stream().map(RecipeStation::getRecipeId));
        List<AdminCraftingStationUsageItemDTO> usageItems = hydrateUsageItems(
            buildUsageItems(station, relevantRecipeStations, recipeById),
            loadItemsById(recipeById.values().stream().map(Recipe::getResultItemId).filter(Objects::nonNull).distinct().toList())
        );

        Pagination pagination = new Pagination(usageItems.size(), safePage, safeLimit);
        ApiResponse<List<AdminCraftingStationUsageItemDTO>> response = ApiResponse.success(sliceUsageItems(usageItems, safePage, safeLimit));
        response.setPagination(pagination);
        return ResponseEntity.ok(response);
    }

    @PostMapping
    @Operation(summary = "Create crafting station")
    public ResponseEntity<ApiResponse<AdminCraftingStationDTO>> createCraftingStation(@RequestBody CraftingStation request) {
        if (request == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "request body is required"));
        }
        String validationError = validateRequest(request);
        if (validationError != null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, validationError));
        }
        if (hasDuplicateStation(request, null)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "crafting station already exists"));
        }
        CraftingStation station = new CraftingStation();
        applyFields(station, request, true);
        craftingStationMapper.insert(station);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success(enrichStation(craftingStationMapper.selectById(station.getId())), "Crafting station created"));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update crafting station")
    public ResponseEntity<ApiResponse<AdminCraftingStationDTO>> updateCraftingStation(@PathVariable Long id, @RequestBody CraftingStation request) {
        CraftingStation existing = craftingStationMapper.selectById(id);
        if (existing == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Crafting station not found"));
        }
        if (request == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "request body is required"));
        }
        String validationError = validateRequest(request);
        if (validationError != null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, validationError));
        }
        if (hasDuplicateStation(request, id)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "crafting station already exists"));
        }
        applyFields(existing, request, false);
        craftingStationMapper.updateById(existing);
        return ResponseEntity.ok(ApiResponse.success(enrichStation(craftingStationMapper.selectById(id)), "Crafting station updated"));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete crafting station")
    public ResponseEntity<ApiResponse<Void>> deleteCraftingStation(@PathVariable Long id) {
        CraftingStation existing = craftingStationMapper.selectById(id);
        if (existing == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Crafting station not found"));
        }
        Long references = recipeStationMapper.selectCount(new LambdaQueryWrapper<RecipeStation>()
            .eq(RecipeStation::getStationId, id));
        if (references != null && references > 0) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(400, "crafting station is still referenced by recipes"));
        }
        int legacyReferences = loadRelevantRecipeStations(List.of(existing)).size();
        if (legacyReferences > 0) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(400, "crafting station is still referenced by recipes"));
        }
        craftingStationMapper.deleteById(id);
        return ResponseEntity.ok(ApiResponse.success(null, "Crafting station deleted"));
    }

    private void applyFields(CraftingStation target, CraftingStation request, boolean creating) {
        if (request == null) {
            return;
        }
        target.setItemId(request.getItemId());
        target.setInternalName(trimToNull(request.getInternalName()));
        target.setNameEn(trimToNull(request.getNameEn()));
        target.setNameZh(trimToNull(request.getNameZh()));
        target.setStationType(trimToNull(request.getStationType()) == null ? "crafting_station" : request.getStationType().trim());
        target.setNotes(trimToNull(request.getNotes()));
        target.setImageUrl(trimToNull(request.getImageUrl()));
        target.setSortOrder(request.getSortOrder() == null ? 0 : request.getSortOrder());
        if (creating) {
            target.setStatus(request.getStatus() == null ? 1 : request.getStatus());
            target.setDeleted(0);
        } else if (request.getStatus() != null) {
            target.setStatus(request.getStatus());
        }
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String validateRequest(CraftingStation request) {
        if (trimToNull(request.getNameEn()) == null
            && trimToNull(request.getNameZh()) == null
            && trimToNull(request.getInternalName()) == null) {
            return "at least one of nameEn, nameZh, internalName is required";
        }
        if (request.getItemId() != null && itemMapper.selectById(request.getItemId()) == null) {
            return "itemId does not reference an existing item";
        }
        return null;
    }

    private String normalizeUsageState(String usageState) {
        String value = trimToNull(usageState);
        if (value == null) {
            return null;
        }
        return switch (value.toLowerCase()) {
            case "used" -> "used";
            case "unused" -> "unused";
            default -> null;
        };
    }

    private boolean matchesUsageState(AdminCraftingStationDTO station, String usageState) {
        int usageRecipeCount = station == null || station.getUsageRecipeCount() == null ? 0 : station.getUsageRecipeCount();
        if ("used".equals(usageState)) {
            return usageRecipeCount > 0;
        }
        if ("unused".equals(usageState)) {
            return usageRecipeCount == 0;
        }
        return true;
    }

    private List<AdminCraftingStationDTO> sliceStations(List<AdminCraftingStationDTO> stations, int page, int limit) {
        if (stations == null || stations.isEmpty()) {
            return List.of();
        }
        int fromIndex = Math.max((page - 1) * limit, 0);
        if (fromIndex >= stations.size()) {
            return List.of();
        }
        int toIndex = Math.min(fromIndex + limit, stations.size());
        return stations.subList(fromIndex, toIndex);
    }

    private boolean hasDuplicateStation(CraftingStation request, Long excludeId) {
        String internalName = trimToNull(request.getInternalName());
        if (internalName != null) {
            LambdaQueryWrapper<CraftingStation> wrapper = new LambdaQueryWrapper<CraftingStation>()
                .eq(CraftingStation::getInternalName, internalName);
            if (excludeId != null) {
                wrapper.ne(CraftingStation::getId, excludeId);
            }
            Long count = craftingStationMapper.selectCount(wrapper);
            if (count != null && count > 0) {
                return true;
            }
        }

        if (request.getItemId() != null) {
            LambdaQueryWrapper<CraftingStation> wrapper = new LambdaQueryWrapper<CraftingStation>()
                .eq(CraftingStation::getItemId, request.getItemId());
            if (excludeId != null) {
                wrapper.ne(CraftingStation::getId, excludeId);
            }
            Long count = craftingStationMapper.selectCount(wrapper);
            if (count != null && count > 0) {
                return true;
            }
        }

        return false;
    }

    private List<AdminCraftingStationDTO> enrichStations(List<CraftingStation> stations) {
        if (stations == null || stations.isEmpty()) {
            return List.of();
        }

        List<RecipeStation> relevantRecipeStations = loadRelevantRecipeStations(stations);
        Map<Long, Recipe> recipeById = loadRecipesById(relevantRecipeStations.stream().map(RecipeStation::getRecipeId));
        Map<Long, StationUsageSummary> usageByStationId = buildUsageSummaryByStation(stations, relevantRecipeStations, recipeById);
        Map<Long, Item> itemById = loadItemsById(StreamUtils.concat(
            stations.stream()
                .map(CraftingStation::getItemId)
                .filter(Objects::nonNull),
            recipeById.values().stream()
                .map(Recipe::getResultItemId)
                .filter(Objects::nonNull)
        ).distinct().toList());

        return stations.stream()
            .map(station -> toDto(station, itemById, usageByStationId.get(station.getId())))
            .toList();
    }

    private AdminCraftingStationDTO enrichStation(CraftingStation station) {
        if (station == null) {
            return null;
        }

        List<RecipeStation> relevantRecipeStations = loadRelevantRecipeStations(List.of(station));
        Map<Long, Recipe> recipeById = loadRecipesById(relevantRecipeStations.stream().map(RecipeStation::getRecipeId));
        StationUsageSummary usageSummary = buildUsageSummaryByStation(List.of(station), relevantRecipeStations, recipeById).get(station.getId());
        Map<Long, Item> itemById = loadItemsById(StreamUtils.concat(
            StreamUtils.ofNullable(station.getItemId()),
            recipeById.values().stream()
                .map(Recipe::getResultItemId)
                .filter(Objects::nonNull)
        ).distinct().toList());

        return toDto(station, itemById, usageSummary);
    }

    private Map<Long, Item> loadItemsById(List<Long> itemIds) {
        if (itemIds == null || itemIds.isEmpty()) {
            return Map.of();
        }
        List<Item> items = itemMapper.selectBatchIds(itemIds);
        if (items == null || items.isEmpty()) {
            return Map.of();
        }
        return items.stream()
            .filter(Objects::nonNull)
            .collect(Collectors.toMap(Item::getId, Function.identity(), (left, right) -> left));
    }

    private List<RecipeStation> loadRelevantRecipeStations(List<CraftingStation> stations) {
        if (stations == null || stations.isEmpty()) {
            return List.of();
        }

        Map<Long, RecipeStation> deduped = new LinkedHashMap<>();
        List<Long> stationIds = stations.stream()
            .map(CraftingStation::getId)
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        List<Long> itemIds = stations.stream()
            .map(CraftingStation::getItemId)
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        List<String> internalNames = stations.stream()
            .map(CraftingStation::getInternalName)
            .map(this::trimToNull)
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        List<String> englishNames = stations.stream()
            .map(CraftingStation::getNameEn)
            .map(this::trimToNull)
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        List<String> chineseNames = stations.stream()
            .map(CraftingStation::getNameZh)
            .map(this::trimToNull)
            .filter(Objects::nonNull)
            .distinct()
            .toList();

        collectRecipeStations(deduped, stationIds.isEmpty()
            ? List.of()
            : recipeStationMapper.selectList(new LambdaQueryWrapper<RecipeStation>()
                .in(RecipeStation::getStationId, stationIds)));
        collectRecipeStations(deduped, itemIds.isEmpty()
            ? List.of()
            : recipeStationMapper.selectList(new LambdaQueryWrapper<RecipeStation>()
                .isNull(RecipeStation::getStationId)
                .in(RecipeStation::getStationItemId, itemIds)));
        collectRecipeStations(deduped, internalNames.isEmpty()
            ? List.of()
            : recipeStationMapper.selectList(new LambdaQueryWrapper<RecipeStation>()
                .isNull(RecipeStation::getStationId)
                .in(RecipeStation::getStationInternalName, internalNames)));
        collectRecipeStations(deduped, englishNames.isEmpty()
            ? List.of()
            : recipeStationMapper.selectList(new LambdaQueryWrapper<RecipeStation>()
                .isNull(RecipeStation::getStationId)
                .isNull(RecipeStation::getStationItemId)
                .isNull(RecipeStation::getStationInternalName)
                .in(RecipeStation::getStationNameRaw, englishNames)));
        collectRecipeStations(deduped, chineseNames.isEmpty()
            ? List.of()
            : recipeStationMapper.selectList(new LambdaQueryWrapper<RecipeStation>()
                .isNull(RecipeStation::getStationId)
                .isNull(RecipeStation::getStationItemId)
                .in(RecipeStation::getStationNameRaw, chineseNames)));

        return deduped.values().stream().toList();
    }

    private void collectRecipeStations(Map<Long, RecipeStation> deduped, List<RecipeStation> recipeStations) {
        if (recipeStations == null || recipeStations.isEmpty()) {
            return;
        }
        for (RecipeStation recipeStation : recipeStations) {
            if (recipeStation != null && recipeStation.getId() != null) {
                deduped.putIfAbsent(recipeStation.getId(), recipeStation);
            }
        }
    }

    private Map<Long, Recipe> loadRecipesById(java.util.stream.Stream<Long> recipeIds) {
        List<Long> ids = recipeIds
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        if (ids.isEmpty()) {
            return Map.of();
        }

        List<Recipe> recipes = recipeMapper.selectBatchIds(ids);
        if (recipes == null || recipes.isEmpty()) {
            return Map.of();
        }
        return recipes.stream()
            .filter(Objects::nonNull)
            .collect(Collectors.toMap(Recipe::getId, Function.identity(), (left, right) -> left));
    }

    private Map<Long, StationUsageSummary> buildUsageSummaryByStation(List<CraftingStation> stations, List<RecipeStation> relevantRecipeStations, Map<Long, Recipe> recipeById) {
        if (stations == null || stations.isEmpty()) {
            return Map.of();
        }

        Map<Long, StationUsageSummary> usageByStation = new LinkedHashMap<>();
        for (CraftingStation station : stations) {
            if (station == null || station.getId() == null) {
                continue;
            }

            List<RecipeStation> matchedRecipeStations = relevantRecipeStations.stream()
                .filter(recipeStation -> matchesStation(station, recipeStation))
                .toList();
            if (matchedRecipeStations.isEmpty()) {
                continue;
            }

            List<Long> recipeIds = matchedRecipeStations.stream()
                .map(RecipeStation::getRecipeId)
                .filter(Objects::nonNull)
                .distinct()
                .sorted()
                .toList();

            List<AdminCraftingStationUsageItemDTO> usageItems = buildUsageItems(station, matchedRecipeStations, recipeById);
            StationUsageSummary summary = new StationUsageSummary();
            summary.recipeCount = recipeIds.size();
            summary.recipeIds = recipeIds;
            summary.items = usageItems.stream()
                .limit(6)
                .toList();
            summary.itemCount = usageItems.size();
            usageByStation.put(station.getId(), summary);
        }
        return usageByStation;
    }

    private List<AdminCraftingStationUsageItemDTO> buildUsageItems(CraftingStation station, List<RecipeStation> relevantRecipeStations, Map<Long, Recipe> recipeById) {
        if (station == null || relevantRecipeStations == null || relevantRecipeStations.isEmpty()) {
            return List.of();
        }

        List<RecipeStation> matchedRecipeStations = relevantRecipeStations.stream()
            .filter(recipeStation -> matchesStation(station, recipeStation))
            .toList();
        if (matchedRecipeStations.isEmpty()) {
            return List.of();
        }

        List<Long> recipeIds = matchedRecipeStations.stream()
            .map(RecipeStation::getRecipeId)
            .filter(Objects::nonNull)
            .distinct()
            .sorted()
            .toList();

        LinkedHashMap<String, UsageAccumulator> usageItems = new LinkedHashMap<>();
        for (Long recipeId : recipeIds) {
            Recipe recipe = recipeById.get(recipeId);
            if (recipe == null || recipe.getId() == null) {
                continue;
            }
            String itemKey = buildUsageItemKey(recipe);
            usageItems.computeIfAbsent(itemKey, unused -> new UsageAccumulator(recipe))
                .increment(recipeId);
        }

        return usageItems.values().stream()
            .map(UsageAccumulator::toDto)
            .toList();
    }

    private boolean matchesStation(CraftingStation station, RecipeStation recipeStation) {
        if (station == null || recipeStation == null) {
            return false;
        }
        if (station.getId() != null && station.getId().equals(recipeStation.getStationId())) {
            return true;
        }
        if (station.getItemId() != null && station.getItemId().equals(recipeStation.getStationItemId())) {
            return true;
        }

        String stationInternalName = trimToNull(station.getInternalName());
        String recipeStationInternalName = trimToNull(recipeStation.getStationInternalName());
        if (stationInternalName != null && stationInternalName.equals(recipeStationInternalName)) {
            return true;
        }

        String recipeStationNameRaw = trimToNull(recipeStation.getStationNameRaw());
        String stationNameEn = trimToNull(station.getNameEn());
        String stationNameZh = trimToNull(station.getNameZh());
        return (stationNameEn != null && stationNameEn.equals(recipeStationNameRaw))
            || (stationNameZh != null && stationNameZh.equals(recipeStationNameRaw));
    }

    private String buildUsageItemKey(Recipe recipe) {
        if (recipe.getResultItemId() != null) {
            return "item:" + recipe.getResultItemId();
        }
        if (trimToNull(recipe.getResultInternalName()) != null) {
            return "internal:" + trimToNull(recipe.getResultInternalName());
        }
        return "recipe:" + recipe.getId();
    }

    private AdminCraftingStationDTO toDto(CraftingStation station, Map<Long, Item> itemById, StationUsageSummary usageSummary) {
        AdminCraftingStationDTO dto = new AdminCraftingStationDTO();
        dto.setId(station.getId());
        dto.setItemId(station.getItemId());
        dto.setInternalName(station.getInternalName());
        dto.setNameEn(station.getNameEn());
        dto.setNameZh(station.getNameZh());
        dto.setStationType(station.getStationType());
        dto.setNotes(station.getNotes());
        dto.setImageUrl(station.getImageUrl());
        dto.setSortOrder(station.getSortOrder());
        dto.setStatus(station.getStatus());
        dto.setDeleted(station.getDeleted());
        dto.setCreatedAt(station.getCreatedAt());
        dto.setUpdatedAt(station.getUpdatedAt());

        Item relatedItem = station.getItemId() == null ? null : itemById.get(station.getItemId());
        if (relatedItem != null) {
            dto.setItemName(relatedItem.getName());
            dto.setItemNameZh(relatedItem.getNameZh());
            dto.setItemInternalName(relatedItem.getInternalName());
            dto.setItemImage(relatedItem.getImage());
        }

        dto.setUsageRecipeCount(usageSummary == null ? 0 : usageSummary.recipeCount);
        dto.setUsageItemCount(usageSummary == null ? 0 : usageSummary.itemCount);
        dto.setUsageRecipeIds(usageSummary == null ? List.of() : usageSummary.recipeIds);
        dto.setUsageItems(usageSummary == null ? List.of() : hydrateUsageItems(usageSummary.items, itemById));
        return dto;
    }

    private List<AdminCraftingStationUsageItemDTO> hydrateUsageItems(List<AdminCraftingStationUsageItemDTO> items, Map<Long, Item> itemById) {
        if (items == null || items.isEmpty()) {
            return List.of();
        }
        return items.stream()
            .map(item -> hydrateUsageItem(item, itemById))
            .toList();
    }

    private AdminCraftingStationUsageItemDTO hydrateUsageItem(AdminCraftingStationUsageItemDTO item, Map<Long, Item> itemById) {
        if (item == null) {
            return null;
        }
        AdminCraftingStationUsageItemDTO dto = new AdminCraftingStationUsageItemDTO();
        dto.setResultItemId(item.getResultItemId());
        dto.setResultItemName(item.getResultItemName());
        dto.setResultItemNameZh(item.getResultItemNameZh());
        dto.setResultItemInternalName(item.getResultItemInternalName());
        dto.setResultItemImage(item.getResultItemImage());
        dto.setRecipeCount(item.getRecipeCount());
        dto.setVersionScope(item.getVersionScope());

        Item resultItem = item.getResultItemId() == null ? null : itemById.get(item.getResultItemId());
        if (resultItem != null) {
            dto.setResultItemName(resultItem.getName());
            dto.setResultItemNameZh(resultItem.getNameZh());
            dto.setResultItemInternalName(resultItem.getInternalName());
            dto.setResultItemImage(resultItem.getImage());
        }
        return dto;
    }

    private static final class StationUsageSummary {
        private int recipeCount;
        private int itemCount;
        private List<Long> recipeIds = List.of();
        private List<AdminCraftingStationUsageItemDTO> items = List.of();
    }

    private static final class UsageAccumulator {
        private final Recipe recipe;
        private int recipeCount = 0;
        private final List<Long> recipeIds = new java.util.ArrayList<>();

        private UsageAccumulator(Recipe recipe) {
            this.recipe = recipe;
        }

        private void increment(Long recipeId) {
            recipeCount += 1;
            if (recipeId != null) {
                recipeIds.add(recipeId);
            }
        }

        private AdminCraftingStationUsageItemDTO toDto() {
            AdminCraftingStationUsageItemDTO dto = new AdminCraftingStationUsageItemDTO();
            dto.setResultItemId(recipe.getResultItemId());
            dto.setResultItemInternalName(recipe.getResultInternalName());
            dto.setRecipeCount(recipeCount);
            dto.setVersionScope(recipe.getVersionScope());
            dto.setRecipeIds(recipeIds);
            return dto;
        }
    }

    private List<AdminCraftingStationUsageItemDTO> sliceUsageItems(List<AdminCraftingStationUsageItemDTO> items, int page, int limit) {
        if (items == null || items.isEmpty()) {
            return List.of();
        }
        int fromIndex = Math.max((page - 1) * limit, 0);
        if (fromIndex >= items.size()) {
            return List.of();
        }
        int toIndex = Math.min(fromIndex + limit, items.size());
        return items.subList(fromIndex, toIndex);
    }

    private static final class StreamUtils {
        private static <T> java.util.stream.Stream<T> concat(java.util.stream.Stream<T> left, java.util.stream.Stream<T> right) {
            return java.util.stream.Stream.concat(left == null ? java.util.stream.Stream.empty() : left, right == null ? java.util.stream.Stream.empty() : right);
        }

        private static <T> java.util.stream.Stream<T> ofNullable(T value) {
            return value == null ? java.util.stream.Stream.empty() : java.util.stream.Stream.of(value);
        }
    }
}

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

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/admin/crafting-stations")
@RequiredArgsConstructor
@Tag(name = "AdminCraftingStations", description = "Admin crafting station management")
@SecurityRequirement(name = "bearerAuth")
public class AdminCraftingStationController {

    private static final Duration STATION_SNAPSHOT_TTL = Duration.ofMinutes(5);

    private final CraftingStationMapper craftingStationMapper;
    private final ItemMapper itemMapper;
    private final RecipeMapper recipeMapper;
    private final RecipeStationMapper recipeStationMapper;
    private volatile TimedValue<StationSnapshot> stationSnapshotCache;

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

        List<AdminCraftingStationDTO> stations = getStationSnapshot().orderedStations();
        String normalizedSearch = trimToNull(search);
        if (normalizedSearch != null) {
            String needle = normalizedSearch.toLowerCase();
            stations = stations.stream()
                .filter(station -> containsIgnoreCase(station.getInternalName(), needle)
                    || containsIgnoreCase(station.getNameEn(), needle)
                    || containsIgnoreCase(station.getNameZh(), needle))
                .toList();
        }
        if (normalizedUsageState != null) {
            stations = stations.stream()
                .filter(station -> matchesUsageState(station, normalizedUsageState))
                .toList();
        }

        Pagination pagination = new Pagination(stations.size(), safePage, safeLimit);
        ApiResponse<List<AdminCraftingStationDTO>> response = ApiResponse.success(sliceStations(stations, safePage, safeLimit));
        response.setPagination(pagination);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get crafting station detail")
    public ResponseEntity<ApiResponse<AdminCraftingStationDTO>> getCraftingStationById(@PathVariable Long id) {
        AdminCraftingStationDTO station = getStationSnapshot().dtoById().get(id);
        if (station == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Crafting station not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(station));
    }

    @GetMapping("/{id}/usage-items")
    @Operation(summary = "Get paged crafting station usage items")
    public ResponseEntity<ApiResponse<List<AdminCraftingStationUsageItemDTO>>> getCraftingStationUsageItems(
        @PathVariable Long id,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size
    ) {
        StationSnapshot snapshot = getStationSnapshot();
        if (!snapshot.dtoById().containsKey(id)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Crafting station not found"));
        }

        int safePage = PaginationParams.resolvePage(page);
        int safeLimit = PaginationParams.resolveLimit(limit, size, 20, 100);
        List<AdminCraftingStationUsageItemDTO> usageItems = snapshot.usageItemsByStationId().getOrDefault(id, List.of());

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
        invalidateStationSnapshot();
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success(getStationSnapshot().dtoById().get(station.getId()), "Crafting station created"));
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
        invalidateStationSnapshot();
        return ResponseEntity.ok(ApiResponse.success(getStationSnapshot().dtoById().get(id), "Crafting station updated"));
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
        int legacyReferences = getStationSnapshot().usageRecipeCountByStationId().getOrDefault(id, 0);
        if (legacyReferences > 0) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(400, "crafting station is still referenced by recipes"));
        }
        craftingStationMapper.deleteById(id);
        invalidateStationSnapshot();
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

    private String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            String trimmed = trimToNull(value);
            if (trimmed != null) {
                return trimmed;
            }
        }
        return null;
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

    private StationSnapshot getStationSnapshot() {
        TimedValue<StationSnapshot> cached = stationSnapshotCache;
        if (isValid(cached)) {
            return cached.value();
        }

        StationSnapshot snapshot = buildStationSnapshot();
        stationSnapshotCache = new TimedValue<>(snapshot, System.currentTimeMillis() + STATION_SNAPSHOT_TTL.toMillis());
        return snapshot;
    }

    private StationSnapshot buildStationSnapshot() {
        List<CraftingStation> stations = craftingStationMapper.selectList(new LambdaQueryWrapper<CraftingStation>()
            .orderByAsc(CraftingStation::getSortOrder, CraftingStation::getId));
        if (stations == null || stations.isEmpty()) {
            return new StationSnapshot(List.of(), Map.of(), Map.of(), Map.of());
        }

        List<RecipeStation> relevantRecipeStations = loadRelevantRecipeStations(stations);
        Map<Long, Recipe> recipeById = loadRecipesById(relevantRecipeStations.stream().map(RecipeStation::getRecipeId));
        StationRecipeMatches stationRecipeMatches = buildStationRecipeMatches(stations, relevantRecipeStations);
        Map<Long, Item> itemById = loadItemsById(StreamUtils.concat(
            stations.stream()
                .map(CraftingStation::getItemId)
                .filter(Objects::nonNull),
            recipeById.values().stream()
                .map(Recipe::getResultItemId)
                .filter(Objects::nonNull)
        ).distinct().toList());

        List<AdminCraftingStationDTO> orderedStations = new ArrayList<>();
        Map<Long, AdminCraftingStationDTO> dtoById = new LinkedHashMap<>();
        Map<Long, List<AdminCraftingStationUsageItemDTO>> usageItemsByStationId = new LinkedHashMap<>();
        Map<Long, Integer> usageRecipeCountByStationId = new LinkedHashMap<>();

        for (CraftingStation station : stations) {
            List<Long> recipeIds = stationRecipeMatches.recipeIdsByStationId().getOrDefault(station.getId(), List.of());
            List<AdminCraftingStationUsageItemDTO> usageItems = hydrateUsageItems(buildUsageItems(recipeIds, recipeById), itemById);

            StationUsageSummary usageSummary = new StationUsageSummary();
            usageSummary.recipeCount = recipeIds.size();
            usageSummary.recipeIds = recipeIds;
            usageSummary.items = usageItems.stream().limit(6).toList();
            usageSummary.itemCount = usageItems.size();

            AdminCraftingStationDTO dto = toDto(station, itemById, usageSummary);
            orderedStations.add(dto);
            dtoById.put(station.getId(), dto);
            usageItemsByStationId.put(station.getId(), usageItems);
            usageRecipeCountByStationId.put(station.getId(), recipeIds.size());
        }

        return new StationSnapshot(
            List.copyOf(orderedStations),
            Map.copyOf(dtoById),
            Map.copyOf(usageItemsByStationId),
            Map.copyOf(usageRecipeCountByStationId)
        );
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

    private StationRecipeMatches buildStationRecipeMatches(List<CraftingStation> stations, List<RecipeStation> relevantRecipeStations) {
        if (stations == null || stations.isEmpty() || relevantRecipeStations == null || relevantRecipeStations.isEmpty()) {
            return new StationRecipeMatches(Map.of(), Map.of());
        }

        Map<Long, List<RecipeStation>> byStationId = new LinkedHashMap<>();
        Map<Long, List<RecipeStation>> byStationItemId = new LinkedHashMap<>();
        Map<String, List<RecipeStation>> byStationInternalName = new LinkedHashMap<>();
        Map<String, List<RecipeStation>> byStationNameRaw = new LinkedHashMap<>();
        for (RecipeStation recipeStation : relevantRecipeStations) {
            if (recipeStation == null) {
                continue;
            }
            addToIndex(byStationId, recipeStation.getStationId(), recipeStation);
            addToIndex(byStationItemId, recipeStation.getStationItemId(), recipeStation);
            addToIndex(byStationInternalName, trimToNull(recipeStation.getStationInternalName()), recipeStation);
            addToIndex(byStationNameRaw, trimToNull(recipeStation.getStationNameRaw()), recipeStation);
        }

        Map<Long, List<RecipeStation>> recipeStationsByStationId = new LinkedHashMap<>();
        Map<Long, List<Long>> recipeIdsByStationId = new LinkedHashMap<>();
        for (CraftingStation station : stations) {
            if (station == null || station.getId() == null) {
                continue;
            }

            LinkedHashMap<Long, RecipeStation> matchedRecipeStations = new LinkedHashMap<>();
            collectRecipeStations(matchedRecipeStations, byStationId.get(station.getId()));
            collectRecipeStations(matchedRecipeStations, byStationItemId.get(station.getItemId()));
            collectRecipeStations(matchedRecipeStations, byStationInternalName.get(trimToNull(station.getInternalName())));
            collectRecipeStations(matchedRecipeStations, byStationNameRaw.get(trimToNull(station.getNameEn())));
            collectRecipeStations(matchedRecipeStations, byStationNameRaw.get(trimToNull(station.getNameZh())));

            List<RecipeStation> matchedList = matchedRecipeStations.isEmpty()
                ? List.of()
                : List.copyOf(matchedRecipeStations.values());
            recipeStationsByStationId.put(station.getId(), matchedList);
            recipeIdsByStationId.put(
                station.getId(),
                matchedList.stream()
                    .map(RecipeStation::getRecipeId)
                    .filter(Objects::nonNull)
                    .distinct()
                    .sorted()
                    .toList()
            );
        }

        appendComboStationRecipeMatches(stations, recipeStationsByStationId, recipeIdsByStationId);

        return new StationRecipeMatches(Map.copyOf(recipeStationsByStationId), Map.copyOf(recipeIdsByStationId));
    }

    private void appendComboStationRecipeMatches(
        List<CraftingStation> stations,
        Map<Long, List<RecipeStation>> recipeStationsByStationId,
        Map<Long, List<Long>> recipeIdsByStationId
    ) {
        Map<String, List<CraftingStation>> stationLookup = buildComboComponentLookup(stations);
        for (CraftingStation station : stations) {
            if (station == null || station.getId() == null || !"crafting_station_combo".equals(station.getStationType())) {
                continue;
            }

            List<Set<Long>> componentGroups = resolveComboComponentGroups(station, stationLookup);
            if (componentGroups.isEmpty()) {
                continue;
            }

            Set<Long> matchedRecipeIds = null;
            List<RecipeStation> componentRecipeStations = new ArrayList<>();
            for (Set<Long> groupStationIds : componentGroups) {
                LinkedHashMap<Long, RecipeStation> groupRecipeStationsById = new LinkedHashMap<>();
                for (Long groupStationId : groupStationIds) {
                    collectRecipeStations(groupRecipeStationsById, recipeStationsByStationId.get(groupStationId));
                }
                Set<Long> groupRecipeIds = groupRecipeStationsById.values().stream()
                    .map(RecipeStation::getRecipeId)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toCollection(LinkedHashSet::new));
                if (matchedRecipeIds == null) {
                    matchedRecipeIds = new LinkedHashSet<>(groupRecipeIds);
                } else {
                    matchedRecipeIds.retainAll(groupRecipeIds);
                }
                componentRecipeStations.addAll(groupRecipeStationsById.values());
            }

            if (matchedRecipeIds == null || matchedRecipeIds.isEmpty()) {
                continue;
            }

            LinkedHashMap<Long, RecipeStation> comboRecipeStationsById = new LinkedHashMap<>();
            collectRecipeStations(comboRecipeStationsById, recipeStationsByStationId.get(station.getId()));
            for (RecipeStation recipeStation : componentRecipeStations) {
                if (recipeStation != null
                    && recipeStation.getId() != null
                    && matchedRecipeIds.contains(recipeStation.getRecipeId())) {
                    comboRecipeStationsById.putIfAbsent(recipeStation.getId(), recipeStation);
                }
            }

            List<RecipeStation> matchedList = List.copyOf(comboRecipeStationsById.values());
            recipeStationsByStationId.put(station.getId(), matchedList);
            recipeIdsByStationId.put(
                station.getId(),
                matchedRecipeIds.stream()
                    .sorted()
                    .toList()
            );
        }
    }

    private Map<String, List<CraftingStation>> buildComboComponentLookup(List<CraftingStation> stations) {
        Map<String, List<CraftingStation>> lookup = new LinkedHashMap<>();
        for (CraftingStation station : stations) {
            if (station == null || station.getId() == null || "crafting_station_combo".equals(station.getStationType())) {
                continue;
            }
            addStationLookup(lookup, station.getInternalName(), station);
            addStationLookup(lookup, station.getNameEn(), station);
            addStationLookup(lookup, station.getNameZh(), station);
        }
        return lookup;
    }

    private void addStationLookup(Map<String, List<CraftingStation>> lookup, String value, CraftingStation station) {
        String key = normalizeComboComponentKey(value);
        if (key != null) {
            lookup.computeIfAbsent(key, unused -> new ArrayList<>()).add(station);
        }
    }

    private List<Set<Long>> resolveComboComponentGroups(CraftingStation station, Map<String, List<CraftingStation>> stationLookup) {
        String descriptor = firstNonBlank(station.getNameEn(), station.getNameZh(), station.getInternalName());
        if (descriptor == null) {
            return List.of();
        }

        List<Set<Long>> groups = new ArrayList<>();
        for (String groupText : descriptor.replaceAll("(?i)\\band\\b", "+").split("\\+")) {
            Set<Long> groupStationIds = new LinkedHashSet<>();
            String normalizedGroupText = groupText.replace("(", " ").replace(")", " ");
            for (String part : normalizedGroupText.replaceAll("(?i)\\bor\\b", "/").split("/")) {
                String key = normalizeComboComponentKey(part);
                if (key == null) {
                    continue;
                }
                List<CraftingStation> matchedStations = stationLookup.getOrDefault(key, List.of());
                for (CraftingStation matchedStation : matchedStations) {
                    groupStationIds.add(matchedStation.getId());
                }
            }
            if (groupStationIds.isEmpty()) {
                return List.of();
            }
            groups.add(groupStationIds);
        }
        return groups;
    }

    private String normalizeComboComponentKey(String value) {
        String trimmed = trimToNull(value);
        if (trimmed == null) {
            return null;
        }
        String normalized = trimmed
            .replaceAll("([a-z0-9])([A-Z])", "$1 $2")
            .replaceAll("([A-Z]+)([A-Z][a-z])", "$1 $2")
            .replaceAll("[_\\-]+", " ")
            .replace("'", "")
            .replace("’", "")
            .replaceAll("\\s+", " ")
            .trim()
            .toLowerCase();
        normalized = normalized
            .replaceAll("\\bbenches\\b", "bench")
            .replaceAll("\\bbookcases\\b", "bookcase")
            .replaceAll("\\bfountains\\b", "fountain")
            .replaceAll("\\bsinks\\b", "sink")
            .replaceAll("\\bchairs\\b", "chair")
            .replaceAll("\\btables\\b", "table")
            .replaceAll("\\s+", " ")
            .trim();
        return normalized.isEmpty() ? null : normalized;
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

    private <T> void addToIndex(Map<T, List<RecipeStation>> index, T key, RecipeStation recipeStation) {
        if (key == null || recipeStation == null) {
            return;
        }
        index.computeIfAbsent(key, unused -> new ArrayList<>()).add(recipeStation);
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

    private List<AdminCraftingStationUsageItemDTO> buildUsageItems(List<Long> recipeIds, Map<Long, Recipe> recipeById) {
        if (recipeIds == null || recipeIds.isEmpty()) {
            return List.of();
        }

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
        dto.setUsageItems(usageSummary == null ? List.of() : usageSummary.items);
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

    private boolean containsIgnoreCase(String value, String needleLowerCase) {
        return value != null && needleLowerCase != null && value.toLowerCase().contains(needleLowerCase);
    }

    private boolean isValid(TimedValue<?> cached) {
        return cached != null && cached.expiresAtMillis() > System.currentTimeMillis();
    }

    private void invalidateStationSnapshot() {
        stationSnapshotCache = null;
    }

    private record StationRecipeMatches(
        Map<Long, List<RecipeStation>> recipeStationsByStationId,
        Map<Long, List<Long>> recipeIdsByStationId
    ) {
    }

    private record StationSnapshot(
        List<AdminCraftingStationDTO> orderedStations,
        Map<Long, AdminCraftingStationDTO> dtoById,
        Map<Long, List<AdminCraftingStationUsageItemDTO>> usageItemsByStationId,
        Map<Long, Integer> usageRecipeCountByStationId
    ) {
    }

    private record TimedValue<T>(T value, long expiresAtMillis) {
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

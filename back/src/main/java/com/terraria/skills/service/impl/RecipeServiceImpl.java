package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.terraria.skills.dto.AdminRecipeConditionUpsertRequestDTO;
import com.terraria.skills.dto.AdminRecipeIngredientUpsertRequestDTO;
import com.terraria.skills.dto.AdminRecipeStationUpsertRequestDTO;
import com.terraria.skills.dto.AdminRecipeUpsertRequestDTO;
import com.terraria.skills.dto.RecipeConditionDTO;
import com.terraria.skills.dto.RecipeDTO;
import com.terraria.skills.dto.RecipeIngredientDTO;
import com.terraria.skills.dto.RecipeStationDTO;
import com.terraria.skills.entity.Biome;
import com.terraria.skills.entity.ConditionTerm;
import com.terraria.skills.entity.CraftingStation;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.Recipe;
import com.terraria.skills.entity.RecipeContextRequirement;
import com.terraria.skills.entity.RecipeIngredient;
import com.terraria.skills.entity.RecipeStation;
import com.terraria.skills.entity.WorldContext;
import com.terraria.skills.mapper.BiomeMapper;
import com.terraria.skills.mapper.ConditionTermMapper;
import com.terraria.skills.mapper.CraftingStationMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.mapper.RecipeContextRequirementMapper;
import com.terraria.skills.mapper.RecipeIngredientMapper;
import com.terraria.skills.mapper.RecipeMapper;
import com.terraria.skills.mapper.RecipeStationMapper;
import com.terraria.skills.mapper.WorldContextMapper;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import com.terraria.skills.service.ManagedItemImageResolver;
import com.terraria.skills.service.RecipeService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
@RequiredArgsConstructor
public class RecipeServiceImpl implements RecipeService {

    private static final List<String> RECIPE_PROVIDER_PRIORITY = List.of(
        "manual_admin",
        "wiki_gg",
        "wiki_gg_zh_reference",
        "wiki_zh"
    );

    private final RecipeMapper recipeMapper;
    private final RecipeIngredientMapper recipeIngredientMapper;
    private final RecipeStationMapper recipeStationMapper;
    private final RecipeContextRequirementMapper recipeContextRequirementMapper;
    private final CraftingStationMapper craftingStationMapper;
    private final ItemMapper itemMapper;
    private final ManagedItemImageResolver managedItemImageResolver;
    private final ManagedImageUrlPolicy managedImageUrlPolicy;
    private final BiomeMapper biomeMapper;
    private final WorldContextMapper worldContextMapper;
    private final ConditionTermMapper conditionTermMapper;

    @Override
    public List<RecipeDTO> getRecipesByResultItemId(Long itemId) {
        List<Recipe> allRecipes = recipeMapper.selectList(new LambdaQueryWrapper<Recipe>()
            .eq(Recipe::getResultItemId, itemId)
            .eq(Recipe::getStatus, 1)
            .orderByAsc(Recipe::getSortOrder, Recipe::getId));

        if (allRecipes == null || allRecipes.isEmpty()) {
            return Collections.emptyList();
        }

        List<Long> allRecipeIds = allRecipes.stream().map(Recipe::getId).toList();
        List<RecipeIngredient> allIngredients = recipeIngredientMapper.selectList(new LambdaQueryWrapper<RecipeIngredient>()
            .in(RecipeIngredient::getRecipeId, allRecipeIds)
            .orderByAsc(RecipeIngredient::getRecipeId, RecipeIngredient::getSortOrder, RecipeIngredient::getId));
        List<RecipeStation> allStations = recipeStationMapper.selectList(new LambdaQueryWrapper<RecipeStation>()
            .in(RecipeStation::getRecipeId, allRecipeIds)
            .orderByAsc(RecipeStation::getRecipeId, RecipeStation::getSortOrder, RecipeStation::getId));
        List<RecipeContextRequirement> allConditions = recipeContextRequirementMapper.selectList(new LambdaQueryWrapper<RecipeContextRequirement>()
            .in(RecipeContextRequirement::getRecipeId, allRecipeIds)
            .orderByAsc(RecipeContextRequirement::getRecipeId, RecipeContextRequirement::getSortOrder, RecipeContextRequirement::getId));
        Map<Long, List<RecipeIngredient>> ingredientsByRecipeId = allIngredients.stream()
            .collect(Collectors.groupingBy(RecipeIngredient::getRecipeId));
        Map<Long, List<RecipeStation>> stationsByRecipeId = allStations.stream()
            .collect(Collectors.groupingBy(RecipeStation::getRecipeId));
        Map<Long, List<RecipeContextRequirement>> conditionsByRecipeId = allConditions.stream()
            .collect(Collectors.groupingBy(RecipeContextRequirement::getRecipeId));

        List<Recipe> recipes = dedupeRecipesByStructure(selectPreferredProviderRecipes(
            allRecipes,
            ingredientsByRecipeId,
            stationsByRecipeId,
            conditionsByRecipeId
        ), ingredientsByRecipeId, stationsByRecipeId, conditionsByRecipeId);
        List<Long> recipeIds = recipes.stream().map(Recipe::getId).toList();
        List<RecipeIngredient> ingredients = recipeIds.isEmpty()
            ? Collections.emptyList()
            : allIngredients.stream().filter(ingredient -> recipeIds.contains(ingredient.getRecipeId())).toList();
        List<RecipeStation> stations = recipeIds.isEmpty()
            ? Collections.emptyList()
            : allStations.stream().filter(station -> recipeIds.contains(station.getRecipeId())).toList();
        List<RecipeContextRequirement> conditions = recipeIds.isEmpty()
            ? Collections.emptyList()
            : allConditions.stream().filter(condition -> recipeIds.contains(condition.getRecipeId())).toList();
        Map<Long, CraftingStation> craftingStationById = loadCraftingStations(stations.stream().map(RecipeStation::getStationId));

        Map<Long, Item> itemById = loadItems(
            recipes.stream().map(Recipe::getResultItemId),
            ingredients.stream().map(RecipeIngredient::getIngredientItemId),
            stations.stream().map(RecipeStation::getStationItemId),
            craftingStationById.values().stream().map(CraftingStation::getItemId)
        );
        Map<Long, String> managedImagesByItemId = managedItemImageResolver.resolveManagedImages(itemById.values());

        Map<Long, List<RecipeIngredientDTO>> ingredientDtosByRecipeId = ingredients.stream()
            .map(ingredient -> toIngredientDto(ingredient, itemById.get(ingredient.getIngredientItemId()), managedImagesByItemId))
            .collect(Collectors.groupingBy(RecipeIngredientDTO::getRecipeId));

        Map<Long, List<RecipeStationDTO>> stationDtosByRecipeId = stations.stream()
            .map(station -> {
                CraftingStation craftingStation = craftingStationById.get(station.getStationId());
                Item canonicalStationItem = craftingStation == null ? null : itemById.get(craftingStation.getItemId());
                return toStationDto(
                    station,
                    itemById.get(station.getStationItemId()),
                    craftingStation,
                    canonicalStationItem,
                    managedImagesByItemId
                );
            })
            .collect(Collectors.groupingBy(RecipeStationDTO::getRecipeId));
        Map<Long, List<RecipeConditionDTO>> conditionDtosByRecipeId = loadRecipeConditionDtos(conditions);

        return recipes.stream().map(recipe -> {
            RecipeDTO dto = new RecipeDTO();
            BeanUtils.copyProperties(recipe, dto);
            Item resultItem = itemById.get(recipe.getResultItemId());
            if (resultItem != null) {
                dto.setResultItemName(resultItem.getName());
                dto.setResultItemNameZh(resultItem.getNameZh());
                dto.setResultItemInternalName(resultItem.getInternalName());
                dto.setResultItemImage(managedItemImageResolver.resolveManagedImage(resultItem, managedImagesByItemId));
            } else {
                dto.setResultItemInternalName(recipe.getResultInternalName());
            }
            dto.setIngredients(ingredientDtosByRecipeId.getOrDefault(recipe.getId(), Collections.emptyList()));
            dto.setStations(stationDtosByRecipeId.getOrDefault(recipe.getId(), Collections.emptyList()));
            dto.setConditions(conditionDtosByRecipeId.getOrDefault(recipe.getId(), Collections.emptyList()));
            return dto;
        }).toList();
    }

    @Override
    @CacheEvict(cacheNames = "item:aggregate", allEntries = true)
    @Transactional
    public List<RecipeDTO> replaceRecipesForResultItemId(Long itemId, List<AdminRecipeUpsertRequestDTO> requests) {
        return replaceRecipesForResultItemId(itemId, requests, null);
    }

    @Override
    @CacheEvict(cacheNames = "item:aggregate", allEntries = true)
    @Transactional
    public List<RecipeDTO> replaceRecipesForResultItemId(Long itemId, List<AdminRecipeUpsertRequestDTO> requests, String scopeMode) {
        Item item = itemMapper.selectById(itemId);
        if (item == null || (item.getDeleted() != null && item.getDeleted() == 1)) {
            throw new IllegalArgumentException("Item not found");
        }

        List<AdminRecipeUpsertRequestDTO> safeRequests = requests == null ? Collections.emptyList() : requests;
        validateRequests(safeRequests);

        List<Recipe> existingRecipes = recipeMapper.selectList(new LambdaQueryWrapper<Recipe>()
            .eq(Recipe::getResultItemId, itemId));
        List<Recipe> recipesToReplace = existingRecipes.stream()
            .filter(recipe -> matchesScopeMode(recipe.getVersionScope(), scopeMode))
            .toList();

        if (!recipesToReplace.isEmpty()) {
            List<Long> recipeIds = recipesToReplace.stream()
                .map(Recipe::getId)
                .filter(Objects::nonNull)
                .toList();
            if (!recipeIds.isEmpty()) {
                recipeIngredientMapper.delete(new LambdaQueryWrapper<RecipeIngredient>().in(RecipeIngredient::getRecipeId, recipeIds));
                recipeStationMapper.delete(new LambdaQueryWrapper<RecipeStation>().in(RecipeStation::getRecipeId, recipeIds));
                recipeContextRequirementMapper.delete(new LambdaQueryWrapper<RecipeContextRequirement>().in(RecipeContextRequirement::getRecipeId, recipeIds));
                recipeMapper.delete(new LambdaQueryWrapper<Recipe>().in(Recipe::getId, recipeIds));
            }
        }

        for (int recipeIndex = 0; recipeIndex < safeRequests.size(); recipeIndex += 1) {
            AdminRecipeUpsertRequestDTO request = safeRequests.get(recipeIndex);
            Recipe recipe = new Recipe();
            recipe.setResultItemId(itemId);
            recipe.setResultInternalName(firstNonBlank(request.getResultInternalName(), item.getInternalName()));
            recipe.setResultQuantity(request.getResultQuantity() == null || request.getResultQuantity() < 1 ? 1 : request.getResultQuantity());
            recipe.setVersionScope(trimToNull(request.getVersionScope()));
            recipe.setNotes(trimToNull(request.getNotes()));
            recipe.setSourceProvider(defaultIfBlank(request.getSourceProvider(), "manual_admin"));
            recipe.setSourcePage(trimToNull(request.getSourcePage()));
            recipe.setSourceRevisionTimestamp(parseDateTime(request.getSourceRevisionTimestamp()));
            recipe.setSortOrder(resolveSortOrder(request.getSortOrder(), recipeIndex));
            recipe.setStatus(1);
            recipe.setDeleted(0);
            recipeMapper.insert(recipe);

            List<AdminRecipeIngredientUpsertRequestDTO> ingredients = request.getIngredients() == null
                ? Collections.emptyList()
                : request.getIngredients();
            for (int ingredientIndex = 0; ingredientIndex < ingredients.size(); ingredientIndex += 1) {
                AdminRecipeIngredientUpsertRequestDTO ingredientRequest = ingredients.get(ingredientIndex);
                if (!hasIngredientContent(ingredientRequest)) {
                    continue;
                }
                RecipeIngredient ingredient = new RecipeIngredient();
                ingredient.setRecipeId(recipe.getId());
                ingredient.setIngredientItemId(ingredientRequest.getIngredientItemId());
                ingredient.setIngredientInternalName(trimToNull(ingredientRequest.getIngredientInternalName()));
                ingredient.setIngredientNameRaw(resolvePreferredIngredientNameRaw(ingredientRequest));
                ingredient.setIngredientGroupType(defaultIfBlank(ingredientRequest.getIngredientGroupType(), "item"));
                ingredient.setQuantityMin(ingredientRequest.getQuantityMin());
                ingredient.setQuantityMax(ingredientRequest.getQuantityMax());
                ingredient.setQuantityText(resolveQuantityText(ingredientRequest));
                ingredient.setSortOrder(resolveSortOrder(ingredientRequest.getSortOrder(), ingredientIndex));
                recipeIngredientMapper.insert(ingredient);
            }

            List<AdminRecipeStationUpsertRequestDTO> stations = request.getStations() == null
                ? Collections.emptyList()
                : request.getStations();
            for (int stationIndex = 0; stationIndex < stations.size(); stationIndex += 1) {
                AdminRecipeStationUpsertRequestDTO stationRequest = stations.get(stationIndex);
                if (!hasStationContent(stationRequest)) {
                    continue;
                }
                CraftingStation linkedStation = stationRequest.getStationId() == null
                    ? null
                    : craftingStationMapper.selectById(stationRequest.getStationId());
                RecipeStation station = new RecipeStation();
                station.setRecipeId(recipe.getId());
                station.setStationId(stationRequest.getStationId());
                station.setStationItemId(resolvePreferredStationItemId(stationRequest, linkedStation));
                station.setStationInternalName(resolvePreferredStationInternalName(stationRequest, linkedStation));
                station.setStationNameRaw(resolvePreferredStationNameRaw(stationRequest, linkedStation));
                station.setIsAlternative(Boolean.TRUE.equals(stationRequest.getIsAlternative()));
                station.setSortOrder(resolveSortOrder(stationRequest.getSortOrder(), stationIndex));
                recipeStationMapper.insert(station);
            }

            List<AdminRecipeConditionUpsertRequestDTO> conditions = request.getConditions() == null
                ? Collections.emptyList()
                : request.getConditions();
            for (int conditionIndex = 0; conditionIndex < conditions.size(); conditionIndex += 1) {
                AdminRecipeConditionUpsertRequestDTO conditionRequest = conditions.get(conditionIndex);
                if (!hasConditionContent(conditionRequest)) {
                    continue;
                }
                RecipeContextRequirement condition = new RecipeContextRequirement();
                condition.setRecipeId(recipe.getId());
                condition.setRefType(normalizeConditionRefType(conditionRequest.getRefType()));
                condition.setRefId(conditionRequest.getRefId());
                condition.setRequirementRole(defaultIfBlank(conditionRequest.getRequirementRole(), "required"));
                condition.setNotes(trimToNull(conditionRequest.getNotes()));
                condition.setSortOrder(resolveSortOrder(conditionRequest.getSortOrder(), conditionIndex));
                recipeContextRequirementMapper.insert(condition);
            }
        }

        return getRecipesByResultItemId(itemId);
    }

    private List<Recipe> selectPreferredProviderRecipes(
        List<Recipe> recipes,
        Map<Long, List<RecipeIngredient>> ingredientsByRecipeId,
        Map<Long, List<RecipeStation>> stationsByRecipeId,
        Map<Long, List<RecipeContextRequirement>> conditionsByRecipeId
    ) {
        if (recipes == null || recipes.isEmpty()) {
            return Collections.emptyList();
        }

        Map<String, List<Recipe>> byProvider = recipes.stream()
            .filter(Objects::nonNull)
            .collect(Collectors.groupingBy(
                recipe -> normalizeRecipeProvider(recipe.getSourceProvider()),
                LinkedHashMap::new,
                Collectors.toList()
            ));

        String preferredProvider = byProvider.entrySet().stream()
            .max(Comparator
                .comparingInt((Map.Entry<String, List<Recipe>> entry) -> providerQualityScore(
                    entry.getValue(),
                    ingredientsByRecipeId,
                    stationsByRecipeId,
                    conditionsByRecipeId
                ))
                .thenComparing(entry -> normalizeRecipeProvider(entry.getKey()), this::compareRecipeProvidersInverse))
            .map(Map.Entry::getKey)
            .orElse("");

        return recipes.stream()
            .filter(Objects::nonNull)
            .filter(recipe -> Objects.equals(normalizeRecipeProvider(recipe.getSourceProvider()), preferredProvider))
            .toList();
    }

    private List<Recipe> dedupeRecipesByStructure(
        List<Recipe> recipes,
        Map<Long, List<RecipeIngredient>> ingredientsByRecipeId,
        Map<Long, List<RecipeStation>> stationsByRecipeId,
        Map<Long, List<RecipeContextRequirement>> conditionsByRecipeId
    ) {
        if (recipes == null || recipes.isEmpty()) {
            return Collections.emptyList();
        }

        Map<String, Recipe> deduped = new LinkedHashMap<>();
        for (Recipe recipe : recipes) {
            if (recipe == null) {
                continue;
            }
            String key = buildRecipeStructureSignature(
                recipe,
                ingredientsByRecipeId.getOrDefault(recipe.getId(), Collections.emptyList()),
                stationsByRecipeId.getOrDefault(recipe.getId(), Collections.emptyList()),
                conditionsByRecipeId.getOrDefault(recipe.getId(), Collections.emptyList())
            );
            deduped.putIfAbsent(key, recipe);
        }
        return new ArrayList<>(deduped.values());
    }

    private int providerQualityScore(
        List<Recipe> recipes,
        Map<Long, List<RecipeIngredient>> ingredientsByRecipeId,
        Map<Long, List<RecipeStation>> stationsByRecipeId,
        Map<Long, List<RecipeContextRequirement>> conditionsByRecipeId
    ) {
        int score = 0;
        for (Recipe recipe : recipes) {
            List<RecipeIngredient> ingredients = ingredientsByRecipeId.getOrDefault(recipe.getId(), Collections.emptyList());
            List<RecipeStation> stations = stationsByRecipeId.getOrDefault(recipe.getId(), Collections.emptyList());
            List<RecipeContextRequirement> conditions = conditionsByRecipeId.getOrDefault(recipe.getId(), Collections.emptyList());

            score += ingredients.size();
            score += conditions.size() * 2;
            score += stations.size();
            score += (int) stations.stream().filter(station -> station.getStationId() != null).count() * 4L;
            score += (int) ingredients.stream().filter(ingredient -> ingredient.getIngredientItemId() != null).count();
        }
        return score;
    }

    private int compareRecipeProvidersInverse(String left, String right) {
        return -compareRecipeProviders(left, right);
    }

    private String buildRecipeStructureSignature(
        Recipe recipe,
        List<RecipeIngredient> ingredients,
        List<RecipeStation> stations,
        List<RecipeContextRequirement> conditions
    ) {
        return String.join("|",
            String.valueOf(recipe.getResultItemId()),
            String.valueOf(recipe.getResultQuantity()),
            defaultIfBlank(recipe.getVersionScope(), ""),
            ingredients.stream()
                .map(ingredient -> String.join("~",
                    String.valueOf(ingredient.getIngredientItemId()),
                    defaultIfBlank(ingredient.getIngredientInternalName(), ""),
                    defaultIfBlank(ingredient.getIngredientNameRaw(), ""),
                    defaultIfBlank(ingredient.getIngredientGroupType(), ""),
                    defaultIfBlank(ingredient.getQuantityText(), ""),
                    String.valueOf(resolveSortOrder(ingredient.getSortOrder(), 0))
                ))
                .collect(Collectors.joining("||")),
            stations.stream()
                .map(station -> String.join("~",
                    String.valueOf(station.getStationId()),
                    String.valueOf(station.getStationItemId()),
                    defaultIfBlank(station.getStationInternalName(), ""),
                    defaultIfBlank(station.getStationNameRaw(), ""),
                    Boolean.TRUE.equals(station.getIsAlternative()) ? "1" : "0",
                    String.valueOf(resolveSortOrder(station.getSortOrder(), 0))
                ))
                .collect(Collectors.joining("||")),
            conditions.stream()
                .map(condition -> String.join("~",
                    defaultIfBlank(condition.getRefType(), ""),
                    String.valueOf(condition.getRefId()),
                    defaultIfBlank(condition.getRequirementRole(), ""),
                    defaultIfBlank(condition.getNotes(), ""),
                    String.valueOf(resolveSortOrder(condition.getSortOrder(), 0))
                ))
                .collect(Collectors.joining("||"))
        );
    }

    private boolean matchesScopeMode(String versionScope, String scopeMode) {
        String normalizedMode = trimToNull(scopeMode);
        if (normalizedMode == null || "all".equalsIgnoreCase(normalizedMode) || "full".equalsIgnoreCase(normalizedMode)) {
            return true;
        }

        String normalizedScope = trimToNull(versionScope);
        if ("desktop".equalsIgnoreCase(normalizedMode)) {
            if (normalizedScope == null) {
                return true;
            }
            return normalizedScope.toLowerCase().contains("desktop");
        }

        return true;
    }

    private Map<Long, Item> loadItems(Stream<Long> resultIds, Stream<Long> ingredientIds, Stream<Long> stationIds, Stream<Long> craftingStationItemIds) {
        List<Long> ids = Stream.of(resultIds, ingredientIds, stationIds, craftingStationItemIds)
            .filter(Objects::nonNull)
            .flatMap(Function.identity())
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        if (ids.isEmpty()) {
            return Collections.emptyMap();
        }

        return itemMapper.selectBatchIds(ids).stream()
            .collect(Collectors.toMap(Item::getId, Function.identity()));
    }

    private RecipeIngredientDTO toIngredientDto(
        RecipeIngredient ingredient,
        Item item,
        Map<Long, String> managedImagesByItemId
    ) {
        RecipeIngredientDTO dto = new RecipeIngredientDTO();
        BeanUtils.copyProperties(ingredient, dto);
        applyDisplayQuantityDefaults(dto);
        if (item != null) {
            dto.setItemName(item.getName());
            dto.setItemNameZh(item.getNameZh());
            dto.setItemInternalName(item.getInternalName());
            dto.setItemImage(managedItemImageResolver.resolveManagedImage(item, managedImagesByItemId));
        } else {
            dto.setItemInternalName(ingredient.getIngredientInternalName());
        }
        return dto;
    }

    private void applyDisplayQuantityDefaults(RecipeIngredientDTO dto) {
        if (dto == null || "group".equalsIgnoreCase(dto.getIngredientGroupType())) {
            return;
        }

        boolean missingQuantity = trimToNull(dto.getQuantityText()) == null
            && dto.getQuantityMin() == null
            && dto.getQuantityMax() == null;
        boolean zeroQuantity = trimToNull(dto.getQuantityText()) == null
            && dto.getQuantityMin() != null
            && dto.getQuantityMax() != null
            && dto.getQuantityMin() == 0
            && dto.getQuantityMax() == 0;

        if (missingQuantity || zeroQuantity) {
            dto.setQuantityText("1");
            dto.setQuantityMin(1);
            dto.setQuantityMax(1);
        }
    }

    private RecipeStationDTO toStationDto(
        RecipeStation station,
        Item item,
        CraftingStation craftingStation,
        Item craftingStationItem,
        Map<Long, String> managedImagesByItemId
    ) {
        RecipeStationDTO dto = new RecipeStationDTO();
        BeanUtils.copyProperties(station, dto);
        if (craftingStation != null) {
            dto.setItemName(firstNonBlank(craftingStation.getNameEn(), craftingStationItem == null ? null : craftingStationItem.getName(), station.getStationNameRaw()));
            dto.setItemNameZh(firstNonBlank(craftingStation.getNameZh(), craftingStationItem == null ? null : craftingStationItem.getNameZh()));
            dto.setItemInternalName(firstNonBlank(craftingStation.getInternalName(), craftingStationItem == null ? null : craftingStationItem.getInternalName(), station.getStationInternalName()));
            dto.setItemImage(firstNonBlank(
                managedImageOrNull(craftingStation.getImageUrl()),
                managedItemImageResolver.resolveManagedImage(craftingStationItem, managedImagesByItemId),
                managedItemImageResolver.resolveManagedImage(item, managedImagesByItemId)
            ));
            dto.setStationType(firstNonBlank(craftingStation.getStationType(), "station"));
        } else if (item != null) {
            dto.setItemName(item.getName());
            dto.setItemNameZh(item.getNameZh());
            dto.setItemInternalName(item.getInternalName());
            dto.setItemImage(managedItemImageResolver.resolveManagedImage(item, managedImagesByItemId));
            dto.setStationType("station");
        } else {
            dto.setItemInternalName(station.getStationInternalName());
            dto.setStationType("environment");
        }
        return dto;
    }

    private Map<Long, CraftingStation> loadCraftingStations(Stream<Long> stationIds) {
        List<Long> ids = stationIds
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        if (ids.isEmpty()) {
            return Collections.emptyMap();
        }

        return craftingStationMapper.selectBatchIds(ids).stream()
            .collect(Collectors.toMap(CraftingStation::getId, Function.identity()));
    }

    private boolean hasIngredientContent(AdminRecipeIngredientUpsertRequestDTO request) {
        return request != null && (
            request.getIngredientItemId() != null
                || trimToNull(request.getIngredientNameRaw()) != null
                || trimToNull(request.getQuantityText()) != null
                || request.getQuantityMin() != null
                || request.getQuantityMax() != null
        );
    }

    private boolean hasStationContent(AdminRecipeStationUpsertRequestDTO request) {
        return request != null && (
            request.getStationId() != null
                || request.getStationItemId() != null
                || trimToNull(request.getStationNameRaw()) != null
        );
    }

    private boolean hasConditionContent(AdminRecipeConditionUpsertRequestDTO request) {
        return request != null
            && normalizeConditionRefType(request.getRefType()) != null
            && request.getRefId() != null
            && request.getRefId() > 0;
    }

    private void validateRequests(List<AdminRecipeUpsertRequestDTO> requests) {
        for (int recipeIndex = 0; recipeIndex < requests.size(); recipeIndex += 1) {
            AdminRecipeUpsertRequestDTO recipe = requests.get(recipeIndex);
            int displayIndex = recipeIndex + 1;
            if (recipe == null) {
                throw new IllegalArgumentException("配方 #" + displayIndex + " 不能为空");
            }
            if (recipe.getResultQuantity() != null && recipe.getResultQuantity() < 1) {
                throw new IllegalArgumentException("配方 #" + displayIndex + " 的产出数量必须大于 0");
            }
            String sourceProvider = trimToNull(recipe.getSourceProvider());
            if (sourceProvider != null && providerRank(sourceProvider) > RECIPE_PROVIDER_PRIORITY.size()) {
                throw new IllegalArgumentException("配方 #" + displayIndex + " 的 sourceProvider 不在允许列表中");
            }

            List<AdminRecipeIngredientUpsertRequestDTO> ingredients = recipe.getIngredients() == null
                ? Collections.emptyList()
                : recipe.getIngredients();
            List<AdminRecipeStationUpsertRequestDTO> stations = recipe.getStations() == null
                ? Collections.emptyList()
                : recipe.getStations();
            List<AdminRecipeConditionUpsertRequestDTO> conditions = recipe.getConditions() == null
                ? Collections.emptyList()
                : recipe.getConditions();

            if (ingredients.isEmpty()) {
                throw new IllegalArgumentException("配方 #" + displayIndex + " 至少需要 1 个原料");
            }
            if (stations.isEmpty() && conditions.isEmpty()) {
                throw new IllegalArgumentException("配方 #" + displayIndex + " 至少需要 1 个工作台");
            }

            for (int ingredientIndex = 0; ingredientIndex < ingredients.size(); ingredientIndex += 1) {
                AdminRecipeIngredientUpsertRequestDTO ingredient = ingredients.get(ingredientIndex);
                int ingredientDisplayIndex = ingredientIndex + 1;
                if (!hasIngredientContent(ingredient)) {
                    throw new IllegalArgumentException("配方 #" + displayIndex + " 的原料 #" + ingredientDisplayIndex + " 不能为空");
                }
                if (ingredient.getIngredientItemId() == null && trimToNull(ingredient.getIngredientNameRaw()) == null) {
                    throw new IllegalArgumentException("配方 #" + displayIndex + " 的原料 #" + ingredientDisplayIndex + " 必须填写物品 ID 或原料名称");
                }
                String groupType = defaultIfBlank(ingredient.getIngredientGroupType(), "item");
                if (!"item".equals(groupType) && !"group".equals(groupType)) {
                    throw new IllegalArgumentException("配方 #" + displayIndex + " 的原料 #" + ingredientDisplayIndex + " 类型仅支持 item 或 group");
                }
                if (ingredient.getQuantityMin() != null && ingredient.getQuantityMin() < 0) {
                    throw new IllegalArgumentException("配方 #" + displayIndex + " 的原料 #" + ingredientDisplayIndex + " quantityMin 不能小于 0");
                }
                if (ingredient.getQuantityMax() != null && ingredient.getQuantityMax() < 0) {
                    throw new IllegalArgumentException("配方 #" + displayIndex + " 的原料 #" + ingredientDisplayIndex + " quantityMax 不能小于 0");
                }
                if (ingredient.getQuantityMin() != null && ingredient.getQuantityMax() != null && ingredient.getQuantityMax() < ingredient.getQuantityMin()) {
                    throw new IllegalArgumentException("配方 #" + displayIndex + " 的原料 #" + ingredientDisplayIndex + " quantityMax 不能小于 quantityMin");
                }
            }

            for (int stationIndex = 0; stationIndex < stations.size(); stationIndex += 1) {
                AdminRecipeStationUpsertRequestDTO station = stations.get(stationIndex);
                int stationDisplayIndex = stationIndex + 1;
                if (!hasStationContent(station)) {
                    throw new IllegalArgumentException("配方 #" + displayIndex + " 的工作台 #" + stationDisplayIndex + " 不能为空");
                }
                if (station.getStationId() == null && station.getStationItemId() == null && trimToNull(station.getStationNameRaw()) == null) {
                    throw new IllegalArgumentException("配方 #" + displayIndex + " 的工作台 #" + stationDisplayIndex + " 必须填写制作站 ID、物品 ID 或工作台名称");
                }
            }
            for (int conditionIndex = 0; conditionIndex < conditions.size(); conditionIndex += 1) {
                AdminRecipeConditionUpsertRequestDTO condition = conditions.get(conditionIndex);
                if (!hasConditionContent(condition)) {
                    throw new IllegalArgumentException("Recipe #" + displayIndex + " condition #" + (conditionIndex + 1) + " requires refType and refId");
                }
            }
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

    private String managedImageOrNull(String value) {
        String trimmed = trimToNull(value);
        return trimmed != null && managedImageUrlPolicy.isManagedImageUrl(trimmed) ? trimmed : null;
    }

    private String defaultIfBlank(String value, String fallback) {
        String trimmed = trimToNull(value);
        return trimmed == null ? fallback : trimmed;
    }

    private int compareRecipeProviders(String left, String right) {
        int leftRank = providerRank(left);
        int rightRank = providerRank(right);
        if (leftRank != rightRank) {
            return Integer.compare(leftRank, rightRank);
        }
        return normalizeRecipeProvider(left).compareTo(normalizeRecipeProvider(right));
    }

    private int providerRank(String provider) {
        int index = RECIPE_PROVIDER_PRIORITY.indexOf(normalizeRecipeProvider(provider));
        return index >= 0 ? index : RECIPE_PROVIDER_PRIORITY.size() + 1;
    }

    private String normalizeRecipeProvider(String provider) {
        String trimmed = trimToNull(provider);
        return trimmed == null ? "" : trimmed;
    }

    private Integer resolveSortOrder(Integer explicitSortOrder, int index) {
        if (explicitSortOrder != null && explicitSortOrder > 0) {
            return explicitSortOrder;
        }
        return index + 1;
    }

    private String resolveQuantityText(AdminRecipeIngredientUpsertRequestDTO ingredient) {
        String text = trimToNull(ingredient.getQuantityText());
        if (text != null) {
            return text;
        }
        if (ingredient.getQuantityMin() != null && ingredient.getQuantityMax() != null && !ingredient.getQuantityMin().equals(ingredient.getQuantityMax())) {
            return ingredient.getQuantityMin() + "-" + ingredient.getQuantityMax();
        }
        if (ingredient.getQuantityMin() != null) {
            return String.valueOf(ingredient.getQuantityMin());
        }
        if (ingredient.getQuantityMax() != null) {
            return String.valueOf(ingredient.getQuantityMax());
        }
        return "1";
    }

    private String resolvePreferredIngredientNameRaw(AdminRecipeIngredientUpsertRequestDTO request) {
        String direct = trimToNull(request.getIngredientNameRaw());
        if (request.getIngredientItemId() == null) {
            return direct;
        }
        Item item = itemMapper.selectById(request.getIngredientItemId());
        if (item != null) {
            String preferred = firstNonBlank(item.getNameZh(), item.getName(), direct);
            if (preferred != null) {
                return preferred;
            }
        }
        return direct;
    }

    private String resolvePreferredStationNameRaw(AdminRecipeStationUpsertRequestDTO request, CraftingStation craftingStation) {
        String direct = trimToNull(request.getStationNameRaw());
        if (craftingStation != null) {
            String preferred = firstNonBlank(craftingStation.getNameZh(), craftingStation.getNameEn(), direct);
            if (preferred != null) {
                return preferred;
            }
        }
        if (request.getStationItemId() != null) {
            Item item = itemMapper.selectById(request.getStationItemId());
            if (item != null) {
                String preferred = firstNonBlank(item.getNameZh(), item.getName(), direct);
                if (preferred != null) {
                    return preferred;
                }
            }
        }
        if (request.getStationId() != null) {
            CraftingStation station = craftingStationMapper.selectById(request.getStationId());
            if (station != null) {
                String preferred = firstNonBlank(station.getNameZh(), station.getNameEn(), direct);
                if (preferred != null) {
                    return preferred;
                }
            }
        }
        return direct;
    }

    private Long resolvePreferredStationItemId(AdminRecipeStationUpsertRequestDTO request, CraftingStation craftingStation) {
        if (craftingStation != null && craftingStation.getItemId() != null) {
            return craftingStation.getItemId();
        }
        return request.getStationItemId();
    }

    private String resolvePreferredStationInternalName(AdminRecipeStationUpsertRequestDTO request, CraftingStation craftingStation) {
        return firstNonBlank(
            craftingStation == null ? null : craftingStation.getInternalName(),
            trimToNull(request.getStationInternalName())
        );
    }

    private Map<Long, List<RecipeConditionDTO>> loadRecipeConditionDtos(List<RecipeContextRequirement> conditions) {
        if (conditions == null || conditions.isEmpty()) {
            return Collections.emptyMap();
        }

        List<Long> biomeIds = conditions.stream()
            .filter(condition -> "BIOME".equalsIgnoreCase(condition.getRefType()))
            .map(RecipeContextRequirement::getRefId)
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        List<Long> worldContextIds = conditions.stream()
            .filter(condition -> "WORLD_CONTEXT".equalsIgnoreCase(condition.getRefType()))
            .map(RecipeContextRequirement::getRefId)
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        List<Long> conditionTermIds = conditions.stream()
            .filter(condition -> "CONDITION_TERM".equalsIgnoreCase(condition.getRefType()))
            .map(RecipeContextRequirement::getRefId)
            .filter(Objects::nonNull)
            .distinct()
            .toList();

        Map<Long, Biome> biomeById = biomeIds.isEmpty()
            ? Collections.emptyMap()
            : biomeMapper.selectBatchIds(biomeIds).stream().collect(Collectors.toMap(Biome::getId, Function.identity()));
        Map<Long, WorldContext> worldContextById = worldContextIds.isEmpty()
            ? Collections.emptyMap()
            : worldContextMapper.selectBatchIds(worldContextIds).stream().collect(Collectors.toMap(WorldContext::getId, Function.identity()));
        Map<Long, ConditionTerm> conditionTermById = conditionTermIds.isEmpty()
            ? Collections.emptyMap()
            : conditionTermMapper.selectBatchIds(conditionTermIds).stream().collect(Collectors.toMap(ConditionTerm::getId, Function.identity()));

        return conditions.stream()
            .map(condition -> toConditionDto(condition, biomeById.get(condition.getRefId()), worldContextById.get(condition.getRefId()), conditionTermById.get(condition.getRefId())))
            .collect(Collectors.groupingBy(RecipeConditionDTO::getRecipeId));
    }

    private RecipeConditionDTO toConditionDto(RecipeContextRequirement condition, Biome biome, WorldContext worldContext, ConditionTerm conditionTerm) {
        RecipeConditionDTO dto = new RecipeConditionDTO();
        BeanUtils.copyProperties(condition, dto);
        if (biome != null) {
            dto.setRefCode(biome.getCode());
            dto.setRefNameEn(biome.getNameEn());
            dto.setRefNameZh(biome.getNameZh());
            dto.setRefContextType("BIOME");
        } else if (worldContext != null) {
            dto.setRefCode(worldContext.getCode());
            dto.setRefNameEn(worldContext.getNameEn());
            dto.setRefNameZh(worldContext.getNameZh());
            dto.setRefContextType(worldContext.getContextType());
        } else if (conditionTerm != null) {
            dto.setRefCode(conditionTerm.getCode());
            dto.setRefNameEn(conditionTerm.getNameEn());
            dto.setRefNameZh(conditionTerm.getNameZh());
            dto.setRefContextType(conditionTerm.getTermType());
        }
        return dto;
    }

    private String normalizeConditionRefType(String rawType) {
        String type = trimToNull(rawType);
        if (type == null) {
            return null;
        }
        String normalized = type.trim().toUpperCase();
        return switch (normalized) {
            case "BIOME" -> "BIOME";
            case "WORLD_CONTEXT", "CONTEXT", "ENVIRONMENT", "MOON_PHASE" -> "WORLD_CONTEXT";
            case "CONDITION_TERM", "LOCAL_CONDITION" -> "CONDITION_TERM";
            default -> null;
        };
    }

    private LocalDateTime parseDateTime(String value) {
        String trimmed = trimToNull(value);
        if (trimmed == null) {
            return null;
        }
        try {
            return LocalDateTime.parse(trimmed);
        } catch (DateTimeParseException ignored) {
            return null;
        }
    }
}

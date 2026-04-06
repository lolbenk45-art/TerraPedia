package com.terraria.skills.service.impl;

import com.terraria.skills.dto.ItemDTO;
import com.terraria.skills.dto.RecipeDTO;
import com.terraria.skills.dto.RecipeIngredientDTO;
import com.terraria.skills.dto.RecipeTreeItemDTO;
import com.terraria.skills.dto.RecipeTreeMetaDTO;
import com.terraria.skills.dto.RecipeTreeNodeDTO;
import com.terraria.skills.dto.RecipeTreeResponseDTO;
import com.terraria.skills.dto.RecipeTreeStationDTO;
import com.terraria.skills.dto.RecipeTreeVariantDTO;
import com.terraria.skills.service.ItemService;
import com.terraria.skills.service.RecipeService;
import com.terraria.skills.service.RecipeTreeService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class RecipeTreeServiceImpl implements RecipeTreeService {

    private static final int DEFAULT_MAX_DEPTH = 3;
    private static final int ABSOLUTE_MAX_DEPTH = 5;

    private final ItemService itemService;
    private final RecipeService recipeService;

    @Override
    public RecipeTreeResponseDTO getRecipeTreeByItemId(Long itemId, int maxDepth) {
        ItemDTO item = itemService.getItemById(itemId);
        if (item == null) {
            throw new IllegalArgumentException("Item not found");
        }

        int resolvedMaxDepth = Math.max(1, Math.min(maxDepth <= 0 ? DEFAULT_MAX_DEPTH : maxDepth, ABSOLUTE_MAX_DEPTH));
        List<RecipeDTO> recipes = safeRecipes(recipeService.getRecipesByResultItemId(itemId));

        RecipeTreeResponseDTO response = new RecipeTreeResponseDTO();
        response.setItem(toTreeItem(item));

        RecipeTreeMetaDTO meta = new RecipeTreeMetaDTO();
        meta.setMaxDepth(resolvedMaxDepth);
        meta.setMode("grouped");
        meta.setGeneratedAt(LocalDateTime.now());
        response.setTreeMeta(meta);

        Map<String, List<RecipeDTO>> recipesByVariant = recipes.stream()
            .sorted(Comparator
                .comparing((RecipeDTO recipe) -> variantOrder(recipe.getVersionScope()))
                .thenComparing(RecipeDTO::getSortOrder, Comparator.nullsLast(Integer::compareTo))
                .thenComparing(RecipeDTO::getId, Comparator.nullsLast(Long::compareTo)))
            .collect(Collectors.groupingBy(
                recipe -> variantKey(recipe.getVersionScope()),
                LinkedHashMap::new,
                Collectors.toList()
            ));

        Map<String, List<RecipeDTO>> recipeCache = new LinkedHashMap<>();
        for (Map.Entry<String, List<RecipeDTO>> entry : recipesByVariant.entrySet()) {
            RecipeTreeVariantDTO variant = new RecipeTreeVariantDTO();
            variant.setVariantKey(entry.getKey());
            variant.setVariantLabel(variantLabel(entry.getValue().isEmpty() ? null : entry.getValue().get(0).getVersionScope()));
            variant.setVersionScope(entry.getValue().isEmpty() ? null : entry.getValue().get(0).getVersionScope());
            variant.setRecipeCount(entry.getValue().size());

            Set<String> rootPath = new LinkedHashSet<>();
            rootPath.add(referenceKey(itemId, item.getInternalName()));

            List<RecipeTreeNodeDTO> roots = new ArrayList<>();
            for (RecipeDTO recipe : entry.getValue()) {
                roots.add(buildRecipeRoot(recipe, recipe.getVersionScope(), 0, resolvedMaxDepth, rootPath, new LinkedHashSet<>(), recipeCache));
            }
            variant.setRoots(roots);
            response.getVariants().add(variant);
        }

        return response;
    }

    private RecipeTreeNodeDTO buildRecipeRoot(
        RecipeDTO recipe,
        String variantScope,
        int depth,
        int maxDepth,
        Set<String> currentPath,
        Set<String> expandedKeys,
        Map<String, List<RecipeDTO>> recipeCache
    ) {
        RecipeTreeNodeDTO root = new RecipeTreeNodeDTO();
        root.setNodeType("craft-result");
        root.setRecipeId(recipe.getId());
        root.setItemId(recipe.getResultItemId());
        root.setItemInternalName(firstNonBlank(recipe.getResultItemInternalName(), recipe.getResultInternalName()));
        root.setItemName(recipe.getResultItemName());
        root.setItemNameZh(recipe.getResultItemNameZh());
        root.setItemImage(recipe.getResultItemImage());
        root.setResultQuantity(recipe.getResultQuantity());
        root.setDepth(depth);
        root.setStations(recipe.getStations() == null ? Collections.emptyList() : recipe.getStations().stream()
            .map(this::toTreeStation)
            .toList());

        List<RecipeTreeNodeDTO> children = new ArrayList<>();
        for (RecipeIngredientDTO ingredient : safeIngredients(recipe.getIngredients())) {
            children.add(buildIngredientNode(ingredient, variantScope, depth + 1, maxDepth, currentPath, expandedKeys, recipeCache));
        }
        root.setChildren(children);
        return root;
    }

    private RecipeTreeNodeDTO buildIngredientNode(
        RecipeIngredientDTO ingredient,
        String variantScope,
        int depth,
        int maxDepth,
        Set<String> currentPath,
        Set<String> expandedKeys,
        Map<String, List<RecipeDTO>> recipeCache
    ) {
        RecipeTreeNodeDTO node = new RecipeTreeNodeDTO();
        node.setNodeType("ingredient");
        node.setItemId(ingredient.getIngredientItemId());
        node.setItemInternalName(firstNonBlank(ingredient.getItemInternalName(), ingredient.getIngredientInternalName()));
        node.setItemName(ingredient.getItemName());
        node.setItemNameZh(ingredient.getItemNameZh());
        node.setItemImage(ingredient.getItemImage());
        node.setQuantityText(trimToNull(ingredient.getQuantityText()));
        node.setQuantityMin(ingredient.getQuantityMin());
        node.setQuantityMax(ingredient.getQuantityMax());
        node.setIngredientGroupType(defaultIfBlank(ingredient.getIngredientGroupType(), "item"));
        node.setDepth(depth);

        boolean groupNode = "group".equalsIgnoreCase(node.getIngredientGroupType());
        boolean hasItemId = ingredient.getIngredientItemId() != null;
        String refKey = referenceKey(ingredient.getIngredientItemId(), node.getItemInternalName());
        node.setReferenceKey(refKey);

        if (!hasItemId || groupNode || depth > maxDepth) {
            node.setExpandable(false);
            return node;
        }

        if (currentPath.contains(refKey)) {
            node.setExpandable(false);
            node.setCycleDetected(true);
            return node;
        }

        if (expandedKeys.contains(refKey)) {
            node.setExpandable(false);
            node.setIsReference(true);
            return node;
        }

        List<RecipeDTO> candidateRecipes = resolveChildRecipes(ingredient.getIngredientItemId(), variantScope, recipeCache);
        if (candidateRecipes.isEmpty()) {
            node.setExpandable(false);
            return node;
        }

        node.setExpandable(true);
        Set<String> nextPath = new LinkedHashSet<>(currentPath);
        nextPath.add(refKey);
        Set<String> nextExpandedKeys = new LinkedHashSet<>(expandedKeys);
        nextExpandedKeys.add(refKey);

        List<RecipeTreeNodeDTO> children = new ArrayList<>();
        for (RecipeDTO recipe : candidateRecipes) {
            children.add(buildRecipeRoot(recipe, chooseVariantScope(variantScope, recipe), depth, maxDepth, nextPath, nextExpandedKeys, recipeCache));
        }
        node.setChildren(children);
        return node;
    }

    private List<RecipeDTO> resolveChildRecipes(Long itemId, String variantScope, Map<String, List<RecipeDTO>> recipeCache) {
        String cacheKey = itemId + "::" + defaultIfBlank(variantScope, "__base__");
        if (recipeCache.containsKey(cacheKey)) {
            return recipeCache.get(cacheKey);
        }

        List<RecipeDTO> allRecipes = safeRecipes(recipeService.getRecipesByResultItemId(itemId));
        if (allRecipes.isEmpty()) {
            recipeCache.put(cacheKey, Collections.emptyList());
            return Collections.emptyList();
        }

        List<RecipeDTO> exactMatches = allRecipes.stream()
            .filter(recipe -> Objects.equals(trimToNull(recipe.getVersionScope()), trimToNull(variantScope)))
            .sorted(Comparator
                .comparing(RecipeDTO::getSortOrder, Comparator.nullsLast(Integer::compareTo))
                .thenComparing(RecipeDTO::getId, Comparator.nullsLast(Long::compareTo)))
            .toList();
        if (!exactMatches.isEmpty()) {
            recipeCache.put(cacheKey, exactMatches);
            return exactMatches;
        }

        List<RecipeDTO> baseMatches = allRecipes.stream()
            .filter(recipe -> trimToNull(recipe.getVersionScope()) == null)
            .sorted(Comparator
                .comparing(RecipeDTO::getSortOrder, Comparator.nullsLast(Integer::compareTo))
                .thenComparing(RecipeDTO::getId, Comparator.nullsLast(Long::compareTo)))
            .toList();
        recipeCache.put(cacheKey, baseMatches);
        return baseMatches;
    }

    private RecipeTreeItemDTO toTreeItem(ItemDTO item) {
        RecipeTreeItemDTO dto = new RecipeTreeItemDTO();
        dto.setId(item.getId());
        dto.setName(item.getName());
        dto.setNameZh(item.getNameZh());
        dto.setInternalName(item.getInternalName());
        dto.setImage(item.getImage());
        return dto;
    }

    private RecipeTreeStationDTO toTreeStation(com.terraria.skills.dto.RecipeStationDTO station) {
        RecipeTreeStationDTO dto = new RecipeTreeStationDTO();
        dto.setStationItemId(station.getStationItemId());
        dto.setStationInternalName(firstNonBlank(station.getItemInternalName(), station.getStationInternalName()));
        dto.setStationName(station.getItemName());
        dto.setStationNameZh(station.getItemNameZh());
        dto.setStationNameRaw(station.getStationNameRaw());
        dto.setStationImage(station.getItemImage());
        dto.setIsAlternative(Boolean.TRUE.equals(station.getIsAlternative()));
        dto.setStationType((station.getStationId() != null || station.getStationItemId() != null) ? "station" : "environment");
        return dto;
    }

    private String chooseVariantScope(String requestedScope, RecipeDTO recipe) {
        return trimToNull(recipe.getVersionScope()) == null ? requestedScope : recipe.getVersionScope();
    }

    private String variantKey(String versionScope) {
        String normalized = trimToNull(versionScope);
        if (normalized == null) {
            return "base";
        }
        String compact = normalized
            .toLowerCase()
            .replace(" version", "")
            .replace(" only", "")
            .replaceAll("[^a-z0-9]+", "-")
            .replaceAll("-+", "-")
            .replaceAll("^-|-$", "");
        return compact.isEmpty() ? "custom" : compact;
    }

    private String variantLabel(String versionScope) {
        String normalized = trimToNull(versionScope);
        if (normalized == null) {
            return "通用配方";
        }

        List<String> labels = new ArrayList<>();
        appendIfContains(labels, normalized, "Desktop version", "Desktop");
        appendIfContains(labels, normalized, "Console version", "Console");
        appendIfContains(labels, normalized, "Mobile version", "Mobile");
        appendIfContains(labels, normalized, "Old-gen console version", "Old-gen Console");
        appendIfContains(labels, normalized, "Nintendo 3DS version", "3DS");

        if (!labels.isEmpty()) {
            return String.join(" / ", labels);
        }
        return normalized;
    }

    private int variantOrder(String versionScope) {
        String normalized = trimToNull(versionScope);
        if (normalized == null) {
            return 0;
        }
        if (normalized.contains("Desktop version") || normalized.contains("Console version") || normalized.contains("Mobile version")) {
            return 1;
        }
        if (normalized.contains("Old-gen console version")) {
            return 2;
        }
        if (normalized.contains("Nintendo 3DS version")) {
            return 3;
        }
        return 4;
    }

    private void appendIfContains(List<String> labels, String raw, String pattern, String label) {
        if (raw.contains(pattern)) {
            labels.add(label);
        }
    }

    private List<RecipeDTO> safeRecipes(Collection<RecipeDTO> recipes) {
        return recipes == null ? Collections.emptyList() : recipes.stream().filter(Objects::nonNull).toList();
    }

    private List<RecipeIngredientDTO> safeIngredients(Collection<RecipeIngredientDTO> ingredients) {
        return ingredients == null ? Collections.emptyList() : ingredients.stream().filter(Objects::nonNull).toList();
    }

    private String referenceKey(Long itemId, String internalName) {
        if (itemId != null) {
            return "id:" + itemId;
        }
        String normalized = trimToNull(internalName);
        return normalized == null ? "unknown" : "internal:" + normalized;
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

    private String defaultIfBlank(String value, String fallback) {
        String trimmed = trimToNull(value);
        return trimmed == null ? fallback : trimmed;
    }
}

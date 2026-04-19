package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.ItemDTO;
import com.terraria.skills.dto.RecipeGroupMemberDTO;
import com.terraria.skills.dto.RecipeConditionDTO;
import com.terraria.skills.dto.RecipeDTO;
import com.terraria.skills.dto.RecipeIngredientDTO;
import com.terraria.skills.dto.RecipeTreeItemDTO;
import com.terraria.skills.dto.RecipeTreeMetaDTO;
import com.terraria.skills.dto.RecipeTreeNodeDTO;
import com.terraria.skills.dto.RecipeTreeResponseDTO;
import com.terraria.skills.dto.RecipeTreeStationDTO;
import com.terraria.skills.dto.RecipeTreeVariantDTO;
import com.terraria.skills.entity.Item;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.ItemService;
import com.terraria.skills.service.RecipeService;
import com.terraria.skills.service.RecipeTreeService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
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
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class RecipeTreeServiceImpl implements RecipeTreeService {

    private static final int DEFAULT_MAX_DEPTH = 3;
    private static final int ABSOLUTE_MAX_DEPTH = 5;
    private static final Duration TREE_CACHE_TTL = Duration.ofMinutes(5);
    private static final Duration GROUP_REFERENCE_CACHE_TTL = Duration.ofMinutes(10);

    private final ItemService itemService;
    private final RecipeService recipeService;
    private final ObjectMapper objectMapper;
    private final ItemMapper itemMapper;
    private final ConcurrentHashMap<String, TimedValue<RecipeTreeResponseDTO>> recipeTreeCache = new ConcurrentHashMap<>();
    private volatile TimedValue<Map<String, RecipeGroupReference>> recipeGroupReferenceCache;

    @Override
    public RecipeTreeResponseDTO getRecipeTreeByItemId(Long itemId, int maxDepth) {
        int resolvedMaxDepth = Math.max(1, Math.min(maxDepth <= 0 ? DEFAULT_MAX_DEPTH : maxDepth, ABSOLUTE_MAX_DEPTH));
        String cacheKey = itemId + ":" + resolvedMaxDepth;
        TimedValue<RecipeTreeResponseDTO> cached = recipeTreeCache.get(cacheKey);
        if (isValid(cached)) {
            return cached.value();
        }

        ItemDTO item = itemService.getItemById(itemId);
        if (item == null) {
            throw new IllegalArgumentException("Item not found");
        }

        List<RecipeDTO> recipes = safeRecipes(recipeService.getRecipesByResultItemId(itemId));
        Map<String, RecipeGroupReference> groupReferences = getRecipeGroupReferences();

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
            String variantScope = entry.getValue().isEmpty() ? null : entry.getValue().get(0).getVersionScope();
            RecipeTreeVariantDTO variant = new RecipeTreeVariantDTO();
            variant.setVariantKey(entry.getKey());
            variant.setVariantLabel(variantLabel(variantScope));
            variant.setVersionScope(normalizeVersionScope(variantScope));
            variant.setRecipeCount(entry.getValue().size());

            Set<String> rootPath = new LinkedHashSet<>();
            rootPath.add(referenceKey(itemId, item.getInternalName()));

            List<RecipeTreeNodeDTO> roots = new ArrayList<>();
            for (RecipeDTO recipe : entry.getValue()) {
                roots.add(buildRecipeRoot(
                    recipe,
                    recipe.getVersionScope(),
                    0,
                    resolvedMaxDepth,
                    rootPath,
                    new LinkedHashSet<>(),
                    recipeCache,
                    groupReferences
                ));
            }
            variant.setRoots(roots);
            response.getVariants().add(variant);
        }

        recipeTreeCache.put(cacheKey, new TimedValue<>(response, System.currentTimeMillis() + TREE_CACHE_TTL.toMillis()));
        return response;
    }

    @Override
    public void invalidateCaches() {
        recipeTreeCache.clear();
        recipeGroupReferenceCache = null;
    }

    private RecipeTreeNodeDTO buildRecipeRoot(
        RecipeDTO recipe,
        String variantScope,
        int depth,
        int maxDepth,
        Set<String> currentPath,
        Set<String> expandedKeys,
        Map<String, List<RecipeDTO>> recipeCache,
        Map<String, RecipeGroupReference> groupReferences
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
        List<RecipeTreeStationDTO> relationEntries = new ArrayList<>();
        relationEntries.addAll(recipe.getStations() == null ? Collections.emptyList() : recipe.getStations().stream()
            .map(this::toTreeStation)
            .toList());
        relationEntries.addAll(recipe.getConditions() == null ? Collections.emptyList() : safeConditions(recipe.getConditions()).stream()
            .map(this::toTreeCondition)
            .toList());
        root.setStations(relationEntries);

        List<RecipeTreeNodeDTO> children = new ArrayList<>();
        for (RecipeIngredientDTO ingredient : safeIngredients(recipe.getIngredients())) {
            children.add(buildIngredientNode(
                ingredient,
                variantScope,
                depth + 1,
                maxDepth,
                currentPath,
                expandedKeys,
                recipeCache,
                groupReferences
            ));
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
        Map<String, List<RecipeDTO>> recipeCache,
        Map<String, RecipeGroupReference> groupReferences
    ) {
        RecipeTreeNodeDTO node = new RecipeTreeNodeDTO();
        node.setNodeType("ingredient");
        String rawIngredientName = trimToNull(ingredient.getIngredientNameRaw());
        node.setItemId(ingredient.getIngredientItemId());
        node.setItemInternalName(firstNonBlank(ingredient.getItemInternalName(), ingredient.getIngredientInternalName()));
        node.setItemName(firstNonBlank(ingredient.getItemName(), rawIngredientName));
        node.setItemNameZh(firstNonBlank(ingredient.getItemNameZh()));
        node.setItemImage(ingredient.getItemImage());
        node.setQuantityText(trimToNull(ingredient.getQuantityText()));
        node.setQuantityMin(ingredient.getQuantityMin());
        node.setQuantityMax(ingredient.getQuantityMax());
        node.setIngredientGroupType(defaultIfBlank(ingredient.getIngredientGroupType(), "item"));
        node.setDepth(depth);

        boolean groupNode = "group".equalsIgnoreCase(node.getIngredientGroupType());
        if (groupNode) {
            String fallbackGroupLabel = firstNonBlank(rawIngredientName, ingredient.getIngredientInternalName());
            RecipeGroupReference reference = groupReferences.get(normalizeKey(fallbackGroupLabel));
            if (fallbackGroupLabel != null) {
                if (node.getItemName() == null) {
                    node.setItemName(fallbackGroupLabel);
                }
                if (node.getItemNameZh() == null) {
                    node.setItemNameZh(fallbackGroupLabel);
                }
                if (node.getItemInternalName() == null) {
                    node.setItemInternalName(fallbackGroupLabel);
                }
            }
            if (reference != null) {
                node.setItemName(firstNonBlank(
                    reference.displayNameEn(),
                    node.getItemName(),
                    reference.canonicalName(),
                    fallbackGroupLabel
                ));
                node.setItemNameZh(firstNonBlank(
                    reference.displayNameZh(),
                    node.getItemNameZh()
                ));
            }
            node.setDisplayName(firstNonBlank(
                reference == null ? null : reference.displayNameZh(),
                reference == null ? null : reference.displayNameEn(),
                node.getItemNameZh(),
                node.getItemName(),
                fallbackGroupLabel
            ));
            node.setSecondaryName(reference == null ? null : firstNonBlank(reference.displayNameEn(), reference.canonicalName()));
            node.setGroupCanonicalName(reference == null ? fallbackGroupLabel : reference.canonicalName());
            node.setGroupMemberNames(reference == null ? Collections.emptyList() : reference.groupMemberNames());
            node.setGroupMembers(reference == null ? Collections.emptyList() : reference.groupMembers());
        }
        boolean hasItemId = ingredient.getIngredientItemId() != null;
        String refKey = groupNode
            ? groupReferenceKey(rawIngredientName)
            : referenceKey(ingredient.getIngredientItemId(), node.getItemInternalName());
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
            children.add(buildRecipeRoot(
                recipe,
                chooseVariantScope(variantScope, recipe),
                depth,
                maxDepth,
                nextPath,
                nextExpandedKeys,
                recipeCache,
                groupReferences
            ));
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
        dto.setStationType(defaultIfBlank(
            station.getStationType(),
            (station.getStationId() != null || station.getStationItemId() != null) ? "station" : "environment"
        ));
        return dto;
    }

    private RecipeTreeStationDTO toTreeCondition(RecipeConditionDTO condition) {
        RecipeTreeStationDTO dto = new RecipeTreeStationDTO();
        dto.setStationInternalName(firstNonBlank(condition.getRefCode(), condition.getRefType()));
        dto.setStationName(condition.getRefNameEn());
        dto.setStationNameZh(condition.getRefNameZh());
        dto.setStationNameRaw(condition.getRefType());
        dto.setStationType("condition");
        dto.setRequirementRole(defaultIfBlank(condition.getRequirementRole(), "required"));
        dto.setNotes(trimToNull(condition.getNotes()));
        return dto;
    }

    private String chooseVariantScope(String requestedScope, RecipeDTO recipe) {
        return trimToNull(recipe.getVersionScope()) == null ? requestedScope : recipe.getVersionScope();
    }

    private String variantKey(String versionScope) {
        String normalized = normalizeVersionScope(versionScope);
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
        String normalized = normalizeVersionScope(versionScope);
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
        String normalized = normalizeVersionScope(versionScope);
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

    private String normalizeVersionScope(String versionScope) {
        String raw = trimToNull(versionScope);
        if (raw == null) {
            return null;
        }

        List<String> labels = new ArrayList<>();
        appendIfContains(labels, raw, "Desktop version", "Desktop version");
        appendIfContains(labels, raw, "电脑版", "Desktop version");
        appendIfContains(labels, raw, "Console version", "Console version");
        appendIfContains(labels, raw, "主机版", "Console version");
        appendIfContains(labels, raw, "Mobile version", "Mobile version");
        appendIfContains(labels, raw, "移动版", "Mobile version");
        appendIfContains(labels, raw, "Old-gen console version", "Old-gen console version");
        appendIfContains(labels, raw, "前代主机版", "Old-gen console version");
        appendIfContains(labels, raw, "Nintendo 3DS version", "Nintendo 3DS version");
        appendIfContains(labels, raw, "任天堂3DS版", "Nintendo 3DS version");
        appendIfContains(labels, raw, "任天堂 3DS 版", "Nintendo 3DS version");

        if (!labels.isEmpty()) {
            boolean only = raw.contains("only") || raw.contains("仅");
            return String.join(" ", labels) + (only ? " only" : "");
        }

        return raw;
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

    private List<RecipeConditionDTO> safeConditions(Collection<RecipeConditionDTO> conditions) {
        return conditions == null ? Collections.emptyList() : conditions.stream().filter(Objects::nonNull).toList();
    }

    private String referenceKey(Long itemId, String internalName) {
        if (itemId != null) {
            return "id:" + itemId;
        }
        String normalized = trimToNull(internalName);
        return normalized == null ? "unknown" : "internal:" + normalized;
    }

    private String groupReferenceKey(String rawIngredientName) {
        String normalized = trimToNull(rawIngredientName);
        return normalized == null ? "group:unknown" : "group:" + normalized;
    }

    private Map<String, RecipeGroupReference> getRecipeGroupReferences() {
        TimedValue<Map<String, RecipeGroupReference>> cached = recipeGroupReferenceCache;
        if (isValid(cached)) {
            return cached.value();
        }

        Map<String, RecipeGroupReference> loaded = loadRecipeGroupReferences();
        recipeGroupReferenceCache = new TimedValue<>(loaded, System.currentTimeMillis() + GROUP_REFERENCE_CACHE_TTL.toMillis());
        return loaded;
    }

    private Map<String, RecipeGroupReference> loadRecipeGroupReferences() {
        try {
            List<Map<String, Object>> generatedGroups = loadGroupMaps(resolveDataFile(Path.of("generated", "recipe-material-reference.json")));
            List<Map<String, Object>> overrideGroups = loadGroupMaps(resolveDataFile(Path.of("generated", "recipe-group-overrides.json")));
            Map<String, RecipeGroupReference> lookup = new LinkedHashMap<>();
            for (Map<String, Object> group : generatedGroups) {
                RecipeGroupReference reference = toRecipeGroupReference(group);
                if (reference != null) {
                    registerGroupReferenceAliases(lookup, reference);
                }
            }
            for (Map<String, Object> group : overrideGroups) {
                RecipeGroupReference reference = toRecipeGroupReference(group);
                if (reference != null) {
                    registerGroupReferenceAliases(lookup, reference);
                }
            }
            return lookup;
        } catch (Exception exception) {
            return Map.of();
        }
    }

    private void registerGroupReferenceAliases(Map<String, RecipeGroupReference> lookup, RecipeGroupReference reference) {
        if (lookup == null || reference == null) {
            return;
        }
        registerGroupReferenceAlias(lookup, reference.canonicalName(), reference);
        registerGroupReferenceAlias(lookup, reference.displayNameEn(), reference);
        registerGroupReferenceAlias(lookup, reference.displayNameZh(), reference);
    }

    private void registerGroupReferenceAlias(Map<String, RecipeGroupReference> lookup, String alias, RecipeGroupReference reference) {
        for (String aliasVariant : expandGroupAliasVariants(alias)) {
            String normalizedAlias = normalizeKey(aliasVariant);
            if (!normalizedAlias.isEmpty()) {
                lookup.put(normalizedAlias, reference);
            }
        }
    }

    private List<String> expandGroupAliasVariants(String alias) {
        String normalizedAlias = trimToNull(alias);
        if (normalizedAlias == null) {
            return List.of();
        }
        LinkedHashSet<String> aliases = new LinkedHashSet<>();
        aliases.add(normalizedAlias);
        if (normalizedAlias.contains("任意")) {
            aliases.add(normalizedAlias.replace("任意", "任何"));
        }
        if (normalizedAlias.contains("任何")) {
            aliases.add(normalizedAlias.replace("任何", "任意"));
        }
        return new ArrayList<>(aliases);
    }

    private List<Map<String, Object>> loadGroupMaps(Path path) throws Exception {
        if (path == null || !Files.exists(path)) {
            return List.of();
        }
        Map<String, Object> root = objectMapper.readValue(path.toFile(), new TypeReference<>() {});
        Object rawGroups = root.get("groups");
        if (!(rawGroups instanceof List<?> groups)) {
            return List.of();
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object rawGroup : groups) {
            if (rawGroup instanceof Map<?, ?> group) {
                Map<String, Object> entry = new LinkedHashMap<>();
                group.forEach((key, value) -> entry.put(String.valueOf(key), value));
                result.add(entry);
            }
        }
        return result;
    }

    private RecipeGroupReference toRecipeGroupReference(Map<String, Object> group) {
        String canonicalName = trimObjectToNull(group.get("canonicalName"));
        if (canonicalName == null) {
            return null;
        }
        String displayNameZh = trimObjectToNull(group.get("displayNameZh"));
        String displayNameEn = trimObjectToNull(group.get("displayNameEn"));
        List<RecipeGroupMemberDTO> members = extractGroupMembers(group.get("members"));
        return new RecipeGroupReference(
            canonicalName,
            displayNameZh,
            displayNameEn,
            members.stream().map(this::resolveMemberLabel).filter(Objects::nonNull).toList(),
            members
        );
    }

    private List<RecipeGroupMemberDTO> extractGroupMembers(Object rawMembers) {
        if (!(rawMembers instanceof List<?> members)) {
            return List.of();
        }
        List<RecipeGroupMemberDTO> rawDtos = new ArrayList<>();
        Set<String> internalNames = new LinkedHashSet<>();
        Set<String> names = new LinkedHashSet<>();
        for (Object rawMember : members) {
            if (!(rawMember instanceof Map<?, ?> member)) {
                continue;
            }
            RecipeGroupMemberDTO dto = new RecipeGroupMemberDTO();
            dto.setItemId(parseLong(member.get("itemId")));
            dto.setInternalName(trimObjectToNull(member.get("internalName")));
            dto.setName(trimObjectToNull(member.get("name")));
            dto.setNameZh(trimObjectToNull(member.get("nameZh")));
            dto.setImage(trimObjectToNull(member.get("image")));
            rawDtos.add(dto);
            if (dto.getInternalName() != null) {
                internalNames.add(dto.getInternalName());
            }
            if (dto.getName() != null) {
                names.add(dto.getName());
            }
        }
        Map<String, Item> itemsByInternalName = new LinkedHashMap<>();
        if (!internalNames.isEmpty()) {
            itemMapper.selectList(new LambdaQueryWrapper<Item>()
                    .in(Item::getInternalName, internalNames)
                    .eq(Item::getDeleted, 0))
                .forEach(item -> itemsByInternalName.putIfAbsent(normalizeKey(item.getInternalName()), item));
        }
        Map<String, Item> itemsByName = new LinkedHashMap<>();
        if (!names.isEmpty()) {
            itemMapper.selectList(new LambdaQueryWrapper<Item>()
                    .in(Item::getName, names)
                    .eq(Item::getDeleted, 0))
                .forEach(item -> itemsByName.putIfAbsent(normalizeKey(item.getName()), item));
        }

        Map<String, RecipeGroupMemberDTO> deduped = new LinkedHashMap<>();
        for (RecipeGroupMemberDTO member : rawDtos) {
            Item resolved = null;
            if (member.getInternalName() != null) {
                resolved = itemsByInternalName.get(normalizeKey(member.getInternalName()));
            }
            if (resolved == null && member.getName() != null) {
                resolved = itemsByName.get(normalizeKey(member.getName()));
            }
            RecipeGroupMemberDTO dto = new RecipeGroupMemberDTO();
            dto.setItemId(resolved == null ? member.getItemId() : resolved.getId());
            dto.setInternalName(firstNonBlank(member.getInternalName(), resolved == null ? null : resolved.getInternalName()));
            dto.setName(firstNonBlank(member.getName(), resolved == null ? null : resolved.getName()));
            dto.setNameZh(firstNonBlank(member.getNameZh(), resolved == null ? null : resolved.getNameZh()));
            dto.setImage(firstNonBlank(member.getImage(), resolved == null ? null : resolved.getImage()));
            String key = normalizeKey(firstNonBlank(dto.getInternalName(), dto.getName(), dto.getNameZh()));
            if (!key.isEmpty() && !deduped.containsKey(key)) {
                deduped.put(key, dto);
            }
        }
        return new ArrayList<>(deduped.values());
    }

    private String resolveMemberLabel(RecipeGroupMemberDTO member) {
        return firstNonBlank(member.getNameZh(), member.getName(), member.getInternalName());
    }

    private Path resolveDataFile(Path relativePath) {
        List<Path> candidates = List.of(
            Path.of(System.getProperty("user.dir")).resolve("data").resolve(relativePath).normalize(),
            Path.of(System.getProperty("user.dir")).resolve("..").resolve("data").resolve(relativePath).normalize(),
            Path.of("data").resolve(relativePath).normalize()
        );
        for (Path candidate : candidates) {
            if (Files.exists(candidate)) {
                return candidate;
            }
        }
        return null;
    }

    private boolean isValid(TimedValue<?> cached) {
        return cached != null && cached.expiresAtMillis() > System.currentTimeMillis();
    }

    private String normalizeKey(String value) {
        String text = trimToNull(value);
        return text == null ? "" : text.toLowerCase();
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String trimObjectToNull(Object value) {
        if (value == null) {
            return null;
        }
        return trimToNull(String.valueOf(value));
    }

    private Long parseLong(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return Long.valueOf(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private record RecipeGroupReference(
        String canonicalName,
        String displayNameZh,
        String displayNameEn,
        List<String> groupMemberNames,
        List<RecipeGroupMemberDTO> groupMembers
    ) {
    }

    private record TimedValue<T>(T value, long expiresAtMillis) {
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

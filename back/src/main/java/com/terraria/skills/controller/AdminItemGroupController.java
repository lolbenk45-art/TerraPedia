package com.terraria.skills.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.ItemGroupDTO;
import com.terraria.skills.dto.ItemGroupMemberDTO;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.ItemImage;
import com.terraria.skills.mapper.ItemImageMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.RecipeTreeService;
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
import java.util.Set;

@RestController
@RequestMapping("/admin/item-groups")
@RequiredArgsConstructor
@Tag(name = "AdminItemGroups", description = "Admin source-backed any item group management")
@SecurityRequirement(name = "bearerAuth")
public class AdminItemGroupController {

    private static final Duration GROUP_CACHE_TTL = Duration.ofMinutes(10);
    private static final String CENTRAL_OVERRIDE_FILE = "data/generated/item-group-overrides.json";
    private static final String RECIPE_REFERENCE_FILE = "data/generated/recipe-material-reference.json";
    private static final String RECIPE_OVERRIDE_FILE = "data/generated/recipe-group-overrides.json";

    private final ObjectMapper objectMapper;
    private final ItemMapper itemMapper;
    private final ItemImageMapper itemImageMapper;
    private final RecipeTreeService recipeTreeService;
    private volatile TimedValue<List<ItemGroupDTO>> mergedItemGroupsCache;

    @GetMapping
    @Operation(summary = "Get source-backed item groups")
    public ResponseEntity<ApiResponse<List<ItemGroupDTO>>> getItemGroups(
        @RequestParam(required = false) String keyword,
        @RequestParam(required = false) String domain
    ) {
        List<ItemGroupDTO> groups = getCachedItemGroups();
        String normalizedDomain = normalizeDomain(domain);
        if (normalizedDomain != null) {
            groups = groups.stream()
                .filter(group -> group.getDomains().stream().map(this::normalizeDomain).anyMatch(normalizedDomain::equals))
                .toList();
        }
        String normalizedKeyword = trimToNull(keyword);
        if (normalizedKeyword != null) {
            String needle = normalizedKeyword.toLowerCase();
            groups = groups.stream()
                .filter(group -> containsIgnoreCase(group.getCanonicalName(), needle)
                    || containsIgnoreCase(group.getDisplayNameEn(), needle)
                    || containsIgnoreCase(group.getDisplayNameZh(), needle)
                    || group.getAliases().stream().anyMatch(alias -> containsIgnoreCase(alias, needle)))
                .toList();
        }
        return ResponseEntity.ok(ApiResponse.success(groups));
    }

    @GetMapping("/{canonicalName}")
    @Operation(summary = "Get source-backed item group detail")
    public ResponseEntity<ApiResponse<ItemGroupDTO>> getItemGroup(@PathVariable("canonicalName") String canonicalName) {
        ItemGroupDTO group = findGroup(getCachedItemGroups(), canonicalName);
        if (group == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Item group not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(group));
    }

    @PostMapping
    @Operation(summary = "Create source-backed item group override")
    public ResponseEntity<ApiResponse<ItemGroupDTO>> createItemGroup(@RequestBody ItemGroupDTO request) {
        try {
            ItemGroupDTO normalized = normalizeGroup(request, true, true);
            if (findGroup(getCachedItemGroups(), normalized.getCanonicalName()) != null) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "Item group already exists"));
            }
            validateCentralRecipeGroupBoundary(normalized);
            List<ItemGroupDTO> overrides = new ArrayList<>(loadCentralOverrideGroups());
            overrides.add(normalized);
            writeCentralOverrideGroups(overrides);
            invalidateItemGroupSnapshot();
            recipeTreeService.invalidateCaches();
            return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(enrichGroupMembers(asCentralOverride(normalized)), "Item group created"));
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, exception.getMessage()));
        }
    }

    @PutMapping("/{canonicalName}")
    @Operation(summary = "Update source-backed item group override")
    public ResponseEntity<ApiResponse<ItemGroupDTO>> updateItemGroup(
        @PathVariable("canonicalName") String canonicalName,
        @RequestBody ItemGroupDTO request
    ) {
        try {
            ItemGroupDTO existing = findGroup(getCachedItemGroups(), canonicalName);
            if (existing == null) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Item group not found"));
            }
            ItemGroupDTO normalized = normalizeGroup(request, false, true);
            normalized.setCanonicalName(existing.getCanonicalName());
            validateCentralRecipeGroupBoundary(normalized);

            List<ItemGroupDTO> overrides = new ArrayList<>(loadCentralOverrideGroups());
            boolean replaced = false;
            for (int index = 0; index < overrides.size(); index += 1) {
                if (normalizeKey(overrides.get(index).getCanonicalName()).equals(normalizeKey(existing.getCanonicalName()))) {
                    overrides.set(index, normalized);
                    replaced = true;
                    break;
                }
            }
            if (!replaced) {
                overrides.add(normalized);
            }
            writeCentralOverrideGroups(overrides);
            invalidateItemGroupSnapshot();
            recipeTreeService.invalidateCaches();
            return ResponseEntity.ok(ApiResponse.success(enrichGroupMembers(asCentralOverride(normalized)), "Item group updated"));
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, exception.getMessage()));
        }
    }

    @DeleteMapping("/{canonicalName}")
    @Operation(summary = "Delete source-backed item group override")
    public ResponseEntity<ApiResponse<Void>> deleteItemGroup(@PathVariable("canonicalName") String canonicalName) {
        try {
            List<ItemGroupDTO> overrides = new ArrayList<>(loadCentralOverrideGroups());
            boolean removed = overrides.removeIf(group -> normalizeKey(group.getCanonicalName()).equals(normalizeKey(canonicalName)));
            if (!removed) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "Only central item group overrides can be deleted"));
            }
            writeCentralOverrideGroups(overrides);
            invalidateItemGroupSnapshot();
            recipeTreeService.invalidateCaches();
            return ResponseEntity.ok(ApiResponse.success(null, "Item group deleted"));
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, exception.getMessage()));
        }
    }

    private List<ItemGroupDTO> getCachedItemGroups() {
        TimedValue<List<ItemGroupDTO>> cached = mergedItemGroupsCache;
        if (isValid(cached)) {
            return cached.value();
        }
        List<ItemGroupDTO> groups = loadMergedItemGroups();
        mergedItemGroupsCache = new TimedValue<>(groups, System.currentTimeMillis() + GROUP_CACHE_TTL.toMillis());
        return groups;
    }

    private List<ItemGroupDTO> loadMergedItemGroups() {
        Map<String, ItemGroupDTO> merged = new LinkedHashMap<>();
        for (ItemGroupDTO group : loadRecipeReferenceGroups()) {
            merged.put(normalizeKey(group.getCanonicalName()), group);
        }
        for (ItemGroupDTO group : loadRecipeOverrideGroups()) {
            merged.put(normalizeKey(group.getCanonicalName()), group);
        }
        for (ItemGroupDTO group : loadCentralOverrideGroups()) {
            merged.put(normalizeKey(group.getCanonicalName()), group);
        }
        return merged.values().stream()
            .map(this::enrichGroupMembers)
            .sorted(Comparator.comparing(group -> normalizeKey(group.getCanonicalName())))
            .toList();
    }

    private void validateCentralRecipeGroupBoundary(ItemGroupDTO group) {
        if (!hasRecipeDomain(group)) {
            return;
        }
        Set<String> recipeGroupKeys = collectRecipeGroupKeys();
        for (String key : groupIdentityKeys(group)) {
            if (recipeGroupKeys.contains(key)) {
                throw new IllegalArgumentException("recipe group names and aliases must be maintained through recipe group overrides");
            }
        }
    }

    private Set<String> collectRecipeGroupKeys() {
        Set<String> keys = new LinkedHashSet<>();
        for (ItemGroupDTO group : loadRecipeReferenceGroups()) {
            keys.addAll(groupIdentityKeys(group));
        }
        for (ItemGroupDTO group : loadRecipeOverrideGroups()) {
            keys.addAll(groupIdentityKeys(group));
        }
        return keys;
    }

    private Set<String> groupIdentityKeys(ItemGroupDTO group) {
        if (group == null) {
            return Collections.emptySet();
        }
        Set<String> keys = new LinkedHashSet<>();
        addGroupIdentityKey(keys, group.getCanonicalName());
        addGroupIdentityKey(keys, group.getDisplayNameEn());
        addGroupIdentityKey(keys, group.getDisplayNameZh());
        for (String alias : group.getAliases() == null ? Collections.<String>emptyList() : group.getAliases()) {
            addGroupIdentityKey(keys, alias);
        }
        return keys;
    }

    private void addGroupIdentityKey(Set<String> keys, String value) {
        String key = normalizeKey(value);
        if (!key.isEmpty()) {
            keys.add(key);
        }
    }

    private boolean hasRecipeDomain(ItemGroupDTO group) {
        if (group == null || group.getDomains() == null || group.getDomains().isEmpty()) {
            return true;
        }
        return group.getDomains().stream()
            .map(this::normalizeDomain)
            .anyMatch(value -> "recipe".equals(value) || "recipe_material".equals(value) || "crafting".equals(value));
    }

    private List<ItemGroupDTO> loadRecipeReferenceGroups() {
        Path path = resolveDataFile(Path.of("generated", "recipe-material-reference.json"));
        Map<String, Object> root = readRoot(path);
        List<ItemGroupDTO> groups = readGroups(root.get("groups"), List.of("recipe"));
        String sourceType = trimObjectToNull(root.get("sourceType"));
        String generatedAt = trimObjectToNull(root.get("generatedAt"));
        List<String> sourceUrls = readStringList(root.get("sourceUrls"));
        for (ItemGroupDTO group : groups) {
            group.setSourceKind("generated_recipe_reference");
            group.setSourceProvider(sourceType != null && sourceType.startsWith("wiki_gg") ? "wiki_gg" : sourceType);
            group.setSourceLabel(sourceType);
            group.setSourceUpdatedAt(generatedAt);
            group.setSourceUrls(sourceUrls);
            group.setSourceFile(RECIPE_REFERENCE_FILE);
            group.setManualOnly(false);
        }
        return groups;
    }

    private List<ItemGroupDTO> loadRecipeOverrideGroups() {
        Path path = resolveDataFile(Path.of("generated", "recipe-group-overrides.json"));
        List<ItemGroupDTO> groups = readGroups(readRoot(path).get("groups"), List.of("recipe"));
        for (ItemGroupDTO group : groups) {
            group.setSourceKind("recipe_group_override");
            group.setSourceProvider(firstNonBlank(group.getSourceProvider(), "local_override"));
            group.setSourceFile(RECIPE_OVERRIDE_FILE);
            group.setManualOnly(true);
        }
        return groups;
    }

    private List<ItemGroupDTO> loadCentralOverrideGroups() {
        Path path = resolveDataFile(Path.of("generated", "item-group-overrides.json"));
        List<ItemGroupDTO> groups = readGroups(readRootStrict(path, CENTRAL_OVERRIDE_FILE).get("groups"), List.of("recipe"));
        return groups.stream()
            .map(this::asCentralOverride)
            .toList();
    }

    private Map<String, Object> readRoot(Path path) {
        if (path == null || !Files.exists(path)) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(path.toFile(), new TypeReference<>() {});
        } catch (Exception exception) {
            return Map.of();
        }
    }

    private Map<String, Object> readRootStrict(Path path, String label) {
        if (path == null || !Files.exists(path)) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(path.toFile(), new TypeReference<>() {});
        } catch (Exception exception) {
            throw new IllegalArgumentException("Invalid item group source file: " + label);
        }
    }

    private List<ItemGroupDTO> readGroups(Object rawGroups, List<String> defaultDomains) {
        if (!(rawGroups instanceof List<?> rawList)) {
            return Collections.emptyList();
        }
        List<ItemGroupDTO> groups = new ArrayList<>();
        for (Object rawGroup : rawList) {
            if (!(rawGroup instanceof Map<?, ?> groupMap)) {
                continue;
            }
            ItemGroupDTO dto = new ItemGroupDTO();
            dto.setCanonicalName(trimObjectToNull(groupMap.get("canonicalName")));
            dto.setDisplayNameEn(trimObjectToNull(groupMap.get("displayNameEn")));
            dto.setDisplayNameZh(trimObjectToNull(groupMap.get("displayNameZh")));
            dto.setAliases(readStringList(groupMap.get("aliases")));
            dto.setDomains(readStringList(groupMap.get("domains")));
            dto.setSourceKind(trimObjectToNull(groupMap.get("sourceKind")));
            dto.setSourceProvider(trimObjectToNull(groupMap.get("sourceProvider")));
            dto.setSourcePage(trimObjectToNull(groupMap.get("sourcePage")));
            dto.setSourceRevisionTimestamp(trimObjectToNull(groupMap.get("sourceRevisionTimestamp")));
            dto.setSourceUpdatedAt(trimObjectToNull(groupMap.get("sourceUpdatedAt")));
            dto.setSourceLabel(trimObjectToNull(groupMap.get("sourceLabel")));
            dto.setSourceFile(trimObjectToNull(groupMap.get("sourceFile")));
            dto.setSourceUrls(readStringList(groupMap.get("sourceUrls")));
            dto.setManualOnly(Boolean.TRUE.equals(groupMap.get("manualOnly")));
            dto.setMembers(extractMembers(groupMap.get("members")));
            if (dto.getDomains().isEmpty()) {
                dto.setDomains(defaultDomains);
            }
            if (dto.getCanonicalName() != null) {
                groups.add(normalizeGroup(dto, false, false));
            }
        }
        return groups;
    }

    private List<ItemGroupMemberDTO> extractMembers(Object rawMembers) {
        if (!(rawMembers instanceof List<?> members)) {
            return Collections.emptyList();
        }
        List<ItemGroupMemberDTO> result = new ArrayList<>();
        for (Object rawMember : members) {
            if (!(rawMember instanceof Map<?, ?> memberMap)) {
                continue;
            }
            ItemGroupMemberDTO dto = new ItemGroupMemberDTO();
            dto.setItemId(parseLong(memberMap.get("itemId")));
            dto.setInternalName(trimObjectToNull(memberMap.get("internalName")));
            dto.setName(trimObjectToNull(memberMap.get("name")));
            dto.setNameZh(trimObjectToNull(memberMap.get("nameZh")));
            dto.setImage(trimObjectToNull(memberMap.get("image")));
            dto.setResolved(readBoolean(memberMap.get("resolved")));
            dto.setResolutionStatus(trimObjectToNull(memberMap.get("resolutionStatus")));
            dto.setResolutionReason(trimObjectToNull(memberMap.get("resolutionReason")));
            result.add(dto);
        }
        return result;
    }

    private ItemGroupDTO normalizeGroup(ItemGroupDTO request, boolean canonicalNameRequired, boolean sourceRequired) {
        ItemGroupDTO normalized = new ItemGroupDTO();
        normalized.setCanonicalName(trimToNull(request == null ? null : request.getCanonicalName()));
        normalized.setDisplayNameEn(firstNonBlank(request == null ? null : request.getDisplayNameEn(), normalized.getCanonicalName()));
        normalized.setDisplayNameZh(trimToNull(request == null ? null : request.getDisplayNameZh()));
        normalized.setAliases(normalizeStringList(request == null ? null : request.getAliases()));
        normalized.setDomains(normalizeDomains(request == null ? null : request.getDomains()));
        normalized.setSourceKind(firstNonBlank(request == null ? null : request.getSourceKind(), "manual_wiki_source"));
        normalized.setSourceProvider(trimToNull(request == null ? null : request.getSourceProvider()));
        normalized.setSourcePage(trimToNull(request == null ? null : request.getSourcePage()));
        normalized.setSourceRevisionTimestamp(trimToNull(request == null ? null : request.getSourceRevisionTimestamp()));
        normalized.setSourceUpdatedAt(trimToNull(request == null ? null : request.getSourceUpdatedAt()));
        normalized.setSourceLabel(trimToNull(request == null ? null : request.getSourceLabel()));
        normalized.setSourceFile(trimToNull(request == null ? null : request.getSourceFile()));
        normalized.setSourceUrls(normalizeStringList(request == null ? null : request.getSourceUrls()));
        normalized.setManualOnly(request != null && request.isManualOnly());
        normalized.setMembers(normalizeMembers(request == null ? Collections.emptyList() : request.getMembers()));
        if (canonicalNameRequired && normalized.getCanonicalName() == null) {
            throw new IllegalArgumentException("canonicalName is required");
        }
        if (normalized.getMembers().isEmpty()) {
            throw new IllegalArgumentException("At least one member is required");
        }
        if (sourceRequired && trimToNull(normalized.getSourceProvider()) == null) {
            throw new IllegalArgumentException("sourceProvider is required");
        }
        if (
            sourceRequired
            && trimToNull(normalized.getSourcePage()) == null
            && normalized.getSourceUrls().isEmpty()
            && trimToNull(normalized.getSourceFile()) == null
        ) {
            throw new IllegalArgumentException("At least one source page, URL, or file is required");
        }
        if (normalized.getSourcePage() != null && !normalized.getSourceUrls().contains(normalized.getSourcePage())) {
            normalized.getSourceUrls().add(0, normalized.getSourcePage());
        }
        return normalized;
    }

    private List<ItemGroupMemberDTO> normalizeMembers(Collection<ItemGroupMemberDTO> members) {
        Map<String, ItemGroupMemberDTO> deduped = new LinkedHashMap<>();
        for (ItemGroupMemberDTO member : members == null ? Collections.<ItemGroupMemberDTO>emptyList() : members) {
            ItemGroupMemberDTO normalized = new ItemGroupMemberDTO();
            normalized.setItemId(member == null ? null : member.getItemId());
            normalized.setInternalName(trimToNull(member == null ? null : member.getInternalName()));
            normalized.setName(trimToNull(member == null ? null : member.getName()));
            normalized.setNameZh(trimToNull(member == null ? null : member.getNameZh()));
            normalized.setImage(trimToNull(member == null ? null : member.getImage()));
            String key = firstNonBlank(normalized.getInternalName(), normalized.getName(), normalized.getNameZh());
            if (key == null) {
                continue;
            }
            deduped.putIfAbsent(normalizeKey(key), normalized);
        }
        return new ArrayList<>(deduped.values());
    }

    private ItemGroupDTO enrichGroupMembers(ItemGroupDTO group) {
        ItemGroupDTO enriched = copyGroup(group);
        List<ItemGroupMemberDTO> members = new ArrayList<>(group.getMembers() == null ? Collections.emptyList() : group.getMembers());
        Set<Long> itemIds = new LinkedHashSet<>();
        Set<String> internalNames = new LinkedHashSet<>();
        Set<String> names = new LinkedHashSet<>();
        for (ItemGroupMemberDTO member : members) {
            Long itemId = member.getItemId();
            String internalName = trimToNull(member.getInternalName());
            String name = trimToNull(member.getName());
            if (itemId != null) {
                itemIds.add(itemId);
            }
            if (internalName != null) {
                internalNames.add(internalName);
            }
            if (name != null) {
                names.add(name);
            }
        }

        Map<Long, Item> itemsById = new LinkedHashMap<>();
        if (!itemIds.isEmpty()) {
            itemMapper.selectList(new LambdaQueryWrapper<Item>()
                    .in(Item::getId, itemIds)
                    .eq(Item::getDeleted, 0))
                .forEach(item -> itemsById.putIfAbsent(item.getId(), item));
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

        Set<Long> resolvedItemIds = new LinkedHashSet<>();
        itemsById.values().forEach(item -> resolvedItemIds.add(item.getId()));
        itemsByInternalName.values().forEach(item -> resolvedItemIds.add(item.getId()));
        itemsByName.values().forEach(item -> resolvedItemIds.add(item.getId()));
        Map<Long, String> itemImagesByItemId = loadPreferredItemImages(resolvedItemIds);

        List<ItemGroupMemberDTO> enrichedMembers = new ArrayList<>();
        for (ItemGroupMemberDTO member : members) {
            Item resolved = null;
            Long itemId = member.getItemId();
            String internalName = trimToNull(member.getInternalName());
            String name = trimToNull(member.getName());
            if (itemId != null) {
                resolved = itemsById.get(itemId);
            }
            if (resolved == null && internalName != null) {
                resolved = itemsByInternalName.get(normalizeKey(internalName));
            }
            if (resolved == null && name != null) {
                resolved = itemsByName.get(normalizeKey(name));
            }
            ItemGroupMemberDTO next = new ItemGroupMemberDTO();
            next.setItemId(resolved == null ? member.getItemId() : resolved.getId());
            next.setInternalName(firstNonBlank(internalName, resolved == null ? null : resolved.getInternalName()));
            next.setName(firstNonBlank(name, resolved == null ? null : resolved.getName()));
            next.setNameZh(firstNonBlank(trimToNull(member.getNameZh()), resolved == null ? null : resolved.getNameZh()));
            next.setImage(firstNonBlank(
                trimToNull(member.getImage()),
                resolved == null ? null : trimToNull(resolved.getImage()),
                resolved == null ? null : itemImagesByItemId.get(resolved.getId())
            ));
            next.setResolved(resolved != null);
            next.setResolutionStatus(resolved == null ? "unresolved" : "resolved");
            next.setResolutionReason(resolveMemberReason(resolved, itemId, internalName, name));
            enrichedMembers.add(next);
        }
        enriched.setMembers(enrichedMembers);
        return enriched;
    }

    private Map<Long, String> loadPreferredItemImages(Collection<Long> itemIds) {
        if (itemIds == null || itemIds.isEmpty()) {
            return Collections.emptyMap();
        }
        Map<Long, String> imagesByItemId = new LinkedHashMap<>();
        itemImageMapper.selectList(new LambdaQueryWrapper<ItemImage>()
                .in(ItemImage::getItemId, itemIds)
                .eq(ItemImage::getDeleted, 0)
                .eq(ItemImage::getStatus, 1)
                .orderByDesc(ItemImage::getIsPrimary)
                .orderByAsc(ItemImage::getSortOrder)
                .orderByAsc(ItemImage::getId))
            .forEach(image -> {
                Long itemId = image.getItemId();
                if (itemId == null || imagesByItemId.containsKey(itemId) || !isWikiImageProvider(image.getProvider())) {
                    return;
                }
                String sourcePage = trimToNull(image.getSourcePage());
                String imageUrl = preferredImageUrl(image);
                if (sourcePage != null && imageUrl != null) {
                    imagesByItemId.put(itemId, imageUrl);
                }
            });
        return imagesByItemId;
    }

    private String preferredImageUrl(ItemImage image) {
        String originalUrl = usableImageUrl(image == null ? null : image.getOriginalUrl());
        if (originalUrl != null) {
            return originalUrl;
        }
        return usableImageUrl(image == null ? null : image.getCachedUrl());
    }

    private boolean isWikiImageProvider(String provider) {
        String normalized = normalizeKey(provider);
        return "wiki_gg".equals(normalized) || "terraria.wiki.gg".equals(normalized);
    }

    private String usableImageUrl(String value) {
        String imageUrl = trimToNull(value);
        if (imageUrl == null) {
            return null;
        }
        String normalized = imageUrl.toLowerCase();
        if (
            normalized.contains("(demo)")
            || normalized.contains("%28demo%29")
            || normalized.contains("(placed)")
            || normalized.contains("%28placed%29")
        ) {
            return null;
        }
        return imageUrl;
    }

    private String resolveMemberReason(Item resolved, Long itemId, String internalName, String name) {
        if (resolved != null) {
            return null;
        }
        if (itemId == null && internalName == null && name == null) {
            return "No lookup key available";
        }
        if (itemId != null) {
            return "No active item matched itemId, internalName, or name";
        }
        return "No active item matched internalName or name";
    }

    private ItemGroupDTO copyGroup(ItemGroupDTO group) {
        ItemGroupDTO copy = new ItemGroupDTO();
        copy.setCanonicalName(group.getCanonicalName());
        copy.setDisplayNameEn(group.getDisplayNameEn());
        copy.setDisplayNameZh(group.getDisplayNameZh());
        copy.setAliases(new ArrayList<>(group.getAliases() == null ? Collections.emptyList() : group.getAliases()));
        copy.setDomains(new ArrayList<>(group.getDomains() == null ? Collections.emptyList() : group.getDomains()));
        copy.setSourceKind(group.getSourceKind());
        copy.setSourceProvider(group.getSourceProvider());
        copy.setSourcePage(group.getSourcePage());
        copy.setSourceRevisionTimestamp(group.getSourceRevisionTimestamp());
        copy.setSourceUpdatedAt(group.getSourceUpdatedAt());
        copy.setSourceLabel(group.getSourceLabel());
        copy.setSourceFile(group.getSourceFile());
        copy.setSourceUrls(new ArrayList<>(group.getSourceUrls() == null ? Collections.emptyList() : group.getSourceUrls()));
        copy.setManualOnly(group.isManualOnly());
        copy.setMembers(new ArrayList<>(group.getMembers() == null ? Collections.emptyList() : group.getMembers()));
        return copy;
    }

    private ItemGroupDTO asCentralOverride(ItemGroupDTO group) {
        ItemGroupDTO copy = copyGroup(group);
        copy.setSourceKind(firstNonBlank(copy.getSourceKind(), "manual_wiki_source"));
        copy.setSourceProvider(firstNonBlank(copy.getSourceProvider(), "manual"));
        copy.setSourceFile(CENTRAL_OVERRIDE_FILE);
        copy.setManualOnly(true);
        return copy;
    }

    private void writeCentralOverrideGroups(List<ItemGroupDTO> groups) {
        Path outputPath = resolveWritableDataFile(Path.of("generated", "item-group-overrides.json"));
        List<ItemGroupDTO> normalized = groups.stream()
            .map(group -> normalizeGroup(group, false, false))
            .sorted(Comparator.comparing(group -> normalizeKey(group.getCanonicalName())))
            .toList();
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("schemaVersion", "1.0.0");
        root.put("updatedAt", LocalDateTime.now().toString());
        root.put("groups", normalized);
        try {
            Files.createDirectories(outputPath.getParent());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(outputPath.toFile(), root);
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to write item group overrides", exception);
        }
    }

    private ItemGroupDTO findGroup(List<ItemGroupDTO> groups, String canonicalName) {
        String normalizedKey = normalizeKey(canonicalName);
        return groups.stream()
            .filter(group -> normalizeKey(group.getCanonicalName()).equals(normalizedKey))
            .findFirst()
            .orElse(null);
    }

    private List<String> readStringList(Object value) {
        if (!(value instanceof List<?> list)) {
            return new ArrayList<>();
        }
        return normalizeStringList(list.stream().map(entry -> entry == null ? null : String.valueOf(entry)).toList());
    }

    private List<String> normalizeStringList(Collection<String> values) {
        LinkedHashSet<String> result = new LinkedHashSet<>();
        for (String value : values == null ? Collections.<String>emptyList() : values) {
            String trimmed = trimToNull(value);
            if (trimmed != null) {
                result.add(trimmed);
            }
        }
        return new ArrayList<>(result);
    }

    private List<String> normalizeDomains(Collection<String> domains) {
        List<String> normalized = normalizeStringList(domains).stream()
            .map(this::normalizeDomain)
            .filter(value -> value != null)
            .toList();
        return normalized.isEmpty() ? new ArrayList<>(List.of("recipe")) : new ArrayList<>(normalized);
    }

    private String normalizeDomain(String value) {
        String text = trimToNull(value);
        return text == null ? null : text.toLowerCase().replace('-', '_');
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
        return candidates.get(0);
    }

    private Path resolveWritableDataFile(Path relativePath) {
        List<Path> candidates = List.of(
            Path.of(System.getProperty("user.dir")).resolve("data").resolve(relativePath).normalize(),
            Path.of(System.getProperty("user.dir")).resolve("..").resolve("data").resolve(relativePath).normalize(),
            Path.of("data").resolve(relativePath).normalize()
        );
        for (Path candidate : candidates) {
            Path parent = candidate.getParent();
            if (parent != null && Files.exists(parent)) {
                return candidate;
            }
        }
        return candidates.get(0);
    }

    private boolean isValid(TimedValue<?> cached) {
        return cached != null && cached.expiresAtMillis() > System.currentTimeMillis();
    }

    private void invalidateItemGroupSnapshot() {
        mergedItemGroupsCache = null;
    }

    private String normalizeKey(String value) {
        String text = trimToNull(value);
        return text == null ? "" : text.toLowerCase();
    }

    private boolean containsIgnoreCase(String value, String needle) {
        return value != null && value.toLowerCase().contains(needle);
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

    private Boolean readBoolean(Object value) {
        if (value instanceof Boolean booleanValue) {
            return booleanValue;
        }
        String text = trimObjectToNull(value);
        return text == null ? null : Boolean.valueOf(text);
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

    private record TimedValue<T>(T value, long expiresAtMillis) {
    }
}

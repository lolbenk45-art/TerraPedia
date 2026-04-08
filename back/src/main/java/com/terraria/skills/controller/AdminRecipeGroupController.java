package com.terraria.skills.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.RecipeGroupDTO;
import com.terraria.skills.dto.RecipeGroupMemberDTO;
import com.terraria.skills.entity.Item;
import com.terraria.skills.mapper.ItemMapper;
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
@RequestMapping("/admin/recipe-groups")
@RequiredArgsConstructor
@Tag(name = "AdminRecipeGroups", description = "Admin recipe group management")
@SecurityRequirement(name = "bearerAuth")
public class AdminRecipeGroupController {

    private final ObjectMapper objectMapper;
    private final ItemMapper itemMapper;

    @GetMapping
    @Operation(summary = "Get recipe groups")
    public ResponseEntity<ApiResponse<List<RecipeGroupDTO>>> getRecipeGroups(
        @RequestParam(required = false) String keyword
    ) {
        List<RecipeGroupDTO> groups = loadMergedRecipeGroups();
        String normalizedKeyword = trimToNull(keyword);
        if (normalizedKeyword != null) {
            String needle = normalizedKeyword.toLowerCase();
            groups = groups.stream()
                .filter(group -> containsIgnoreCase(group.getCanonicalName(), needle)
                    || containsIgnoreCase(group.getDisplayNameEn(), needle)
                    || containsIgnoreCase(group.getDisplayNameZh(), needle))
                .toList();
        }
        return ResponseEntity.ok(ApiResponse.success(groups));
    }

    @GetMapping("/{canonicalName}")
    @Operation(summary = "Get recipe group detail")
    public ResponseEntity<ApiResponse<RecipeGroupDTO>> getRecipeGroup(@PathVariable("canonicalName") String canonicalName) {
        RecipeGroupDTO group = findGroup(loadMergedRecipeGroups(), canonicalName);
        if (group == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Recipe group not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(group));
    }

    @PostMapping
    @Operation(summary = "Create recipe group")
    public ResponseEntity<ApiResponse<RecipeGroupDTO>> createRecipeGroup(@RequestBody RecipeGroupDTO request) {
        try {
            RecipeGroupDTO normalized = normalizeGroup(request, true);
            List<RecipeGroupDTO> groups = new ArrayList<>(loadMergedRecipeGroups());
            if (findGroup(groups, normalized.getCanonicalName()) != null) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "Recipe group already exists"));
            }
            groups.add(normalized);
            groups.sort(Comparator.comparing(group -> normalizeKey(group.getCanonicalName())));
            writeOverrideGroups(groups);
            return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(normalized, "Recipe group created"));
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, exception.getMessage()));
        }
    }

    @PutMapping("/{canonicalName}")
    @Operation(summary = "Update recipe group")
    public ResponseEntity<ApiResponse<RecipeGroupDTO>> updateRecipeGroup(
        @PathVariable("canonicalName") String canonicalName,
        @RequestBody RecipeGroupDTO request
    ) {
        try {
            List<RecipeGroupDTO> groups = new ArrayList<>(loadMergedRecipeGroups());
            RecipeGroupDTO existing = findGroup(groups, canonicalName);
            if (existing == null) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Recipe group not found"));
            }
            RecipeGroupDTO normalized = normalizeGroup(request, false);
            normalized.setCanonicalName(existing.getCanonicalName());

            for (int index = 0; index < groups.size(); index += 1) {
                if (normalizeKey(groups.get(index).getCanonicalName()).equals(normalizeKey(existing.getCanonicalName()))) {
                    groups.set(index, normalized);
                    break;
                }
            }
            groups.sort(Comparator.comparing(group -> normalizeKey(group.getCanonicalName())));
            writeOverrideGroups(groups);
            return ResponseEntity.ok(ApiResponse.success(normalized, "Recipe group updated"));
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, exception.getMessage()));
        }
    }

    @DeleteMapping("/{canonicalName}")
    @Operation(summary = "Delete recipe group")
    public ResponseEntity<ApiResponse<Void>> deleteRecipeGroup(@PathVariable("canonicalName") String canonicalName) {
        List<RecipeGroupDTO> groups = new ArrayList<>(loadMergedRecipeGroups());
        RecipeGroupDTO existing = findGroup(groups, canonicalName);
        if (existing == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Recipe group not found"));
        }
        groups.removeIf(group -> normalizeKey(group.getCanonicalName()).equals(normalizeKey(canonicalName)));
        writeOverrideGroups(groups);
        return ResponseEntity.ok(ApiResponse.success(null, "Recipe group deleted"));
    }

    private List<RecipeGroupDTO> loadMergedRecipeGroups() {
        List<RecipeGroupDTO> generated = readGroupFile(resolveDataFile(Path.of("generated", "recipe-material-reference.json")), true);
        List<RecipeGroupDTO> overrides = readGroupFile(resolveDataFile(Path.of("generated", "recipe-group-overrides.json")), false);
        Map<String, RecipeGroupDTO> merged = new LinkedHashMap<>();
        for (RecipeGroupDTO group : generated) {
            merged.put(normalizeKey(group.getCanonicalName()), group);
        }
        for (RecipeGroupDTO group : overrides) {
            merged.put(normalizeKey(group.getCanonicalName()), group);
        }
        return merged.values().stream()
            .map(this::enrichGroupMembers)
            .sorted(Comparator.comparing(group -> normalizeKey(group.getCanonicalName())))
            .toList();
    }

    private List<RecipeGroupDTO> readGroupFile(Path path, boolean readFromReferenceRoot) {
        if (path == null || !Files.exists(path)) {
            return Collections.emptyList();
        }
        try {
            Map<String, Object> root = objectMapper.readValue(path.toFile(), new TypeReference<>() {});
            Object rawGroups = readFromReferenceRoot ? root.get("groups") : root.get("groups");
            if (!(rawGroups instanceof List<?> rawList)) {
                return Collections.emptyList();
            }
            List<RecipeGroupDTO> groups = new ArrayList<>();
            for (Object rawGroup : rawList) {
                if (!(rawGroup instanceof Map<?, ?> groupMap)) {
                    continue;
                }
                RecipeGroupDTO dto = new RecipeGroupDTO();
                dto.setCanonicalName(trimObjectToNull(groupMap.get("canonicalName")));
                dto.setDisplayNameEn(firstNonBlank(
                    trimObjectToNull(groupMap.get("displayNameEn")),
                    trimObjectToNull(groupMap.get("canonicalName"))
                ));
                dto.setDisplayNameZh(trimObjectToNull(groupMap.get("displayNameZh")));
                dto.setMembers(extractMembers(groupMap.get("members")));
                if (dto.getCanonicalName() != null) {
                    groups.add(normalizeGroup(dto, false));
                }
            }
            return groups;
        } catch (Exception exception) {
            return Collections.emptyList();
        }
    }

    private List<RecipeGroupMemberDTO> extractMembers(Object rawMembers) {
        if (!(rawMembers instanceof List<?> members)) {
            return Collections.emptyList();
        }
        List<RecipeGroupMemberDTO> result = new ArrayList<>();
        for (Object rawMember : members) {
            if (!(rawMember instanceof Map<?, ?> memberMap)) {
                continue;
            }
            RecipeGroupMemberDTO dto = new RecipeGroupMemberDTO();
            dto.setItemId(parseLong(memberMap.get("itemId")));
            dto.setInternalName(trimObjectToNull(memberMap.get("internalName")));
            dto.setName(trimObjectToNull(memberMap.get("name")));
            dto.setNameZh(trimObjectToNull(memberMap.get("nameZh")));
            dto.setImage(trimObjectToNull(memberMap.get("image")));
            result.add(dto);
        }
        return result;
    }

    private RecipeGroupDTO normalizeGroup(RecipeGroupDTO request, boolean canonicalNameRequired) {
        RecipeGroupDTO normalized = new RecipeGroupDTO();
        normalized.setCanonicalName(trimToNull(request == null ? null : request.getCanonicalName()));
        normalized.setDisplayNameEn(firstNonBlank(
            trimToNull(request == null ? null : request.getDisplayNameEn()),
            normalized.getCanonicalName()
        ));
        normalized.setDisplayNameZh(trimToNull(request == null ? null : request.getDisplayNameZh()));
        normalized.setMembers(normalizeMembers(request == null ? Collections.emptyList() : request.getMembers()));
        if (canonicalNameRequired && normalized.getCanonicalName() == null) {
            throw new IllegalArgumentException("canonicalName is required");
        }
        if (normalized.getMembers().isEmpty()) {
            throw new IllegalArgumentException("At least one member is required");
        }
        return normalized;
    }

    private List<RecipeGroupMemberDTO> normalizeMembers(Collection<RecipeGroupMemberDTO> members) {
        Map<String, RecipeGroupMemberDTO> deduped = new LinkedHashMap<>();
        for (RecipeGroupMemberDTO member : members == null ? Collections.<RecipeGroupMemberDTO>emptyList() : members) {
            RecipeGroupMemberDTO normalized = new RecipeGroupMemberDTO();
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

    private RecipeGroupDTO enrichGroupMembers(RecipeGroupDTO group) {
        RecipeGroupDTO enriched = new RecipeGroupDTO();
        enriched.setCanonicalName(group.getCanonicalName());
        enriched.setDisplayNameEn(group.getDisplayNameEn());
        enriched.setDisplayNameZh(group.getDisplayNameZh());

        List<RecipeGroupMemberDTO> members = new ArrayList<>(group.getMembers() == null ? Collections.emptyList() : group.getMembers());
        Set<String> internalNames = new LinkedHashSet<>();
        Set<String> names = new LinkedHashSet<>();
        for (RecipeGroupMemberDTO member : members) {
            String internalName = trimToNull(member.getInternalName());
            String name = trimToNull(member.getName());
            if (internalName != null) {
                internalNames.add(internalName);
            }
            if (name != null) {
                names.add(name);
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

        List<RecipeGroupMemberDTO> enrichedMembers = new ArrayList<>();
        for (RecipeGroupMemberDTO member : members) {
            Item resolved = null;
            String internalName = trimToNull(member.getInternalName());
            String name = trimToNull(member.getName());
            if (internalName != null) {
                resolved = itemsByInternalName.get(normalizeKey(internalName));
            }
            if (resolved == null && name != null) {
                resolved = itemsByName.get(normalizeKey(name));
            }
            RecipeGroupMemberDTO next = new RecipeGroupMemberDTO();
            next.setItemId(resolved == null ? member.getItemId() : resolved.getId());
            next.setInternalName(firstNonBlank(internalName, resolved == null ? null : resolved.getInternalName()));
            next.setName(firstNonBlank(name, resolved == null ? null : resolved.getName()));
            next.setNameZh(firstNonBlank(trimToNull(member.getNameZh()), resolved == null ? null : resolved.getNameZh()));
            next.setImage(firstNonBlank(trimToNull(member.getImage()), resolved == null ? null : resolved.getImage()));
            enrichedMembers.add(next);
        }
        enriched.setMembers(enrichedMembers);
        return enriched;
    }

    private void writeOverrideGroups(List<RecipeGroupDTO> groups) {
        Path outputPath = resolveWritableDataFile(Path.of("generated", "recipe-group-overrides.json"));
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("schemaVersion", "1.0.0");
        root.put("updatedAt", LocalDateTime.now().toString());
        root.put("groups", groups);
        try {
            Files.createDirectories(outputPath.getParent());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(outputPath.toFile(), root);
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to write recipe group overrides", exception);
        }
    }

    private RecipeGroupDTO findGroup(List<RecipeGroupDTO> groups, String canonicalName) {
        String normalizedKey = normalizeKey(canonicalName);
        return groups.stream()
            .filter(group -> normalizeKey(group.getCanonicalName()).equals(normalizedKey))
            .findFirst()
            .orElse(null);
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
}

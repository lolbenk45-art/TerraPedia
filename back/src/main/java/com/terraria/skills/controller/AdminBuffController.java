package com.terraria.skills.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.entity.Buff;
import com.terraria.skills.mapper.BuffMapper;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
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
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/admin/buffs")
@RequiredArgsConstructor
@Tag(name = "AdminBuffs", description = "Admin buff management")
@SecurityRequirement(name = "bearerAuth")
public class AdminBuffController {

    private static final String RELATION_DATABASE_NAME = "terria_v1_relation";

    private static final Pattern DURATION_TEMPLATE_PATTERN = Pattern.compile(
        "\\{\\{\\s*duration\\s*\\|\\s*(?:rawseconds\\s*=\\s*)?([^{}|]+?)\\s*\\}\\}",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern EMPTY_TEMPLATE_PATTERN = Pattern.compile("\\{\\{\\s*[^{}|]+\\s*\\|\\s*\\}\\}", Pattern.CASE_INSENSITIVE);
    private static final Pattern HTML_COMMENT_PATTERN = Pattern.compile("<!--.*?-->", Pattern.DOTALL);
    private static final Pattern HTML_BREAK_PATTERN = Pattern.compile("(?i)<br\\s*/?>");
    private static final Pattern GAME_TEXT_TEMPLATE_PATTERN = Pattern.compile("\\{\\{\\s*gameText\\s*\\|\\s*[^{}]*?\\s*\\}\\}", Pattern.CASE_INSENSITIVE);
    private static final Pattern NOTE_TEMPLATE_PATTERN = Pattern.compile("\\{\\{\\s*note\\s*\\|\\s*[^{}]*?\\s*\\}\\}", Pattern.CASE_INSENSITIVE);
    private static final Pattern EXPERT_TEMPLATE_PATTERN = Pattern.compile("\\{\\{\\s*expert\\s*\\|\\s*([^{}]*?)\\s*\\}\\}", Pattern.CASE_INSENSITIVE);
    private static final Pattern MASTER_TEMPLATE_PATTERN = Pattern.compile("\\{\\{\\s*master\\s*\\|\\s*([^{}]*?)\\s*\\}\\}", Pattern.CASE_INSENSITIVE);
    private static final Pattern MODES_TEMPLATE_PATTERN = Pattern.compile("\\{\\{\\s*modes\\s*\\|\\s*([^{}]*?)\\s*\\}\\}", Pattern.CASE_INSENSITIVE);
    private static final Pattern REMAINING_TEMPLATE_PATTERN = Pattern.compile("\\{\\{\\s*[^{}]*?\\s*\\}\\}", Pattern.CASE_INSENSITIVE);

    private final BuffMapper buffMapper;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbcTemplate;
    private final ManagedImageUrlPolicy managedImageUrlPolicy;

    @GetMapping
    @Operation(summary = "Get buffs")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getBuffs(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) String buffType
    ) {
        int safePage = PaginationParams.resolvePage(page);
        int safeLimit = PaginationParams.resolveLimit(limit, size, 20, 100);

        LambdaQueryWrapper<Buff> wrapper = new LambdaQueryWrapper<Buff>()
            .orderByAsc(Buff::getId);
        if (search != null && !search.isBlank()) {
            String keyword = search.trim();
            wrapper.and(w -> w.like(Buff::getInternalName, keyword)
                .or().like(Buff::getEnglishName, keyword)
                .or().like(Buff::getNameZh, keyword));
        }
        if (buffType != null && !buffType.isBlank()) {
            wrapper.eq(Buff::getBuffType, buffType.trim());
        }

        Page<Buff> mpPage = buffMapper.selectPage(new Page<>(safePage, safeLimit), wrapper);
        Pagination pagination = new Pagination(mpPage.getTotal(), (int) mpPage.getCurrent(), (int) mpPage.getSize());
        ApiResponse<List<Map<String, Object>>> response = ApiResponse.success(mpPage.getRecords().stream().map(buff -> toPayload(buff, false)).toList());
        response.setPagination(pagination);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get buff detail")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getBuffById(@PathVariable Long id) {
        Buff buff = buffMapper.selectById(id);
        if (buff == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Buff not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(toPayload(buff, true)));
    }

    @PostMapping
    @Operation(summary = "Create buff")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createBuff(@RequestBody Map<String, Object> request) {
        String internalName = trimToNull(request.get("internalName"));
        Integer sourceId = toInteger(request.get("sourceId"));
        if (internalName == null || sourceId == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "sourceId and internalName are required"));
        }

        long duplicate = buffMapper.selectCount(new LambdaQueryWrapper<Buff>()
            .and(w -> w.eq(Buff::getSourceId, sourceId).or().eq(Buff::getInternalName, internalName)));
        if (duplicate > 0) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "sourceId or internalName already exists"));
        }

        Buff buff = new Buff();
        applyFields(buff, request, true);
        buffMapper.insert(buff);
        if (request.containsKey("linkedSourceItems") || request.containsKey("sourceItemsJson")) {
            syncBuffSourceItems(buff, request);
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(toPayload(buffMapper.selectById(buff.getId()), true), "Buff created"));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update buff")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateBuff(@PathVariable Long id, @RequestBody Map<String, Object> request) {
        Buff existing = buffMapper.selectById(id);
        if (existing == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Buff not found"));
        }

        Integer nextSourceId = request.containsKey("sourceId") ? toInteger(request.get("sourceId")) : existing.getSourceId();
        String nextInternalName = request.containsKey("internalName") ? trimToNull(request.get("internalName")) : existing.getInternalName();
        if (nextSourceId == null || nextInternalName == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "sourceId and internalName are required"));
        }

        long duplicate = buffMapper.selectCount(new LambdaQueryWrapper<Buff>()
            .ne(Buff::getId, id)
            .and(w -> w.eq(Buff::getSourceId, nextSourceId).or().eq(Buff::getInternalName, nextInternalName)));
        if (duplicate > 0) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "sourceId or internalName already exists"));
        }

        applyFields(existing, request, false);
        buffMapper.updateById(existing);
        if (request.containsKey("linkedSourceItems") || request.containsKey("sourceItemsJson")) {
            syncBuffSourceItems(existing, request);
        }
        return ResponseEntity.ok(ApiResponse.success(toPayload(buffMapper.selectById(id), true), "Buff updated"));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete buff")
    public ResponseEntity<ApiResponse<Void>> deleteBuff(@PathVariable Long id) {
        Buff existing = buffMapper.selectById(id);
        if (existing == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Buff not found"));
        }
        buffMapper.deleteById(id);
        return ResponseEntity.ok(ApiResponse.success(null, "Buff deleted"));
    }

    private void applyFields(Buff buff, Map<String, Object> request, boolean creating) {
        if (creating || request.containsKey("sourceId")) buff.setSourceId(toInteger(request.get("sourceId")));
        if (creating || request.containsKey("internalName")) buff.setInternalName(trimToNull(request.get("internalName")));
        if (request.containsKey("englishName")) buff.setEnglishName(trimToNull(request.get("englishName")));
        if (request.containsKey("nameZh")) buff.setNameZh(trimToNull(request.get("nameZh")));
        if (request.containsKey("tooltipEn")) buff.setTooltipEn(trimToNull(request.get("tooltipEn")));
        if (request.containsKey("tooltipZh")) buff.setTooltipZh(trimToNull(request.get("tooltipZh")));
        if (request.containsKey("image") || request.containsKey("imagePath")) {
            String image = normalizeAssetUrl(firstNonBlank(trimToNull(request.get("image")), trimToNull(request.get("imagePath"))));
            buff.setImage(image);
            if (isManagedUrl(image)) {
                buff.setImageCachedUrl(image);
            } else {
                buff.setImageOriginalUrl(image);
            }
        }
        if (request.containsKey("imageOriginalUrl")) {
            String originalUrl = normalizeAssetUrl(trimToNull(request.get("imageOriginalUrl")));
            buff.setImageOriginalUrl(originalUrl);
            if (originalUrl != null) {
                buff.setImage(originalUrl);
            }
        }
        if (request.containsKey("imageUrl") || request.containsKey("imageCachedUrl")) {
            buff.setImageCachedUrl(normalizeAssetUrl(firstNonBlank(trimToNull(request.get("imageCachedUrl")), trimToNull(request.get("imageUrl")))));
        }
        if (request.containsKey("buffType")) buff.setBuffType(trimToNull(request.get("buffType")));
        if (request.containsKey("sourceItemCount")) buff.setSourceItemCount(toInteger(request.get("sourceItemCount")));
        if (request.containsKey("immuneNpcCount")) buff.setImmuneNpcCount(toInteger(request.get("immuneNpcCount")));
        if (request.containsKey("sourceItemsJson")) buff.setSourceItemsJson(toJsonString(request.get("sourceItemsJson")));
        if (request.containsKey("immuneNpcSampleJson")) buff.setImmuneNpcSampleJson(toJsonString(request.get("immuneNpcSampleJson")));
        if (request.containsKey("status")) buff.setStatus(toInteger(request.get("status")));

        if (creating) {
            if (buff.getStatus() == null) buff.setStatus(1);
            if (buff.getSourceItemCount() == null) buff.setSourceItemCount(0);
            if (buff.getImmuneNpcCount() == null) buff.setImmuneNpcCount(0);
            if (buff.getEnglishName() == null) buff.setEnglishName(buff.getInternalName());
        }
    }

    private Map<String, Object> toPayload(Buff buff, boolean includeLinkedItems) {
        Map<String, Object> supplement = loadBuffSupplement(buff.getInternalName());
        String immuneNpcSampleJson = firstNonBlank(buff.getImmuneNpcSampleJson(), "[]");
        ProjectionBuffEvidence projectionEvidence = includeLinkedItems ? loadProjectionBuffEvidence(buff) : ProjectionBuffEvidence.empty();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", buff.getId());
        payload.put("sourceId", buff.getSourceId());
        payload.put("internalName", buff.getInternalName());
        payload.put("englishName", firstNonBlank(buff.getEnglishName(), trimToNull(supplement.get("englishName"))));
        payload.put("nameZh", firstNonBlank(buff.getNameZh(), trimToNull(supplement.get("nameZh"))));
        String fallbackImageUrl = resolveBuffFallbackImageUrl(buff);
        String cachedImageUrl = resolveBuffCachedImageUrl(buff);
        String primaryImageUrl = firstNonBlank(cachedImageUrl, fallbackImageUrl);
        payload.put("image", fallbackImageUrl);
        payload.put("imagePath", fallbackImageUrl);
        payload.put("imageOriginalUrl", fallbackImageUrl);
        payload.put("imageCachedUrl", cachedImageUrl);
        payload.put("imageUrl", primaryImageUrl);
        payload.put("imageContentType", buff.getImageContentType());
        payload.put("imageLastVerifiedAt", buff.getImageLastVerifiedAt());
        payload.put("categoryId", null);
        payload.put("buffType", firstNonBlank(buff.getBuffType(), trimToNull(supplement.get("buffType"))));
        Integer storedSourceItemCount = buff.getSourceItemCount();
        boolean shouldResolveLinkedSourceItemCount = includeLinkedItems || storedSourceItemCount == null || storedSourceItemCount <= 0;
        List<Map<String, Object>> linkedSourceItems = shouldResolveLinkedSourceItemCount ? loadLinkedSourceItems(buff, supplement) : List.of();
        payload.put("sourceItemCount", firstNonNullInteger(
            linkedSourceItems.isEmpty() ? null : linkedSourceItems.size(),
            storedSourceItemCount,
            toInteger(supplement.get("sourceItemCount")),
            0
        ));
        payload.put("immuneNpcCount", firstNonNullInteger(buff.getImmuneNpcCount(), toInteger(supplement.get("immuneNpcCount")), 0));
        payload.put("tooltipEn", firstNonBlank(buff.getTooltipEn(), trimToNull(supplement.get("tooltipEn"))));
        payload.put("tooltipZh", firstNonBlank(buff.getTooltipZh(), trimToNull(supplement.get("tooltipZh"))));
        payload.put("sourceItemsJson", firstNonBlank(projectionEvidence.sourceItemsJson(), buff.getSourceItemsJson(), "[]"));
        payload.put("inflictingNpcsJson", firstNonBlank(projectionEvidence.inflictingNpcsJson(), "[]"));
        payload.put("immuneNpcsJson", firstNonBlank(projectionEvidence.immuneNpcsJson(), "[]"));
        payload.put("sourceEvidenceJson", firstNonBlank(projectionEvidence.sourceEvidenceJson(), "null"));
        payload.put("immuneNpcSampleJson", immuneNpcSampleJson);
        payload.put("status", firstNonNullInteger(buff.getStatus(), 1));
        payload.put("createdAt", buff.getCreatedAt());
        payload.put("updatedAt", buff.getUpdatedAt());
        if (includeLinkedItems) {
            List<Map<String, Object>> inflictingNpcSamples = loadInflictingNpcSamples(buff.getId());
            ImmuneNpcSampleResolution immuneNpcSampleResolution = loadImmuneNpcSamples(immuneNpcSampleJson);
            payload.put("linkedSourceItems", linkedSourceItems);
            payload.put("sourceItems", toObjectMapList(projectionEvidence.sourceItemsJson()));
            payload.put("inflictingNpcs", toObjectMapList(projectionEvidence.inflictingNpcsJson()));
            payload.put("immuneNpcs", toObjectMapList(projectionEvidence.immuneNpcsJson()));
            payload.put("sourceEvidence", toObjectMap(projectionEvidence.sourceEvidenceJson()));
            payload.put("immuneNpcSamples", immuneNpcSampleResolution.resolvedSamples());
            payload.put("unresolvedImmuneNpcSamples", immuneNpcSampleResolution.unresolvedSamples());
            payload.put("inflictingNpcCount", firstNonNullInteger(countInflictingNpcs(buff.getId()), inflictingNpcSamples.size()));
            payload.put("inflictingNpcSamples", inflictingNpcSamples);
        }
        return payload;
    }

    private ProjectionBuffEvidence loadProjectionBuffEvidence(Buff buff) {
        if (buff == null || jdbcTemplate == null) return ProjectionBuffEvidence.empty();
        List<Object> args = new ArrayList<>();
        String where;
        if (buff.getSourceId() != null) {
            where = "source_id = ?";
            args.add(buff.getSourceId());
        } else if (trimToNull(buff.getInternalName()) != null) {
            where = "internal_name = ?";
            args.add(buff.getInternalName());
        } else if (buff.getId() != null) {
            where = "id = ?";
            args.add(buff.getId());
        } else {
            return ProjectionBuffEvidence.empty();
        }
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                SELECT source_items_json, inflicting_npcs_json, immune_npcs_json, source_evidence_json
                FROM `%s`.`projection_buffs`
                WHERE %s
                LIMIT 1
                """.formatted(RELATION_DATABASE_NAME, where),
                args.toArray()
            );
            if (rows.isEmpty()) return ProjectionBuffEvidence.empty();
            Map<String, Object> row = rows.get(0);
            return new ProjectionBuffEvidence(
                trimToNull(row.get("source_items_json")),
                trimToNull(row.get("inflicting_npcs_json")),
                trimToNull(row.get("immune_npcs_json")),
                trimToNull(row.get("source_evidence_json"))
            );
        } catch (Exception exception) {
            return ProjectionBuffEvidence.empty();
        }
    }

    private void syncBuffSourceItems(Buff buff, Map<String, Object> request) {
        if (buff == null || buff.getId() == null) return;
        List<Map<String, Object>> normalizedItems = normalizeLinkedSourceItems(request);
        jdbcTemplate.update("DELETE FROM buff_source_items WHERE buff_id = ?", buff.getId());
        for (int index = 0; index < normalizedItems.size(); index += 1) {
            Map<String, Object> item = normalizedItems.get(index);
            jdbcTemplate.update(
                """
                INSERT INTO buff_source_items
                  (buff_id, source_item_id, source_item_internal_name, source_item_name, item_id, buff_time, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                buff.getId(),
                toInteger(item.get("sourceItemId")),
                trimToNull(item.get("internalName")),
                trimToNull(item.get("nameEn")) != null ? trimToNull(item.get("nameEn")) : trimToNull(item.get("name")),
                toLong(item.get("itemId")),
                toInteger(item.get("buffTime")),
                toInteger(item.get("sortOrder")) != null ? toInteger(item.get("sortOrder")) : index
            );
        }

        buff.setSourceItemCount(normalizedItems.size());
        buff.setSourceItemsJson(toJsonString(normalizedItems.stream().map(item -> {
            Map<String, Object> snapshot = new LinkedHashMap<>();
            snapshot.put("buffTime", item.get("buffTime"));
            snapshot.put("internalName", item.get("internalName"));
            snapshot.put("itemId", item.get("sourceItemId"));
            snapshot.put("name", trimToNull(item.get("nameEn")) != null ? item.get("nameEn") : item.get("name"));
            return snapshot;
        }).toList()));
        buffMapper.updateById(buff);
    }

    private List<Map<String, Object>> normalizeLinkedSourceItems(Map<String, Object> request) {
        Object raw = request.get("linkedSourceItems");
        if (raw == null) {
            raw = request.get("sourceItemsJson");
        }
        List<?> rawList = toObjectList(raw);
        List<Map<String, Object>> normalized = new ArrayList<>();
        for (int index = 0; index < rawList.size(); index += 1) {
            Object entryRaw = rawList.get(index);
            if (!(entryRaw instanceof Map<?, ?> entry)) continue;
            Long itemId = toLong(firstNonNull(entry, "itemId"));
            String internalName = trimToNull(firstNonNull(entry, "internalName"));
            Integer sourceItemId = toInteger(firstNonNull(entry, "sourceItemId", "itemId"));
            Map<String, Object> resolvedItem = resolveItemReference(itemId, internalName, sourceItemId);

            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("sourceItemId", firstNonNullInteger(sourceItemId, toInteger(resolvedItem.get("itemId"))));
            payload.put("itemId", toLong(resolvedItem.get("id")));
            payload.put("internalName", firstNonBlank(internalName, trimToNull(resolvedItem.get("internalName"))));
            payload.put("name", firstNonBlank(trimToNull(firstNonNull(entry, "nameZh", "name")), trimToNull(resolvedItem.get("nameZh")), trimToNull(resolvedItem.get("name"))));
            payload.put("nameEn", firstNonBlank(trimToNull(firstNonNull(entry, "nameEn")), trimToNull(resolvedItem.get("name"))));
            payload.put("nameZh", firstNonBlank(trimToNull(firstNonNull(entry, "nameZh")), trimToNull(resolvedItem.get("nameZh"))));
            payload.put("image", firstNonBlank(
                managedImageOrNull(trimToNull(firstNonNull(entry, "image"))),
                managedImageOrNull(trimToNull(resolvedItem.get("image")))
            ));
            payload.put("buffTime", toInteger(firstNonNull(entry, "buffTime")));
            payload.put("sortOrder", toInteger(firstNonNull(entry, "sortOrder")) != null ? toInteger(firstNonNull(entry, "sortOrder")) : index);
            if (payload.get("sourceItemId") == null && payload.get("itemId") == null && payload.get("internalName") == null) {
                continue;
            }
            normalized.add(payload);
        }
        normalized.sort(Comparator.comparingInt(item -> Objects.requireNonNullElse(toInteger(item.get("sortOrder")), 0)));
        return normalized;
    }

    private ImmuneNpcSampleResolution loadImmuneNpcSamples(String immuneNpcSampleJson) {
        List<Map<String, Object>> rawEntries = toObjectMapList(immuneNpcSampleJson);
        if (rawEntries.isEmpty()) {
            return new ImmuneNpcSampleResolution(List.of(), List.of());
        }

        Set<String> internalNames = new LinkedHashSet<>();
        Set<Integer> npcIds = new LinkedHashSet<>();
        Set<String> displayNames = new LinkedHashSet<>();
        for (Map<String, Object> entry : rawEntries) {
            String internalName = trimToNull(firstNonNull(entry, "internalName", "internal_name"));
            Integer npcId = toInteger(firstNonNull(entry, "npcId", "sourceId", "source_id"));
            String displayName = firstNonBlank(
                trimToNull(firstNonNull(entry, "name")),
                trimToNull(firstNonNull(entry, "nameZh"))
            );
            if (internalName != null) internalNames.add(internalName);
            if (npcId != null) npcIds.add(npcId);
            if (displayName != null) displayNames.add(displayName);
        }

        Map<String, List<Map<String, Object>>> npcRowsByInternalName = loadNpcRowsByInternalNames(internalNames);
        Map<Integer, List<Map<String, Object>>> npcRowsByNpcId = loadNpcRowsByNpcIds(npcIds);
        Map<String, List<Map<String, Object>>> npcRowsByDisplayName = loadNpcRowsByDisplayNames(displayNames);

        Set<Long> itemIds = new LinkedHashSet<>();
        for (List<Map<String, Object>> npcRows : npcRowsByInternalName.values()) {
            for (Map<String, Object> npcRow : npcRows) {
                collectNpcFallbackItemIds(npcRow, itemIds);
            }
        }
        for (List<Map<String, Object>> npcRows : npcRowsByNpcId.values()) {
            for (Map<String, Object> npcRow : npcRows) {
                collectNpcFallbackItemIds(npcRow, itemIds);
            }
        }
        for (List<Map<String, Object>> npcRows : npcRowsByDisplayName.values()) {
            for (Map<String, Object> npcRow : npcRows) {
                collectNpcFallbackItemIds(npcRow, itemIds);
            }
        }

        Map<Long, String> itemImagesById = loadItemImagesByIds(itemIds);
        Map<String, Map<String, Object>> npcSupplementMap = loadNpcSupplementMap();

        List<Map<String, Object>> resolved = new ArrayList<>();
        List<Map<String, Object>> unresolved = new ArrayList<>();
        for (Map<String, Object> entry : rawEntries) {
            Integer requestedNpcId = toInteger(firstNonNull(entry, "npcId", "sourceId", "source_id"));
            String requestedInternalName = trimToNull(firstNonNull(entry, "internalName", "internal_name"));
            String requestedName = trimToNull(firstNonNull(entry, "name"));
            String requestedNameZh = trimToNull(firstNonNull(entry, "nameZh"));
            String displayName = firstNonBlank(requestedName, requestedNameZh);

            Map<String, Object> npcRow = Map.of();
            String resolutionStatus = null;
            List<Map<String, Object>> matchedRows = List.of();

            List<Map<String, Object>> exactInternalMatches = requestedInternalName == null
                ? List.of()
                : dedupeNpcRows(npcRowsByInternalName.getOrDefault(requestedInternalName, List.of()));
            if (exactInternalMatches.size() > 1) {
                unresolved.add(buildUnresolvedImmuneNpcSample(entry, "duplicate_exact_internal_name", exactInternalMatches));
                continue;
            }
            if (exactInternalMatches.size() == 1) {
                npcRow = exactInternalMatches.get(0);
                resolutionStatus = "exact_internal_name";
            }

            if (npcRow.isEmpty() && requestedNpcId != null) {
                List<Map<String, Object>> exactGameIdMatches = dedupeNpcRows(npcRowsByNpcId.getOrDefault(requestedNpcId, List.of()));
                if (exactGameIdMatches.size() > 1) {
                    unresolved.add(buildUnresolvedImmuneNpcSample(entry, "duplicate_exact_game_id", exactGameIdMatches));
                    continue;
                }
                if (exactGameIdMatches.size() == 1) {
                    npcRow = exactGameIdMatches.get(0);
                    resolutionStatus = "exact_game_id";
                }
            }

            if (npcRow.isEmpty() && displayName != null) {
                List<Map<String, Object>> aliasMatches = dedupeNpcRows(npcRowsByDisplayName.getOrDefault(normalizeLookupKey(displayName), List.of()));
                if (aliasMatches.size() == 1) {
                    npcRow = aliasMatches.get(0);
                    resolutionStatus = "alias_resolved";
                } else if (aliasMatches.size() > 1) {
                    npcRow = selectDeterministicAliasRepresentative(aliasMatches, requestedName, requestedNameZh);
                    resolutionStatus = "alias_ambiguous_representative";
                    matchedRows = aliasMatches;
                }
            }

            Integer resolvedNpcId = toInteger(npcRow.get("npcId"));
            Long resolvedNpcDbId = toLong(npcRow.get("npcDbId"));
            if (resolvedNpcId == null || resolvedNpcDbId == null) {
                unresolved.add(buildUnresolvedImmuneNpcSample(entry, "unresolved", List.of()));
                continue;
            }

            Map<String, Object> supplement = npcSupplementMap.getOrDefault(String.valueOf(resolvedNpcId), Map.of());

            String npcImage = firstNonBlank(
                managedImageOrNull(trimToNull(supplement.get("imageUrl"))),
                managedImageOrNull(extractNpcImageUrl(npcRow.get("rawJson")))
            );
            Long bannerItemId = toLong(npcRow.get("bannerItemId"));
            Long catchItemId = toLong(npcRow.get("catchItemId"));
            String itemFallbackImage = firstNonBlank(
                bannerItemId == null ? null : itemImagesById.get(bannerItemId),
                catchItemId == null ? null : itemImagesById.get(catchItemId)
            );
            String image = firstNonBlank(
                npcImage,
                itemFallbackImage,
                managedImageOrNull(trimToNull(firstNonNull(entry, "image", "imageUrl")))
            );

            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("npcDbId", resolvedNpcDbId);
            payload.put("npcId", resolvedNpcId);
            payload.put("internalName", firstNonBlank(trimToNull(npcRow.get("internalName")), requestedInternalName));
            payload.put("name", firstNonBlank(trimToNull(npcRow.get("name")), requestedName));
            payload.put("nameZh", firstNonBlank(trimToNull(npcRow.get("nameZh")), requestedNameZh));
            payload.put("subNameZh", firstNonBlank(trimToNull(firstNonNull(entry, "subNameZh")), trimToNull(npcRow.get("subNameZh"))));
            payload.put("image", image);
            payload.put("imageUrl", image);
            payload.put("resolutionStatus", resolutionStatus);
            if (!matchedRows.isEmpty()) {
                payload.put("matchCount", matchedRows.size());
                payload.put("matchedNpcIds", matchedRows.stream().map(row -> toInteger(row.get("npcId"))).filter(Objects::nonNull).toList());
                payload.put("matchedNpcDbIds", matchedRows.stream().map(row -> toLong(row.get("npcDbId"))).filter(Objects::nonNull).toList());
                payload.put("matchedInternalNames", matchedRows.stream().map(row -> trimToNull(row.get("internalName"))).filter(Objects::nonNull).toList());
            }
            resolved.add(payload);
        }

        return new ImmuneNpcSampleResolution(resolved, unresolved);
    }

    private Integer countInflictingNpcs(Long buffId) {
        if (buffId == null || jdbcTemplate == null) return 0;
        try {
            return jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                FROM npc_buff_relations nbr
                WHERE nbr.buff_id = ? AND nbr.deleted = 0 AND nbr.relation_type = 'inflicts'
                """,
                Integer.class,
                buffId
            );
        } catch (Exception exception) {
            return 0;
        }
    }

    private List<Map<String, Object>> loadInflictingNpcSamples(Long buffId) {
        if (buffId == null || jdbcTemplate == null) return List.of();
        List<Map<String, Object>> rows;
        try {
            rows = jdbcTemplate.queryForList(
                """
                SELECT
                  nbr.id AS relationId,
                  nbr.npc_id AS npcDbId,
                  COALESCE(n.game_id, n.source_id) AS npcId,
                  n.internal_name AS internalName,
                  n.name,
                  n.name_zh AS nameZh,
                  n.sub_name_zh AS subNameZh,
                  n.image_url AS imageUrl,
                  n.banner_item_id AS bannerItemId,
                  n.catch_item_id AS catchItemId,
                  n.raw_json AS rawJson,
                  nbr.relation_type AS relationType,
                  nbr.duration_ticks AS durationTicks,
                  nbr.chance_value AS chanceValue,
                  nbr.chance_text AS chanceText,
                  nbr.conditions,
                  nbr.notes,
                  nbr.sort_order AS sortOrder
                FROM npc_buff_relations nbr
                JOIN npcs n ON n.id = nbr.npc_id AND n.deleted = 0
                WHERE nbr.buff_id = ? AND nbr.deleted = 0 AND nbr.relation_type = 'inflicts'
                ORDER BY nbr.sort_order ASC, nbr.id ASC
                """,
                buffId
            );
        } catch (Exception exception) {
            return List.of();
        }

        Set<Long> fallbackItemIds = new LinkedHashSet<>();
        for (Map<String, Object> row : rows) {
            String directImage = firstNonBlank(
                managedImageOrNull(trimToNull(row.get("imageUrl"))),
                managedImageOrNull(extractNpcImageUrl(row.get("rawJson")))
            );
            if (directImage != null) continue;
            Long bannerItemId = toLong(row.get("bannerItemId"));
            Long catchItemId = toLong(row.get("catchItemId"));
            if (bannerItemId != null) fallbackItemIds.add(bannerItemId);
            if (catchItemId != null) fallbackItemIds.add(catchItemId);
        }
        Map<Long, String> itemImagesById = loadItemImagesByIds(fallbackItemIds);

        List<Map<String, Object>> samples = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Long bannerItemId = toLong(row.get("bannerItemId"));
            Long catchItemId = toLong(row.get("catchItemId"));
            String itemFallbackImage = firstNonBlank(
                bannerItemId == null ? null : itemImagesById.get(bannerItemId),
                catchItemId == null ? null : itemImagesById.get(catchItemId)
            );
            String image = firstNonBlank(
                managedImageOrNull(trimToNull(row.get("imageUrl"))),
                managedImageOrNull(extractNpcImageUrl(row.get("rawJson"))),
                itemFallbackImage
            );
            String notes = trimToNull(row.get("notes"));

            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("relationId", row.get("relationId"));
            payload.put("npcDbId", row.get("npcDbId"));
            payload.put("npcId", row.get("npcId"));
            payload.put("internalName", row.get("internalName"));
            payload.put("name", row.get("name"));
            payload.put("nameZh", row.get("nameZh"));
            payload.put("subNameZh", row.get("subNameZh"));
            payload.put("image", image);
            payload.put("imageUrl", image);
            payload.put("relationType", firstNonBlank(trimToNull(row.get("relationType")), "inflicts"));
            payload.put("durationTicks", row.get("durationTicks"));
            String rawDurationText = firstNonBlank(trimToNull(row.get("durationText")), extractNotesValue(notes, "duration"));
            payload.put("durationText", formatWikiDurationText(rawDurationText));
            payload.put("rawDurationText", rawDurationText);
            payload.put("chanceValue", row.get("chanceValue"));
            payload.put("chanceText", row.get("chanceText"));
            payload.put("conditions", row.get("conditions"));
            payload.put("notes", notes);
            payload.put("sortOrder", row.get("sortOrder"));
            samples.add(payload);
        }
        return samples;
    }

    private String extractNotesValue(String notes, String key) {
        if (notes == null || key == null || key.isBlank()) return null;
        String prefix = key + "=";
        for (String part : notes.split(";")) {
            String text = part.trim();
            if (text.startsWith(prefix)) {
                return trimToNull(text.substring(prefix.length()));
            }
        }
        return null;
    }

    private String formatWikiDurationText(String value) {
        String text = trimToNull(value);
        if (text == null) return null;
        String cleanedDurationText = formatWikiDurationTextClean(text);
        if (cleanedDurationText != null) return cleanedDurationText;
        String normalized = text.replace('–', '-').replace('—', '-');
        Matcher durationMatcher = DURATION_TEMPLATE_PATTERN.matcher(normalized);
        StringBuffer buffer = new StringBuffer();
        boolean replaced = false;
        while (durationMatcher.find()) {
            String durationValue = trimToNull(durationMatcher.group(1));
            durationMatcher.appendReplacement(buffer, Matcher.quoteReplacement(formatDurationValue(durationValue)));
            replaced = true;
        }
        durationMatcher.appendTail(buffer);
        if (!replaced) {
            return normalized;
        }

        String formatted = buffer.toString();
        formatted = EMPTY_TEMPLATE_PATTERN.matcher(formatted).replaceAll("");
        formatted = formatted
            .replaceAll("(?i)\\{\\{\\s*expert\\s*\\|\\s*([^{}]*?)\\s*\\}\\}", "专家: $1")
            .replaceAll("(?i)\\{\\{\\s*master\\s*\\|\\s*([^{}]*?)\\s*\\}\\}", "大师: $1")
            .replaceAll("(?i)\\{\\{\\s*modes\\s*\\|\\s*([^{}|]*)\\s*\\|\\s*([^{}|]*)\\s*\\|\\s*([^{}|]*)\\s*\\}\\}", "普通: $1 / 专家: $2 / 大师: $3")
            .replaceAll("(?i)\\{\\{\\s*modes\\s*\\|\\s*([^{}|]*)\\s*\\|\\s*([^{}|]*)\\s*\\}\\}", "普通: $1 / 专家: $2")
            .replace("{{", "")
            .replace("}}", "")
            .replaceAll("\\s*\\|\\s*", " / ")
            .replaceAll("\\s+", " ")
            .replaceAll("\\s*/\\s*/\\s*", " / ")
            .replaceAll("(普通|专家|大师):\\s*(?=/|$)", "")
            .replaceAll("^\\s*/\\s*", "")
            .replaceAll("\\s*/\\s*$", "")
            .trim();
        return formatted.isEmpty() ? normalized : formatted;
    }

    private String formatDurationValue(String value) {
        String text = trimToNull(value);
        if (text == null) return "";
        return text.replace('–', '-').replace('—', '-') + " 秒";
    }

    private String formatWikiDurationTextClean(String value) {
        String normalized = normalizeWikiDurationInput(value);
        String formatted = replaceDurationTemplates(normalized);
        formatted = GAME_TEXT_TEMPLATE_PATTERN.matcher(formatted).replaceAll("");
        formatted = NOTE_TEMPLATE_PATTERN.matcher(formatted).replaceAll("");
        formatted = replaceLabeledTemplates(formatted, EXPERT_TEMPLATE_PATTERN, "\u4e13\u5bb6");
        formatted = replaceLabeledTemplates(formatted, MASTER_TEMPLATE_PATTERN, "\u5927\u5e08");
        formatted = replaceModesTemplates(formatted);
        formatted = EMPTY_TEMPLATE_PATTERN.matcher(formatted).replaceAll("");
        formatted = REMAINING_TEMPLATE_PATTERN.matcher(formatted).replaceAll("");
        formatted = formatted
            .replaceAll("(?i)\\b(?:wrap=no|expertonly=y|small=y|paren=y)\\b", "")
            .replaceAll("(?i)\\bProjectileName\\.[A-Za-z0-9_.]+\\b", "")
            .replaceAll("(?i)\\b(?:note|gameText)\\b", "")
            .replaceAll("\\s*\\|\\s*", " / ")
            .replaceAll("\\s+", " ")
            .replaceAll("\\s*/\\s*/\\s*", " / ")
            .replaceAll("(\u666e\u901a|\u4e13\u5bb6|\u5927\u5e08):\\s*(?=/|$)", "")
            .replaceAll("^\\s*/\\s*", "")
            .replaceAll("\\s*/\\s*$", "")
            .trim();
        return formatted.isEmpty() ? normalized.trim() : formatted;
    }

    private String normalizeWikiDurationInput(String value) {
        String normalized = normalizeDurationDashes(value);
        normalized = HTML_COMMENT_PATTERN.matcher(normalized).replaceAll("");
        normalized = HTML_BREAK_PATTERN.matcher(normalized).replaceAll(" / ");
        return normalized;
    }

    private String normalizeDurationDashes(String value) {
        return value
            .replace('\u2013', '-')
            .replace('\u2014', '-')
            .replace("\u00e2\u0080\u0093", "-")
            .replace("\u00e2\u0080\u0094", "-");
    }

    private String replaceDurationTemplates(String value) {
        Matcher matcher = DURATION_TEMPLATE_PATTERN.matcher(value);
        StringBuffer buffer = new StringBuffer();
        while (matcher.find()) {
            String durationValue = trimToNull(matcher.group(1));
            matcher.appendReplacement(buffer, Matcher.quoteReplacement(formatDurationValueClean(durationValue)));
        }
        matcher.appendTail(buffer);
        return buffer.toString();
    }

    private String formatDurationValueClean(String value) {
        String text = trimToNull(value);
        if (text == null) return "";
        return normalizeDurationDashes(text) + " \u79d2";
    }

    private String replaceLabeledTemplates(String value, Pattern pattern, String label) {
        Matcher matcher = pattern.matcher(value);
        StringBuffer buffer = new StringBuffer();
        while (matcher.find()) {
            String content = stripModeLabel(trimToNull(matcher.group(1)), label);
            matcher.appendReplacement(buffer, Matcher.quoteReplacement(content == null ? "" : label + ": " + content));
        }
        matcher.appendTail(buffer);
        return buffer.toString();
    }

    private String replaceModesTemplates(String value) {
        String current = value;
        for (int guard = 0; guard < 8; guard += 1) {
            Matcher matcher = MODES_TEMPLATE_PATTERN.matcher(current);
            if (!matcher.find()) return current;
            matcher.reset();
            StringBuffer buffer = new StringBuffer();
            while (matcher.find()) {
                matcher.appendReplacement(buffer, Matcher.quoteReplacement(formatModesTemplateContent(matcher.group(1))));
            }
            matcher.appendTail(buffer);
            current = buffer.toString();
        }
        return current;
    }

    private String formatModesTemplateContent(String content) {
        String[] parts = content.split("\\|", -1);
        List<String> rows = new ArrayList<>();
        boolean named = false;
        for (String part : parts) {
            if (part.contains("=")) {
                named = true;
                break;
            }
        }

        if (!named) {
            String[] labels = {"\u666e\u901a", "\u4e13\u5bb6", "\u5927\u5e08"};
            for (int index = 0; index < parts.length && index < labels.length; index += 1) {
                addModeRow(rows, labels[index], parts[index]);
            }
            return String.join(" / ", rows);
        }

        for (String part : parts) {
            String segment = trimToNull(part);
            if (segment == null) continue;
            int delimiter = segment.indexOf('=');
            if (delimiter < 0) continue;
            String key = segment.substring(0, delimiter).trim().toLowerCase();
            String segmentValue = segment.substring(delimiter + 1).trim();
            switch (key) {
                case "normal", "classic" -> addModeRow(rows, "\u666e\u901a", segmentValue);
                case "expert" -> addModeRow(rows, "\u4e13\u5bb6", segmentValue);
                case "master" -> addModeRow(rows, "\u5927\u5e08", segmentValue);
                default -> {
                }
            }
        }
        return String.join(" / ", rows);
    }

    private void addModeRow(List<String> rows, String label, String value) {
        String cleaned = stripModeLabel(trimToNull(value), label);
        if (cleaned == null || cleaned.equalsIgnoreCase("y") || cleaned.equalsIgnoreCase("no")) return;
        rows.add(label + ": " + cleaned);
    }

    private String stripModeLabel(String value, String label) {
        String cleaned = trimToNull(value);
        if (cleaned == null) return null;
        String prefix = label + ":";
        if (cleaned.startsWith(prefix)) {
            cleaned = cleaned.substring(prefix.length()).trim();
        }
        return trimToNull(cleaned);
    }

    private List<Map<String, Object>> toObjectMapList(Object raw) {
        List<?> rawList = toObjectList(raw);
        if (rawList.isEmpty()) return List.of();

        List<Map<String, Object>> result = new ArrayList<>();
        for (Object entryRaw : rawList) {
            if (!(entryRaw instanceof Map<?, ?> entry)) continue;
            result.add(new LinkedHashMap<>((Map<String, Object>) entry));
        }
        return result;
    }

    private Map<String, Object> toObjectMap(Object raw) {
        if (raw == null) return Map.of();
        if (raw instanceof Map<?, ?> map) return new LinkedHashMap<>((Map<String, Object>) map);
        if (raw instanceof String text) {
            try {
                Object parsed = objectMapper.readValue(text, new TypeReference<>() {});
                return parsed instanceof Map<?, ?> map ? new LinkedHashMap<>((Map<String, Object>) map) : Map.of();
            } catch (Exception exception) {
                return Map.of();
            }
        }
        return Map.of();
    }

    private List<?> toObjectList(Object raw) {
        if (raw == null) return List.of();
        if (raw instanceof List<?> list) return list;
        if (raw instanceof String text) {
            try {
                Object parsed = objectMapper.readValue(text, new TypeReference<>() {});
                return parsed instanceof List<?> list ? list : List.of();
            } catch (Exception exception) {
                return List.of();
            }
        }
        return List.of();
    }

    private Map<String, List<Map<String, Object>>> loadNpcRowsByInternalNames(Set<String> internalNames) {
        if (internalNames == null || internalNames.isEmpty()) return Map.of();
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
            SELECT
              id AS npcDbId,
              game_id AS npcId,
              internal_name AS internalName,
              name,
              name_zh AS nameZh,
              sub_name_zh AS subNameZh,
              banner_item_id AS bannerItemId,
              catch_item_id AS catchItemId,
              raw_json AS rawJson
            FROM npcs
            WHERE deleted = 0 AND internal_name IN (%s)
            """.formatted(buildPlaceholders(internalNames.size())),
            internalNames.toArray()
        );
        Map<String, List<Map<String, Object>>> lookup = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String internalName = trimToNull(row.get("internalName"));
            if (internalName != null) {
                lookup.computeIfAbsent(internalName, ignored -> new ArrayList<>()).add(new LinkedHashMap<>(row));
            }
        }
        return lookup;
    }

    private Map<Integer, List<Map<String, Object>>> loadNpcRowsByNpcIds(Set<Integer> npcIds) {
        if (npcIds == null || npcIds.isEmpty()) return Map.of();
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
            SELECT
              id AS npcDbId,
              game_id AS npcId,
              internal_name AS internalName,
              name,
              name_zh AS nameZh,
              sub_name_zh AS subNameZh,
              banner_item_id AS bannerItemId,
              catch_item_id AS catchItemId,
              raw_json AS rawJson
            FROM npcs
            WHERE deleted = 0 AND game_id IN (%s)
            """.formatted(buildPlaceholders(npcIds.size())),
            npcIds.toArray()
        );
        Map<Integer, List<Map<String, Object>>> lookup = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            Integer npcId = toInteger(row.get("npcId"));
            if (npcId != null) {
                lookup.computeIfAbsent(npcId, ignored -> new ArrayList<>()).add(new LinkedHashMap<>(row));
            }
        }
        return lookup;
    }

    private Map<String, List<Map<String, Object>>> loadNpcRowsByDisplayNames(Set<String> displayNames) {
        if (displayNames == null || displayNames.isEmpty()) return Map.of();
        List<String> normalizedNames = displayNames.stream()
            .map(this::normalizeLookupKey)
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        if (normalizedNames.isEmpty()) return Map.of();

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
            SELECT
              id AS npcDbId,
              game_id AS npcId,
              internal_name AS internalName,
              name,
              name_zh AS nameZh,
              sub_name_zh AS subNameZh,
              banner_item_id AS bannerItemId,
              catch_item_id AS catchItemId,
              raw_json AS rawJson
            FROM npcs
            WHERE deleted = 0
              AND (
                LOWER(TRIM(name)) IN (%s)
                OR LOWER(TRIM(name_zh)) IN (%s)
              )
            """.formatted(buildPlaceholders(normalizedNames.size()), buildPlaceholders(normalizedNames.size())),
            concatArgs(normalizedNames, normalizedNames)
        );

        Map<String, List<Map<String, Object>>> lookup = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            for (String key : extractNpcLookupKeys(row)) {
                lookup.computeIfAbsent(key, ignored -> new ArrayList<>()).add(new LinkedHashMap<>(row));
            }
        }
        return lookup;
    }

    private Map<Long, String> loadItemImagesByIds(Set<Long> itemIds) {
        if (itemIds == null || itemIds.isEmpty()) return Map.of();
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
            SELECT
              i.id,
              %s AS image
            FROM items i
            WHERE i.deleted = 0 AND i.id IN (%s)
            """.formatted(AdminItemImageSql.preferredItemImageExpression("i"), buildPlaceholders(itemIds.size())),
            itemIds.toArray()
        );
        Map<Long, String> lookup = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            Long itemId = toLong(row.get("id"));
            if (itemId != null) {
                lookup.put(itemId, managedImageOrNull(trimToNull(row.get("image"))));
            }
        }
        return lookup;
    }

    private Map<String, Map<String, Object>> loadNpcSupplementMap() {
        Path path = resolveDataFile(Path.of("generated", "npc-standardized-map.json"));
        if (path == null) return Map.of();
        try {
            Map<String, Object> root = objectMapper.readValue(path.toFile(), new TypeReference<>() {});
            Object recordsRaw = root.get("records");
            if (!(recordsRaw instanceof Map<?, ?> records)) return Map.of();

            Map<String, Map<String, Object>> lookup = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : records.entrySet()) {
                if (entry.getKey() == null || !(entry.getValue() instanceof Map<?, ?> value)) continue;
                lookup.put(String.valueOf(entry.getKey()), new LinkedHashMap<>((Map<String, Object>) value));
            }
            return lookup;
        } catch (Exception exception) {
            return Map.of();
        }
    }

    private String extractNpcImageUrl(Object rawJson) {
        Map<?, ?> raw = parseMap(rawJson);
        return normalizeAssetUrl(trimToNull(firstNonNull(raw, "imageUrl", "image_url")));
    }

    private void collectNpcFallbackItemIds(Map<String, Object> npcRow, Set<Long> itemIds) {
        if (npcRow == null || itemIds == null) return;
        Long bannerItemId = toLong(npcRow.get("bannerItemId"));
        Long catchItemId = toLong(npcRow.get("catchItemId"));
        if (bannerItemId != null) itemIds.add(bannerItemId);
        if (catchItemId != null) itemIds.add(catchItemId);
    }

    private List<Map<String, Object>> dedupeNpcRows(List<Map<String, Object>> rows) {
        if (rows == null || rows.isEmpty()) return List.of();
        Map<Long, Map<String, Object>> deduped = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            Long npcDbId = toLong(row.get("npcDbId"));
            if (npcDbId != null) {
                deduped.putIfAbsent(npcDbId, row);
            }
        }
        List<Map<String, Object>> ordered = new ArrayList<>(deduped.values());
        ordered.sort(Comparator
            .comparing((Map<String, Object> row) -> {
                Integer npcId = toInteger(row.get("npcId"));
                return npcId == null || npcId <= 0 ? 1 : 0;
            })
            .thenComparing(row -> Objects.requireNonNullElse(toInteger(row.get("npcId")), Integer.MAX_VALUE))
            .thenComparing(row -> Objects.requireNonNullElse(toLong(row.get("npcDbId")), Long.MAX_VALUE))
        );
        return ordered;
    }

    private Map<String, Object> selectDeterministicAliasRepresentative(
        List<Map<String, Object>> rows,
        String requestedName,
        String requestedNameZh
    ) {
        if (rows == null || rows.isEmpty()) return Map.of();
        List<Map<String, Object>> ordered = new ArrayList<>(rows);
        String normalizedRequestedName = normalizeLookupKey(requestedName);
        String normalizedRequestedNameZh = normalizeLookupKey(requestedNameZh);
        ordered.sort(Comparator
            .comparing((Map<String, Object> row) -> matchesEnglishLookupKey(row, normalizedRequestedName) ? 0 : 1)
            .thenComparing(row -> matchesChineseLookupKey(row, normalizedRequestedNameZh) ? 0 : 1)
            .thenComparing(row -> Objects.requireNonNullElse(toInteger(row.get("npcId")), Integer.MAX_VALUE))
            .thenComparing(row -> Objects.requireNonNullElse(toLong(row.get("npcDbId")), Long.MAX_VALUE))
        );
        return ordered.get(0);
    }

    private boolean matchesEnglishLookupKey(Map<String, Object> row, String normalizedTarget) {
        if (normalizedTarget == null) return false;
        return matchesLookupKey(trimToNull(row.get("name")), normalizedTarget)
            || matchesLookupKey(extractNestedText(parseMap(row.get("rawJson")), "localized", "en", "name"), normalizedTarget);
    }

    private boolean matchesChineseLookupKey(Map<String, Object> row, String normalizedTarget) {
        if (normalizedTarget == null) return false;
        return matchesLookupKey(trimToNull(row.get("nameZh")), normalizedTarget)
            || matchesLookupKey(extractNestedText(parseMap(row.get("rawJson")), "localized", "zh", "name"), normalizedTarget);
    }

    private boolean matchesLookupKey(String candidate, String normalizedTarget) {
        if (normalizedTarget == null) return false;
        return normalizedTarget.equals(normalizeLookupKey(candidate));
    }

    private Map<String, Object> buildUnresolvedImmuneNpcSample(
        Map<String, Object> entry,
        String resolutionStatus,
        List<Map<String, Object>> matches
    ) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("npcId", toInteger(firstNonNull(entry, "npcId", "sourceId", "source_id")));
        payload.put("internalName", trimToNull(firstNonNull(entry, "internalName", "internal_name")));
        payload.put("name", trimToNull(firstNonNull(entry, "name")));
        payload.put("nameZh", trimToNull(firstNonNull(entry, "nameZh")));
        payload.put("subNameZh", trimToNull(firstNonNull(entry, "subNameZh")));
        payload.put("image", managedImageOrNull(trimToNull(firstNonNull(entry, "image", "imageUrl"))));
        payload.put("imageUrl", managedImageOrNull(trimToNull(firstNonNull(entry, "image", "imageUrl"))));
        payload.put("resolutionStatus", resolutionStatus);
        payload.put("matchCount", matches == null ? 0 : matches.size());
        if (matches != null && !matches.isEmpty()) {
            payload.put("matchedNpcIds", matches.stream().map(row -> toInteger(row.get("npcId"))).filter(Objects::nonNull).toList());
            payload.put("matchedNpcDbIds", matches.stream().map(row -> toLong(row.get("npcDbId"))).filter(Objects::nonNull).toList());
            payload.put("matchedInternalNames", matches.stream().map(row -> trimToNull(row.get("internalName"))).filter(Objects::nonNull).toList());
        }
        return payload;
    }

    private List<String> extractNpcLookupKeys(Map<String, Object> npcRow) {
        if (npcRow == null || npcRow.isEmpty()) return List.of();
        Set<String> keys = new LinkedHashSet<>();
        addNpcLookupKey(keys, trimToNull(npcRow.get("name")));
        addNpcLookupKey(keys, trimToNull(npcRow.get("nameZh")));
        Map<?, ?> rawJson = parseMap(npcRow.get("rawJson"));
        addNpcLookupKey(keys, extractNestedText(rawJson, "localized", "en", "name"));
        addNpcLookupKey(keys, extractNestedText(rawJson, "localized", "zh", "name"));
        return new ArrayList<>(keys);
    }

    private void addNpcLookupKey(Set<String> keys, String value) {
        String normalized = normalizeLookupKey(value);
        if (normalized != null) {
            keys.add(normalized);
        }
    }

    private String normalizeLookupKey(String value) {
        String text = trimToNull(value);
        if (text == null) return null;
        return text.toLowerCase(Locale.ROOT);
    }

    private String extractNestedText(Map<?, ?> source, String... path) {
        Object current = source;
        for (String segment : path) {
            if (!(current instanceof Map<?, ?> currentMap) || !currentMap.containsKey(segment)) {
                return null;
            }
            current = currentMap.get(segment);
        }
        return trimToNull(current);
    }

    private Object[] concatArgs(List<String> left, List<String> right) {
        List<Object> args = new ArrayList<>(left.size() + right.size());
        args.addAll(left);
        args.addAll(right);
        return args.toArray();
    }

    private String buildPlaceholders(int size) {
        return String.join(", ", java.util.Collections.nCopies(size, "?"));
    }

    private Map<String, Object> resolveItemReference(Long itemId, String internalName, Integer sourceItemId) {
        if (itemId != null) {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                SELECT
                  i.id,
                  i.name,
                  i.name_zh AS nameZh,
                  i.internal_name AS internalName,
                  %s AS image
                FROM items i
                WHERE i.id = ? AND i.deleted = 0
                LIMIT 1
                """.formatted(AdminItemImageSql.preferredItemImageExpression("i")),
                itemId
            );
            if (!rows.isEmpty()) return rows.get(0);
        }
        if (internalName != null) {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                SELECT
                  i.id,
                  i.name,
                  i.name_zh AS nameZh,
                  i.internal_name AS internalName,
                  %s AS image
                FROM items i
                WHERE i.internal_name = ? AND i.deleted = 0
                LIMIT 1
                """.formatted(AdminItemImageSql.preferredItemImageExpression("i")),
                internalName
            );
            if (!rows.isEmpty()) return rows.get(0);
        }
        if (sourceItemId != null) {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                SELECT
                  i.id,
                  i.name,
                  i.name_zh AS nameZh,
                  i.internal_name AS internalName,
                  %s AS image
                FROM items i
                WHERE i.id = ? AND i.deleted = 0
                LIMIT 1
                """.formatted(AdminItemImageSql.preferredItemImageExpression("i")),
                sourceItemId
            );
            if (!rows.isEmpty()) return rows.get(0);
        }
        return Map.of();
    }

    private List<Map<String, Object>> loadLinkedSourceItems(Buff buff, Map<String, Object> supplement) {
        if (buff == null || buff.getId() == null) return List.of();
        List<Map<String, Object>> databaseItems = loadLinkedSourceItemsFromDatabase(buff.getId());
        if (!databaseItems.isEmpty()) return databaseItems;
        return loadLinkedSourceItemsFromSourcePage(buff.getInternalName(), supplement);
    }

    private List<Map<String, Object>> loadLinkedSourceItemsFromDatabase(Long buffId) {
        if (buffId == null) return List.of();
        try {
            return jdbcTemplate.queryForList(
                """
                SELECT
                  bsi.source_item_id AS sourceItemId,
                  bsi.item_id AS itemId,
                  COALESCE(i.name_zh, bsi.source_item_name, i.name) AS name,
                  i.name AS nameEn,
                  i.name_zh AS nameZh,
                  COALESCE(i.internal_name, bsi.source_item_internal_name) AS internalName,
                  %s AS image,
                  bsi.buff_time AS buffTime,
                  bsi.sort_order AS sortOrder
                FROM buff_source_items bsi
                LEFT JOIN items i ON i.id = bsi.item_id
                WHERE bsi.buff_id = ?
                ORDER BY bsi.sort_order ASC, bsi.id ASC
                """.formatted(AdminItemImageSql.preferredItemImageExpression("i")),
                buffId
            ).stream().map(row -> {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("sourceItemId", row.get("sourceItemId"));
                payload.put("itemId", row.get("itemId"));
                payload.put("name", row.get("name"));
                payload.put("nameEn", row.get("nameEn"));
                payload.put("nameZh", row.get("nameZh"));
                payload.put("internalName", row.get("internalName"));
                payload.put("image", managedImageOrNull(trimToNull(row.get("image"))));
                payload.put("buffTime", row.get("buffTime"));
                payload.put("sortOrder", row.get("sortOrder"));
                return payload;
            }).toList();
        } catch (Exception exception) {
            return List.of();
        }
    }

    private List<Map<String, Object>> loadLinkedSourceItemsFromSourcePage(String internalName, Map<String, Object> supplement) {
        String sourcePage = firstNonBlank(extractBuffSourcePage(supplement), loadBuffSourcePageFromStandardized(internalName));
        if (sourcePage == null) return List.of();
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                SELECT
                  i.id,
                  i.id AS sourceItemId,
                  i.name,
                  i.name_zh AS nameZh,
                  i.internal_name AS internalName,
                  %s AS image
                FROM items i
                WHERE i.deleted = 0 AND i.name = ?
                ORDER BY i.id ASC
                LIMIT 1
                """.formatted(AdminItemImageSql.preferredItemImageExpression("i")),
                sourcePage
            );
            return rows.stream().map(row -> {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("sourceItemId", row.get("sourceItemId"));
                payload.put("itemId", row.get("id"));
                payload.put("name", firstNonBlank(trimToNull(row.get("nameZh")), trimToNull(row.get("name"))));
                payload.put("nameEn", row.get("name"));
                payload.put("nameZh", row.get("nameZh"));
                payload.put("internalName", row.get("internalName"));
                payload.put("image", managedImageOrNull(trimToNull(row.get("image"))));
                payload.put("buffTime", null);
                payload.put("sortOrder", 0);
                payload.put("sourcePage", sourcePage);
                payload.put("sourceKind", "buff_source_page");
                return payload;
            }).toList();
        } catch (Exception exception) {
            return List.of();
        }
    }

    private String loadBuffSourcePageFromStandardized(String internalName) {
        if (internalName == null) return null;
        Path path = resolveDataFile(Path.of("standardized", "buffs.standardized.json"));
        if (path == null) return null;
        try {
            Map<String, Object> root = objectMapper.readValue(path.toFile(), new TypeReference<>() {});
            Object recordsRaw = root.get("records");
            if (!(recordsRaw instanceof List<?> records)) return null;
            for (Object recordRaw : records) {
                if (!(recordRaw instanceof Map<?, ?> record)) continue;
                if (!internalName.equals(trimToNull(record.get("internalName")))) continue;
                return extractBuffSourcePage(new LinkedHashMap<>((Map<String, Object>) record));
            }
            return null;
        } catch (Exception exception) {
            return null;
        }
    }

    private String extractBuffSourcePage(Map<String, Object> supplement) {
        Object localizedRaw = supplement.get("localized");
        if (!(localizedRaw instanceof Map<?, ?> localized)) return null;
        Object englishRaw = localized.get("en");
        if (englishRaw instanceof Map<?, ?> english) {
            String page = trimToNull(english.get("page"));
            if (page != null) return page;
        }
        Object chineseRaw = localized.get("zh");
        if (chineseRaw instanceof Map<?, ?> chinese) {
            return trimToNull(chinese.get("page"));
        }
        return null;
    }

    private Map<String, Object> loadBuffSupplement(String internalName) {
        if (internalName == null) return Map.of();
        Path path = resolveDataFile(Path.of("generated", "buff-standardized-map.json"));
        if (path == null) return Map.of();
        try {
            Map<String, Object> root = objectMapper.readValue(path.toFile(), new TypeReference<>() {});
            Object recordsRaw = root.get("records");
            if (!(recordsRaw instanceof Map<?, ?> records)) return Map.of();
            Object raw = records.get(internalName);
            return raw instanceof Map<?, ?> map ? new LinkedHashMap<>((Map<String, Object>) map) : Map.of();
        } catch (Exception exception) {
            return Map.of();
        }
    }

    private Path resolveDataFile(Path relativePath) {
        List<Path> candidates = List.of(
            Path.of(System.getProperty("user.dir")).resolve("data").resolve(relativePath).normalize(),
            Path.of(System.getProperty("user.dir")).resolve("..").resolve("data").resolve(relativePath).normalize(),
            Path.of("data").resolve(relativePath).normalize()
        );
        for (Path candidate : candidates) {
            if (Files.exists(candidate)) return candidate;
        }
        return null;
    }

    private String toJsonString(Object value) {
        if (value == null) return null;
        if (value instanceof String text) return text;
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            return String.valueOf(value);
        }
    }

    private Map<?, ?> parseMap(Object value) {
        if (!(value instanceof String text) || text.isBlank()) return Map.of();
        try {
            Object parsed = objectMapper.readValue(text, Object.class);
            return parsed instanceof Map<?, ?> map ? map : Map.of();
        } catch (Exception exception) {
            return Map.of();
        }
    }

    private String normalizeAssetUrl(String value) {
        if (value == null) return null;
        String normalized = value.trim();
        if (normalized.startsWith("http://") || normalized.startsWith("https://")) return normalizeWikiImagePath(normalized);
        if (normalized.startsWith("localhost:") || normalized.startsWith("127.0.0.1:")) return "http://" + normalized;
        return normalized;
    }

    private String resolveBuffFallbackImageUrl(Buff buff) {
        return resolveBuffManagedImageUrl(buff);
    }

    private String resolveBuffCachedImageUrl(Buff buff) {
        return resolveBuffManagedImageUrl(buff);
    }

    private String resolveBuffManagedImageUrl(Buff buff) {
        if (buff == null) return null;
        return firstNonBlank(
            managedImageOrNull(buff.getImageCachedUrl()),
            managedImageOrNull(buff.getImage()),
            managedImageOrNull(buff.getImageOriginalUrl())
        );
    }

    private String managedImageOrNull(String value) {
        String normalized = normalizeAssetUrl(value);
        return isManagedUrl(normalized) ? normalized : null;
    }

    private boolean isManagedUrl(String value) {
        String normalized = trimToNull(value);
        return normalized != null && managedImageUrlPolicy.isManagedImageUrl(normalized);
    }

    private String normalizeWikiImagePath(String value) {
        String lower = value.toLowerCase();
        if (!lower.contains("terraria.wiki.gg/images/")) return value;
        return value.replaceAll("(?i)%20", "_").replace(" ", "_");
    }

    private String trimToNull(Object value) {
        if (value == null) return null;
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }

    private Object firstNonNull(Map<?, ?> source, String... keys) {
        if (source == null || keys == null) return null;
        for (String key : keys) {
            if (source.containsKey(key) && source.get(key) != null) return source.get(key);
        }
        return null;
    }

    private Integer toInteger(Object value) {
        if (value == null) return null;
        if (value instanceof Number number) return number.intValue();
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private Long toLong(Object value) {
        if (value == null) return null;
        if (value instanceof Number number) return number.longValue();
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private Integer firstNonNullInteger(Integer... values) {
        if (values == null) return null;
        for (Integer value : values) {
            if (value != null) return value;
        }
        return null;
    }

    private String firstNonBlank(String... values) {
        if (values == null) return null;
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return null;
    }

    private record ProjectionBuffEvidence(
        String sourceItemsJson,
        String inflictingNpcsJson,
        String immuneNpcsJson,
        String sourceEvidenceJson
    ) {
        static ProjectionBuffEvidence empty() {
            return new ProjectionBuffEvidence(null, null, null, null);
        }
    }

    private record ImmuneNpcSampleResolution(
        List<Map<String, Object>> resolvedSamples,
        List<Map<String, Object>> unresolvedSamples
    ) {
    }
}

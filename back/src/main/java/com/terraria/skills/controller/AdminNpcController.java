package com.terraria.skills.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.entity.BossGroup;
import com.terraria.skills.entity.Category;
import com.terraria.skills.entity.Npc;
import com.terraria.skills.mapper.BossGroupMapper;
import com.terraria.skills.mapper.CategoryMapper;
import com.terraria.skills.mapper.NpcMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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
import java.math.BigDecimal;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

@Slf4j
@RestController
@RequestMapping("/admin/npcs")
@RequiredArgsConstructor
@Tag(name = "AdminNpcs", description = "Admin NPC management")
@SecurityRequirement(name = "bearerAuth")
public class AdminNpcController {

    private static final Duration NPC_SUPPLEMENT_CACHE_TTL = Duration.ofMinutes(10);
    private static final String NPC_DROP_SOURCE_KIND = "npc_drop";
    private static final String DELETE_MANAGED_NPC_LOOT_SQL = """
        DELETE FROM npc_loot_entries
        WHERE npc_id = ?
          AND (drop_source_kind IS NULL OR drop_source_kind = 'npc_drop')
        """;

    private final NpcMapper npcMapper;
    private final CategoryMapper categoryMapper;
    private final BossGroupMapper bossGroupMapper;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private volatile TimedValue<Map<Long, Map<String, Object>>> npcSupplementCache;

    @GetMapping
    @Operation(summary = "Get NPCs")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getNpcs(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) Long categoryId,
        @RequestParam(required = false) Boolean isBoss,
        @RequestParam(required = false) Long bossGroupId
    ) {
        int safePage = PaginationParams.resolvePage(page);
        int safeLimit = PaginationParams.resolveLimit(limit, size, 20, 100);

        LambdaQueryWrapper<Npc> wrapper = new LambdaQueryWrapper<Npc>().orderByAsc(Npc::getId);
        if (categoryId != null) {
            wrapper.eq(Npc::getCategoryId, categoryId);
        }
        if (isBoss != null) {
            wrapper.eq(Npc::getIsBoss, isBoss);
        }
        if (bossGroupId != null) {
            wrapper.eq(Npc::getBossGroupId, bossGroupId);
        }
        if (search != null && !search.isBlank()) {
            String keyword = search.trim();
            Long maybeGameId = toLong(keyword);
            wrapper.and(w -> w.like(Npc::getInternalName, keyword)
                .or().like(Npc::getName, keyword)
                .or().like(Npc::getNameZh, keyword)
                .or().like(Npc::getSubName, keyword)
                .or().like(Npc::getSubNameZh, keyword)
                .or(maybeGameId != null, q -> q.eq(Npc::getGameId, maybeGameId)));
        }

        Page<Npc> mpPage = npcMapper.selectPage(new Page<>(safePage, safeLimit), wrapper);
        Pagination pagination = new Pagination(mpPage.getTotal(), (int) mpPage.getCurrent(), (int) mpPage.getSize());
        ApiResponse<List<Map<String, Object>>> response = ApiResponse.success(toListPayloads(mpPage.getRecords()));
        response.setPagination(pagination);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get NPC detail")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getNpcById(@PathVariable Long id) {
        Npc npc = npcMapper.selectById(id);
        if (npc == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Npc not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(toPayload(npc, true)));
    }

    @PostMapping
    @Operation(summary = "Create NPC")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createNpc(@RequestBody Map<String, Object> request) {
        String internalName = trimToNull(request.get("internalName"));
        Long gameId = firstNonNullLong(toLong(request.get("gameId")), toLong(request.get("sourceId")));
        if (internalName == null || gameId == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "gameId/sourceId and internalName are required"));
        }

        long duplicate = npcMapper.selectCount(new LambdaQueryWrapper<Npc>()
            .and(w -> w.eq(Npc::getGameId, gameId).or().eq(Npc::getInternalName, internalName)));
        if (duplicate > 0) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "gameId/sourceId or internalName already exists"));
        }

        Npc npc = new Npc();
        applyFields(npc, request, true);
        npcMapper.insert(npc);
        Map<String, Object> relationSummary = syncNpcRelations(npc.getId(), request);
        Map<String, Object> payload = toPayload(npcMapper.selectById(npc.getId()), true);
        payload.putAll(relationSummary);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(payload, "Npc created"));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update NPC")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateNpc(@PathVariable Long id, @RequestBody Map<String, Object> request) {
        Npc existing = npcMapper.selectById(id);
        if (existing == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Npc not found"));
        }

        Long nextGameId = request.containsKey("gameId") || request.containsKey("sourceId")
            ? firstNonNullLong(toLong(request.get("gameId")), toLong(request.get("sourceId")))
            : existing.getGameId();
        String nextInternalName = request.containsKey("internalName") ? trimToNull(request.get("internalName")) : existing.getInternalName();
        if (nextGameId == null || nextInternalName == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "gameId/sourceId and internalName are required"));
        }

        long duplicate = npcMapper.selectCount(new LambdaQueryWrapper<Npc>()
            .ne(Npc::getId, id)
            .and(w -> w.eq(Npc::getGameId, nextGameId).or().eq(Npc::getInternalName, nextInternalName)));
        if (duplicate > 0) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "gameId/sourceId or internalName already exists"));
        }

        applyFields(existing, request, false);
        npcMapper.updateById(existing);
        Map<String, Object> relationSummary = syncNpcRelations(id, request);
        Map<String, Object> payload = toPayload(npcMapper.selectById(id), true);
        payload.putAll(relationSummary);
        return ResponseEntity.ok(ApiResponse.success(payload, "Npc updated"));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete NPC")
    public ResponseEntity<ApiResponse<Void>> deleteNpc(@PathVariable Long id) {
        Npc existing = npcMapper.selectById(id);
        if (existing == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Npc not found"));
        }
        npcMapper.deleteById(id);
        return ResponseEntity.ok(ApiResponse.success(null, "Npc deleted"));
    }

    private void applyFields(Npc npc, Map<String, Object> request, boolean creating) {
        if (creating || request.containsKey("gameId") || request.containsKey("sourceId")) {
            npc.setGameId(firstNonNullLong(toLong(request.get("gameId")), toLong(request.get("sourceId"))));
        }
        if (creating || request.containsKey("internalName")) {
            npc.setInternalName(trimToNull(request.get("internalName")));
        }
        if (request.containsKey("name")) {
            npc.setName(trimToNull(request.get("name")));
        }
        if (request.containsKey("nameZh")) {
            npc.setNameZh(trimToNull(request.get("nameZh")));
        }
        if (request.containsKey("subName")) {
            npc.setSubName(trimToNull(request.get("subName")));
        }
        if (request.containsKey("subNameZh")) {
            npc.setSubNameZh(trimToNull(request.get("subNameZh")));
        }
        if (request.containsKey("imageUrl")) {
            npc.setImageUrl(trimToNull(request.get("imageUrl")));
        }
        if (request.containsKey("categoryId")) npc.setCategoryId(toLong(request.get("categoryId")));
        if (request.containsKey("gamePeriodId")) npc.setGamePeriodId(toLong(request.get("gamePeriodId")));
        if (request.containsKey("gameModelId")) npc.setGameModelId(toLong(request.get("gameModelId")));
        if (request.containsKey("isBoss")) npc.setIsBoss(toBoolean(request.get("isBoss")));
        if (request.containsKey("bossGroupId")) npc.setBossGroupId(toLong(request.get("bossGroupId")));
        if (request.containsKey("bossRole")) npc.setBossRole(trimToNull(request.get("bossRole")));
        if (request.containsKey("isFriendly")) npc.setIsFriendly(toBoolean(request.get("isFriendly")));
        if (request.containsKey("isTownNpc")) npc.setIsTownNpc(toBoolean(request.get("isTownNpc")));
        if (request.containsKey("behaviorNotes")) npc.setBehaviorNotes(trimToNull(request.get("behaviorNotes")));
        if (request.containsKey("bannerSourceItemId")) npc.setBannerSourceItemId(toInteger(request.get("bannerSourceItemId")));
        if (request.containsKey("bannerItemId")) npc.setBannerItemId(toLong(request.get("bannerItemId")));
        if (request.containsKey("catchSourceItemId")) npc.setCatchSourceItemId(toInteger(request.get("catchSourceItemId")));
        if (request.containsKey("catchItemId")) npc.setCatchItemId(toLong(request.get("catchItemId")));
        if (request.containsKey("lootItemsJson")) npc.setLootItemsJson(toJsonString(request.get("lootItemsJson")));
        if (request.containsKey("shopItemsJson")) npc.setShopItemsJson(toJsonString(request.get("shopItemsJson")));
        if (request.containsKey("sourceItemsJson")) npc.setSourceItemsJson(toJsonString(request.get("sourceItemsJson")));
        if (request.containsKey("status")) npc.setStatus(toInteger(request.get("status")));

        Map<String, Object> supplement = loadNpcSupplement(npc.getGameId());
        if (creating) {
            if (npc.getName() == null) npc.setName(npc.getInternalName());
            if (npc.getNameZh() == null) npc.setNameZh(null);
            if (npc.getSubName() == null) npc.setSubName("");
            if (npc.getSubNameZh() == null) npc.setSubNameZh(null);
            if (npc.getCategoryId() == null) npc.setCategoryId(0L);
            if (npc.getGamePeriodId() == null) npc.setGamePeriodId(0L);
            if (npc.getGameModelId() == null) npc.setGameModelId(0L);
            if (npc.getIsBoss() == null) npc.setIsBoss(toBoolean(supplement.get("isBoss")));
            if (npc.getIsFriendly() == null) npc.setIsFriendly(toBoolean(supplement.get("isFriendly")));
            if (npc.getIsTownNpc() == null) npc.setIsTownNpc(toBoolean(supplement.get("isTownNpc")));
            if (npc.getStatus() == null) npc.setStatus(1);
        }
    }

    private List<Map<String, Object>> toListPayloads(List<Npc> npcs) {
        if (npcs == null || npcs.isEmpty()) {
            return List.of();
        }

        Map<Long, Map<String, Object>> supplementsByGameId = getNpcSupplementSnapshot();
        Map<Long, Category> categoriesById = loadCategoriesById(npcs.stream().map(Npc::getCategoryId).filter(Objects::nonNull).toList());
        Map<Long, BossGroup> bossGroupsById = loadBossGroupsById(npcs.stream().map(Npc::getBossGroupId).filter(Objects::nonNull).toList());
        Map<Long, Integer> lootCountsByNpcId = countNpcRelationsByIds("npc_loot_entries", npcs.stream().map(Npc::getId).filter(Objects::nonNull).toList());
        Map<Long, NpcLootInheritance> lootInheritanceBySourceId = loadNpcLootInheritanceBySourceIds(
            npcs.stream()
                .filter(npc -> lootCountsByNpcId.getOrDefault(npc.getId(), 0) <= 0)
                .map(npc -> resolveLootInheritanceSourceId(npc, safeGetOrDefault(supplementsByGameId, npc.getGameId(), Map.of())))
                .filter(Objects::nonNull)
                .toList()
        );
        Map<Long, Integer> buffCountsByNpcId = countNpcRelationsByIds("npc_buff_relations", npcs.stream().map(Npc::getId).filter(Objects::nonNull).toList());
        Map<Long, Integer> shopCountsByNpcId = countNpcRelationsByIds("npc_shop_entries", npcs.stream().map(Npc::getId).filter(Objects::nonNull).toList());
        Map<Long, Integer> derivedBySourceId = countNpcDerivedLootEntriesBySourceIds(npcs.stream().map(Npc::getGameId).filter(Objects::nonNull).toList());
        Map<String, Integer> derivedByName = countNpcDerivedLootEntriesByNames(
            npcs.stream()
                .filter(npc -> derivedBySourceId.getOrDefault(npc.getGameId(), 0) <= 0)
                .map(Npc::getName)
                .filter(Objects::nonNull)
                .toList()
        );

        return npcs.stream()
            .map(npc -> toListPayload(
                npc,
                safeGetOrDefault(supplementsByGameId, npc.getGameId(), Map.of()),
                safeGet(categoriesById, npc.getCategoryId()),
                safeGet(bossGroupsById, npc.getBossGroupId()),
                lootCountsByNpcId.getOrDefault(npc.getId(), 0),
                safeGet(lootInheritanceBySourceId, resolveLootInheritanceSourceId(npc, safeGetOrDefault(supplementsByGameId, npc.getGameId(), Map.of()))),
                resolveDerivedLootCount(npc, derivedBySourceId, derivedByName),
                buffCountsByNpcId.getOrDefault(npc.getId(), 0),
                shopCountsByNpcId.getOrDefault(npc.getId(), 0)
            ))
            .toList();
    }

    private Map<String, Object> toPayload(Npc npc, boolean includeRelations) {
        Map<String, Object> supplement = loadNpcSupplement(npc.getGameId());
        Category category = npc.getCategoryId() == null ? null : categoryMapper.selectById(npc.getCategoryId());
        BossGroup bossGroup = npc.getBossGroupId() == null ? null : bossGroupMapper.selectById(npc.getBossGroupId());
        Long gameId = npc.getGameId();
        Integer fallbackNetId = gameId == null ? null : gameId.intValue();

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", npc.getId());
        payload.put("sourceId", gameId);
        payload.put("gameId", gameId);
        payload.put("netId", firstNonNullInteger(toInteger(supplement.get("netId")), fallbackNetId));
        payload.put("name", npc.getName());
        payload.put("nameZh", firstNonBlank(npc.getNameZh(), trimToNull(supplement.get("nameZh"))));
        payload.put("nameEn", firstNonBlank(trimToNull(supplement.get("nameEn")), npc.getName()));
        payload.put("subName", npc.getSubName());
        payload.put("subNameZh", firstNonBlank(npc.getSubNameZh(), trimToNull(supplement.get("subNameZh"))));
        payload.put("subNameEn", trimToNull(supplement.get("subNameEn")));
        payload.put("internalName", npc.getInternalName());
        payload.put("categoryId", npc.getCategoryId());
        payload.put("categoryName", category == null ? null : category.getName());
        payload.put("categoryCode", category == null ? null : category.getCode());
        payload.put("gamePeriodId", npc.getGamePeriodId());
        payload.put("gameModelId", npc.getGameModelId());
        payload.put("isBoss", firstNonNullBoolean(npc.getIsBoss(), toBoolean(supplement.get("isBoss"))));
        payload.put("bossGroupId", npc.getBossGroupId());
        payload.put("bossGroupCode", bossGroup == null ? null : bossGroup.getCode());
        payload.put("bossGroupName", bossGroup == null ? null : firstNonBlank(bossGroup.getNameZh(), bossGroup.getNameEn(), bossGroup.getCode()));
        payload.put("bossRole", npc.getBossRole());
        payload.put("isFriendly", firstNonNullBoolean(npc.getIsFriendly(), toBoolean(supplement.get("isFriendly"))));
        payload.put("isTownNpc", firstNonNullBoolean(npc.getIsTownNpc(), toBoolean(supplement.get("isTownNpc"))));
        payload.put("behaviorNotes", npc.getBehaviorNotes());
        payload.put("npcType", resolveNpcType(npc, supplement));
        payload.put("aiStyle", toInteger(supplement.get("aiStyle")));
        payload.put("damage", toInteger(supplement.get("damage")));
        payload.put("defense", toInteger(supplement.get("defense")));
        payload.put("lifeMax", toInteger(supplement.get("lifeMax")));
        payload.put("knockBackResist", supplement.get("knockBackResist"));
        payload.put("width", toInteger(supplement.get("width")));
        payload.put("height", toInteger(supplement.get("height")));
        payload.put("scale", supplement.get("scale"));
        payload.put("value", toInteger(supplement.get("value")));
        payload.put("buffImmune", trimToNull(supplement.get("buffImmune")));
        payload.put("rawJson", trimToNull(supplement.get("rawJson")));
        payload.put("imageUrl", firstNonBlank(npc.getImageUrl(), trimToNull(supplement.get("imageUrl"))));
        payload.put("bannerSourceItemId", npc.getBannerSourceItemId());
        payload.put("bannerItemId", npc.getBannerItemId());
        payload.put("catchSourceItemId", npc.getCatchSourceItemId());
        payload.put("catchItemId", npc.getCatchItemId());
        payload.put("lootItemsJson", npc.getLootItemsJson());
        payload.put("shopItemsJson", npc.getShopItemsJson());
        payload.put("sourceItemsJson", npc.getSourceItemsJson());
        int lootEntryCount = countNpcRelations("npc_loot_entries", npc.getId());
        NpcLootInheritance lootInheritance = lootEntryCount > 0 ? null : loadNpcLootInheritance(resolveLootInheritanceSourceId(npc, supplement));
        payload.put("lootEntryCount", lootEntryCount);
        putLootInheritance(payload, lootInheritance);
        payload.put("derivedLootEntryCount", countNpcDerivedLootEntries(npc.getGameId(), npc.getName()));
        payload.put("buffRelationCount", countNpcRelations("npc_buff_relations", npc.getId()));
        payload.put("shopEntryCount", countNpcRelations("npc_shop_entries", npc.getId()));
        if (includeRelations) {
            payload.put("lootEntries", loadNpcLootEntries(npc.getId()));
            payload.put("inheritedLootEntries", lootInheritance == null ? List.of() : loadNpcLootEntries(lootInheritance.sourceNpcId()));
            payload.put("derivedLootEntries", loadNpcDerivedLootEntries(npc.getGameId(), npc.getName()));
            payload.put("buffRelations", loadNpcBuffRelations(npc.getId()));
            payload.put("shopEntries", loadNpcShopEntries(npc.getId()));
        }
        payload.put("status", firstNonNullInteger(npc.getStatus(), 1));
        payload.put("createdAt", npc.getCreatedAt());
        payload.put("updatedAt", npc.getUpdatedAt());
        return payload;
    }

    private Map<String, Object> toListPayload(
        Npc npc,
        Map<String, Object> supplement,
        Category category,
        BossGroup bossGroup,
        int lootEntryCount,
        NpcLootInheritance lootInheritance,
        int derivedLootEntryCount,
        int buffRelationCount,
        int shopEntryCount
    ) {
        Long gameId = npc.getGameId();
        Integer fallbackNetId = gameId == null ? null : gameId.intValue();

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", npc.getId());
        payload.put("sourceId", gameId);
        payload.put("gameId", gameId);
        payload.put("netId", firstNonNullInteger(toInteger(supplement.get("netId")), fallbackNetId));
        payload.put("name", npc.getName());
        payload.put("nameZh", firstNonBlank(npc.getNameZh(), trimToNull(supplement.get("nameZh"))));
        payload.put("nameEn", firstNonBlank(trimToNull(supplement.get("nameEn")), npc.getName()));
        payload.put("subName", npc.getSubName());
        payload.put("subNameZh", firstNonBlank(npc.getSubNameZh(), trimToNull(supplement.get("subNameZh"))));
        payload.put("subNameEn", trimToNull(supplement.get("subNameEn")));
        payload.put("internalName", npc.getInternalName());
        payload.put("categoryId", npc.getCategoryId());
        payload.put("categoryName", category == null ? null : category.getName());
        payload.put("categoryCode", category == null ? null : category.getCode());
        payload.put("gamePeriodId", npc.getGamePeriodId());
        payload.put("gameModelId", npc.getGameModelId());
        payload.put("isBoss", firstNonNullBoolean(npc.getIsBoss(), toBoolean(supplement.get("isBoss"))));
        payload.put("bossGroupId", npc.getBossGroupId());
        payload.put("bossGroupCode", bossGroup == null ? null : bossGroup.getCode());
        payload.put("bossGroupName", bossGroup == null ? null : firstNonBlank(bossGroup.getNameZh(), bossGroup.getNameEn(), bossGroup.getCode()));
        payload.put("bossRole", npc.getBossRole());
        payload.put("isFriendly", firstNonNullBoolean(npc.getIsFriendly(), toBoolean(supplement.get("isFriendly"))));
        payload.put("isTownNpc", firstNonNullBoolean(npc.getIsTownNpc(), toBoolean(supplement.get("isTownNpc"))));
        payload.put("behaviorNotes", npc.getBehaviorNotes());
        payload.put("npcType", resolveNpcType(npc, supplement));
        payload.put("aiStyle", toInteger(supplement.get("aiStyle")));
        payload.put("damage", toInteger(supplement.get("damage")));
        payload.put("defense", toInteger(supplement.get("defense")));
        payload.put("lifeMax", toInteger(supplement.get("lifeMax")));
        payload.put("knockBackResist", supplement.get("knockBackResist"));
        payload.put("width", toInteger(supplement.get("width")));
        payload.put("height", toInteger(supplement.get("height")));
        payload.put("scale", supplement.get("scale"));
        payload.put("value", toInteger(supplement.get("value")));
        payload.put("buffImmune", trimToNull(supplement.get("buffImmune")));
        payload.put("rawJson", trimToNull(supplement.get("rawJson")));
        payload.put("imageUrl", firstNonBlank(npc.getImageUrl(), trimToNull(supplement.get("imageUrl"))));
        payload.put("bannerSourceItemId", npc.getBannerSourceItemId());
        payload.put("bannerItemId", npc.getBannerItemId());
        payload.put("catchSourceItemId", npc.getCatchSourceItemId());
        payload.put("catchItemId", npc.getCatchItemId());
        payload.put("lootItemsJson", npc.getLootItemsJson());
        payload.put("shopItemsJson", npc.getShopItemsJson());
        payload.put("sourceItemsJson", npc.getSourceItemsJson());
        payload.put("lootEntryCount", lootEntryCount);
        putLootInheritance(payload, lootEntryCount > 0 ? null : lootInheritance);
        payload.put("derivedLootEntryCount", derivedLootEntryCount);
        payload.put("buffRelationCount", buffRelationCount);
        payload.put("shopEntryCount", shopEntryCount);
        payload.put("status", firstNonNullInteger(npc.getStatus(), 1));
        payload.put("createdAt", npc.getCreatedAt());
        payload.put("updatedAt", npc.getUpdatedAt());
        return payload;
    }

    private Map<String, Object> loadNpcSupplement(Long gameId) {
        if (gameId == null) return Map.of();
        return safeGetOrDefault(getNpcSupplementSnapshot(), gameId, Map.of());
    }

    private Map<Long, Map<String, Object>> getNpcSupplementSnapshot() {
        TimedValue<Map<Long, Map<String, Object>>> cached = npcSupplementCache;
        if (isValid(cached)) {
            return cached.value();
        }

        Map<Long, Map<String, Object>> loaded = loadNpcSupplementSnapshot();
        npcSupplementCache = new TimedValue<>(loaded, System.currentTimeMillis() + NPC_SUPPLEMENT_CACHE_TTL.toMillis());
        return loaded;
    }

    private Map<Long, Map<String, Object>> loadNpcSupplementSnapshot() {
        Path path = resolveDataFile(Path.of("generated", "npc-standardized-map.json"));
        if (path == null) {
            return Map.of();
        }
        try {
            Map<String, Object> root = objectMapper.readValue(path.toFile(), new TypeReference<>() {});
            if (root == null) {
                return Map.of();
            }
            Object recordsRaw = root.get("records");
            if (!(recordsRaw instanceof Map<?, ?> records)) {
                return Map.of();
            }

            Map<Long, Map<String, Object>> result = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : records.entrySet()) {
                Long gameId = toLong(entry.getKey());
                if (gameId == null || !(entry.getValue() instanceof Map<?, ?> value)) {
                    continue;
                }
                result.put(gameId, Collections.unmodifiableMap(toNpcSupplement(value)));
            }
            return Collections.unmodifiableMap(result);
        } catch (Exception exception) {
            log.warn("Failed to load npc standardized supplement snapshot", exception);
            return Map.of();
        }
    }

    private Map<String, Object> toNpcSupplement(Map<?, ?> map) {
        Map<String, Object> payload = new LinkedHashMap<>();
        Map<?, ?> rawJson = parseMap(map.get("rawJson"));
        payload.put("imageUrl", firstNonBlank(
            trimToNull(map.get("imageUrl")),
            trimToNull(rawJson.get("imageUrl")),
            trimToNull(rawJson.get("image_url"))
        ));
        payload.put("rawJson", map.get("rawJson"));
        payload.put("buffImmune", toJsonString(map.get("buffImmune")));
        Map<?, ?> combat = map.get("combat") instanceof Map<?, ?> combatMap ? combatMap : Map.of();
        Map<?, ?> dimensions = map.get("dimensions") instanceof Map<?, ?> dimMap ? dimMap : Map.of();
        Map<?, ?> economy = map.get("economy") instanceof Map<?, ?> ecoMap ? ecoMap : Map.of();
        payload.put("npcType", firstNonNullInteger(toInteger(map.get("npcType")), toInteger(rawJson.get("type"))));
        payload.put("aiStyle", firstNonNullInteger(toInteger(rawJson.get("aiStyle")), toInteger(map.get("aiStyle"))));
        payload.put("netId", toInteger(rawJson.get("netID")));
        payload.put("nameEn", trimToNull(rawJson.get("name")));
        payload.put("nameZh", trimToNull(map.get("nameZh")));
        payload.put("subNameZh", trimToNull(map.get("subNameZh")));
        payload.put("damage", toInteger(combat.get("damage")));
        payload.put("defense", toInteger(combat.get("defense")));
        payload.put("lifeMax", toInteger(combat.get("lifeMax")));
        payload.put("knockBackResist", combat.get("knockBackResist"));
        payload.put("width", toInteger(dimensions.get("width")));
        payload.put("height", toInteger(dimensions.get("height")));
        payload.put("scale", dimensions.get("scale"));
        payload.put("value", toInteger(economy.get("value")));
        Map<?, ?> flags = rawJson.get("flags") instanceof Map<?, ?> flagsMap ? flagsMap : Map.of();
        Map<?, ?> extras = rawJson.get("extras") instanceof Map<?, ?> extrasMap ? extrasMap : Map.of();
        payload.put("isBoss", toBoolean(flags.get("boss")));
        payload.put("isFriendly", toBoolean(flags.get("friendly")));
        payload.put("isTownNpc", toBoolean(extras.get("townNPC")));
        Map<?, ?> localized = rawJson.get("localized") instanceof Map<?, ?> localizedMap ? localizedMap : Map.of();
        Map<?, ?> localizedEn = localized.get("en") instanceof Map<?, ?> localizedEnMap ? localizedEnMap : Map.of();
        payload.put("subNameEn", trimToNull(localizedEn.get("namesub")));
        return payload;
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

    private List<Map<String, Object>> loadNpcLootEntries(Long npcId) {
        if (npcId == null || jdbcTemplate == null) return List.of();
        return jdbcTemplate.queryForList(
            """
            SELECT
              nle.id,
              nle.item_id AS itemId,
              nle.source_item_id AS sourceItemId,
              nle.drop_source_kind AS dropSourceKind,
              nle.quantity_min AS quantityMin,
              nle.quantity_max AS quantityMax,
              nle.quantity_text AS quantityText,
              nle.chance_value AS chanceValue,
              nle.chance_text AS chanceText,
              nle.conditions,
              nle.notes,
              nle.sort_order AS sortOrder,
              i.name AS itemName,
              i.name_zh AS itemNameZh,
              i.internal_name AS itemInternalName,
              i.image AS itemImage
            FROM npc_loot_entries nle
            LEFT JOIN items i ON i.id = nle.item_id AND i.deleted = 0
            WHERE nle.npc_id = ? AND nle.deleted = 0
            ORDER BY nle.sort_order ASC, nle.id ASC
            """,
            npcId
        );
    }

    private List<Map<String, Object>> loadNpcDerivedLootEntries(Long npcSourceId, String npcName) {
        if (jdbcTemplate == null) return List.of();
        if (npcSourceId != null && countNpcDerivedLootEntriesBySourceId(npcSourceId) > 0) {
            return loadNpcDerivedLootEntriesBySourceId(npcSourceId);
        }
        String normalizedNpcName = trimToNull(npcName);
        if (normalizedNpcName == null) {
            return List.of();
        }
        return loadNpcDerivedLootEntriesByName(normalizedNpcName);
    }

    private List<Map<String, Object>> loadNpcDerivedLootEntriesBySourceId(Long npcSourceId) {
        return jdbcTemplate.queryForList(
            """
            SELECT
              ias.id,
              ias.item_id AS itemId,
              ias.source_ref_id AS sourceRefId,
              ias.source_ref_name AS sourceRefName,
              ias.quantity_min AS quantityMin,
              ias.quantity_max AS quantityMax,
              ias.quantity_text AS quantityText,
              ias.chance_value AS chanceValue,
              ias.chance_text AS chanceText,
              ias.conditions,
              ias.notes,
              ias.source_page AS sourcePage,
              ias.source_revision_timestamp AS sourceRevisionTimestamp,
              ias.sort_order AS sortOrder,
              i.name AS itemName,
              i.name_zh AS itemNameZh,
              i.internal_name AS itemInternalName,
              i.image AS itemImage
            FROM item_acquisition_sources ias
            LEFT JOIN items i ON i.id = ias.item_id AND i.deleted = 0
            WHERE ias.source_type = 'drop'
              AND ias.source_ref_type = 'npc'
              AND ias.source_ref_id = ?
              AND ias.status = 1
              AND ias.deleted = 0
            ORDER BY ias.sort_order ASC, ias.id ASC
            """,
            npcSourceId
        );
    }

    private List<Map<String, Object>> loadNpcDerivedLootEntriesByName(String npcName) {
        return jdbcTemplate.queryForList(
            """
            SELECT
              ias.id,
              ias.item_id AS itemId,
              ias.source_ref_id AS sourceRefId,
              ias.source_ref_name AS sourceRefName,
              ias.quantity_min AS quantityMin,
              ias.quantity_max AS quantityMax,
              ias.quantity_text AS quantityText,
              ias.chance_value AS chanceValue,
              ias.chance_text AS chanceText,
              ias.conditions,
              ias.notes,
              ias.source_page AS sourcePage,
              ias.source_revision_timestamp AS sourceRevisionTimestamp,
              ias.sort_order AS sortOrder,
              i.name AS itemName,
              i.name_zh AS itemNameZh,
              i.internal_name AS itemInternalName,
              i.image AS itemImage
            FROM item_acquisition_sources ias
            LEFT JOIN items i ON i.id = ias.item_id AND i.deleted = 0
            WHERE ias.source_type = 'drop'
              AND ias.source_ref_type = 'npc'
              AND ias.source_ref_id IS NULL
              AND LOWER(TRIM(ias.source_ref_name)) = LOWER(TRIM(?))
              AND ias.status = 1
              AND ias.deleted = 0
            ORDER BY ias.sort_order ASC, ias.id ASC
            """,
            npcName
        );
    }

    private List<Map<String, Object>> loadNpcBuffRelations(Long npcId) {
        if (npcId == null || jdbcTemplate == null) return List.of();
        return jdbcTemplate.queryForList(
            """
            SELECT
              nbr.id,
              nbr.buff_id AS buffId,
              nbr.buff_source_id AS buffSourceId,
              nbr.relation_type AS relationType,
              nbr.duration_ticks AS durationTicks,
              nbr.chance_value AS chanceValue,
              nbr.chance_text AS chanceText,
              nbr.conditions,
              nbr.notes,
              nbr.sort_order AS sortOrder,
              b.internal_name AS buffInternalName,
              b.english_name AS buffNameEn,
              b.name_zh AS buffNameZh,
              b.buff_type AS buffType,
              COALESCE(NULLIF(TRIM(b.image_cached_url), ''), b.image) AS buffImage
            FROM npc_buff_relations nbr
            LEFT JOIN buffs b ON b.id = nbr.buff_id AND b.deleted = 0
            WHERE nbr.npc_id = ? AND nbr.deleted = 0
            ORDER BY nbr.sort_order ASC, nbr.id ASC
            """,
            npcId
        );
    }

    private List<Map<String, Object>> loadNpcShopEntries(Long npcId) {
        if (npcId == null || jdbcTemplate == null) return List.of();
        List<Map<String, Object>> entries = jdbcTemplate.queryForList(
            ("""
            SELECT
              nse.id,
              nse.item_id AS itemId,
              nse.source_item_id AS sourceItemId,
              nse.price_text AS priceText,
              nse.notes,
              nse.sort_order AS sortOrder,
              i.name AS itemName,
              i.name_zh AS itemNameZh,
              i.internal_name AS itemInternalName,
              %s AS itemImage
            FROM npc_shop_entries nse
            LEFT JOIN items i ON i.id = nse.item_id AND i.deleted = 0
            WHERE nse.npc_id = ? AND nse.deleted = 0
            ORDER BY nse.sort_order ASC, nse.id ASC
            """).formatted(AdminItemImageSql.preferredItemImageExpression("i")),
            npcId
        );
        List<Long> entryIds = entries.stream().map(row -> toLong(row.get("id"))).filter(Objects::nonNull).toList();
        Map<Long, List<Map<String, Object>>> conditionMap = loadNpcShopConditionMap(entryIds);
        for (Map<String, Object> entry : entries) {
            Long entryId = toLong(entry.get("id"));
            entry.put("conditions", conditionMap.getOrDefault(entryId, List.of()));
        }
        return entries;
    }

    private Map<Long, List<Map<String, Object>>> loadNpcShopConditionMap(List<Long> entryIds) {
        if (entryIds == null || entryIds.isEmpty() || jdbcTemplate == null) return Map.of();
        String placeholders = String.join(",", entryIds.stream().map(id -> "?").toList());
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
            SELECT
              nsc.id,
              nsc.shop_entry_id AS shopEntryId,
              nsc.ref_type AS refType,
              nsc.ref_id AS refId,
              nsc.condition_role AS conditionRole,
              nsc.notes,
              nsc.sort_order AS sortOrder,
              b.code AS biomeCode,
              b.name_en AS biomeNameEn,
              b.name_zh AS biomeNameZh,
              wc.code AS contextCode,
              wc.name_en AS contextNameEn,
              wc.name_zh AS contextNameZh,
              wc.context_type AS contextType,
              gp.code AS gamePeriodCode,
              gp.display_name_en AS gamePeriodNameEn,
              gp.display_name_zh AS gamePeriodNameZh,
              ri.name AS refItemName,
              ri.name_zh AS refItemNameZh,
              ri.internal_name AS refItemInternalName,
              rn.name AS refNpcName,
              rn.name_zh AS refNpcNameZh,
              rn.internal_name AS refNpcInternalName
            FROM npc_shop_conditions nsc
            LEFT JOIN biomes b ON nsc.ref_type = 'BIOME' AND b.id = nsc.ref_id AND b.deleted = 0
            LEFT JOIN world_contexts wc ON nsc.ref_type = 'WORLD_CONTEXT' AND wc.id = nsc.ref_id AND wc.deleted = 0
            LEFT JOIN game_period gp ON nsc.ref_type = 'GAME_PERIOD' AND gp.id = nsc.ref_id AND gp.deleted = 0
            LEFT JOIN items ri ON nsc.ref_type = 'ITEM' AND ri.id = nsc.ref_id AND ri.deleted = 0
            LEFT JOIN npcs rn ON nsc.ref_type = 'NPC' AND rn.id = nsc.ref_id AND rn.deleted = 0
            WHERE nsc.shop_entry_id IN (%s)
            ORDER BY nsc.sort_order ASC, nsc.id ASC
            """.formatted(placeholders),
            entryIds.toArray()
        );
        Map<Long, List<Map<String, Object>>> grouped = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            Long entryId = toLong(row.get("shopEntryId"));
            grouped.computeIfAbsent(entryId, ignored -> new java.util.ArrayList<>()).add(row);
        }
        return grouped;
    }

    private Map<String, Object> syncNpcRelations(Long npcId, Map<String, Object> request) {
        Map<String, Object> summary = new LinkedHashMap<>();
        if (npcId == null || request == null || jdbcTemplate == null) {
            return summary;
        }
        if (request.containsKey("lootEntries")) {
            syncNpcLootEntries(npcId, request.get("lootEntries"));
        }
        if (request.containsKey("buffRelations")) {
            syncNpcBuffRelations(npcId, request.get("buffRelations"));
        }
        if (request.containsKey("shopEntries")) {
            summary.put("shopMutationSummary", syncNpcShopEntries(npcId, request.get("shopEntries")));
        }
        return summary;
    }

    private void syncNpcLootEntries(Long npcId, Object raw) {
        jdbcTemplate.update(DELETE_MANAGED_NPC_LOOT_SQL, npcId);
        List<Map<String, Object>> rows = normalizeObjectList(raw);
        for (int index = 0; index < rows.size(); index += 1) {
            Map<String, Object> row = rows.get(index);
            String dropSourceKind = normalizeManagedNpcDropSourceKind(row.get("dropSourceKind"));
            if (dropSourceKind == null) continue;
            Long itemId = toLong(row.get("itemId"));
            Integer sourceItemId = toInteger(row.get("sourceItemId"));
            if (itemId == null && sourceItemId == null) continue;
            jdbcTemplate.update(
                """
                INSERT INTO npc_loot_entries
                  (npc_id, item_id, source_item_id, drop_source_kind, quantity_min, quantity_max, quantity_text, chance_value, chance_text, conditions, notes, sort_order, status, deleted)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
                """,
                npcId,
                itemId,
                sourceItemId,
                dropSourceKind,
                toInteger(row.get("quantityMin")),
                toInteger(row.get("quantityMax")),
                trimToNull(row.get("quantityText")),
                toDecimal(row.get("chanceValue")),
                trimToNull(row.get("chanceText")),
                trimToNull(row.get("conditions")),
                trimToNull(row.get("notes")),
                resolveSortOrder(row.get("sortOrder"), index)
            );
        }
    }

    private String normalizeManagedNpcDropSourceKind(Object rawDropSourceKind) {
        String dropSourceKind = trimToNull(rawDropSourceKind);
        if (dropSourceKind == null) return NPC_DROP_SOURCE_KIND;
        return switch (dropSourceKind.trim().toLowerCase(Locale.ROOT)) {
            case "npc_drop", "drop", "loot" -> NPC_DROP_SOURCE_KIND;
            default -> null;
        };
    }

    private void syncNpcBuffRelations(Long npcId, Object raw) {
        jdbcTemplate.update("DELETE FROM npc_buff_relations WHERE npc_id = ?", npcId);
        List<Map<String, Object>> rows = normalizeObjectList(raw);
        for (int index = 0; index < rows.size(); index += 1) {
            Map<String, Object> row = rows.get(index);
            Long buffId = toLong(row.get("buffId"));
            Integer buffSourceId = toInteger(row.get("buffSourceId"));
            if (buffId == null && buffSourceId == null) continue;
            jdbcTemplate.update(
                """
                INSERT INTO npc_buff_relations
                  (npc_id, buff_id, buff_source_id, relation_type, duration_ticks, chance_value, chance_text, conditions, notes, sort_order, status, deleted)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
                """,
                npcId,
                buffId,
                buffSourceId,
                defaultIfBlank(trimToNull(row.get("relationType")), "inflicts"),
                toInteger(row.get("durationTicks")),
                toDecimal(row.get("chanceValue")),
                trimToNull(row.get("chanceText")),
                trimToNull(row.get("conditions")),
                trimToNull(row.get("notes")),
                resolveSortOrder(row.get("sortOrder"), index)
            );
        }
    }

    private Map<String, Object> syncNpcShopEntries(Long npcId, Object raw) {
        List<Map<String, Object>> existingEntries = jdbcTemplate.queryForList("SELECT id FROM npc_shop_entries WHERE npc_id = ?", npcId);
        LinkedHashSet<Long> existingEntryIds = existingEntries.stream()
            .map(row -> toLong(row.get("id")))
            .filter(Objects::nonNull)
            .collect(Collectors.toCollection(LinkedHashSet::new));
        List<Long> entryIds = existingEntryIds.stream().toList();
        if (!entryIds.isEmpty()) {
            String placeholders = String.join(",", entryIds.stream().map(id -> "?").toList());
            jdbcTemplate.update("DELETE FROM npc_shop_conditions WHERE shop_entry_id IN (" + placeholders + ")", entryIds.toArray());
        }
        jdbcTemplate.update("DELETE FROM npc_shop_entries WHERE npc_id = ?", npcId);
        List<Map<String, Object>> rows = normalizeObjectList(raw);
        LinkedHashSet<Long> retainedEntryIds = new LinkedHashSet<>();
        int skippedCount = 0;
        int insertedCount = 0;
        int replacedCount = 0;
        for (int index = 0; index < rows.size(); index += 1) {
            Map<String, Object> row = rows.get(index);
            Long itemId = toLong(row.get("itemId"));
            Integer sourceItemId = toInteger(row.get("sourceItemId"));
            if (itemId == null && sourceItemId == null) {
                skippedCount += 1;
                continue;
            }
            Long requestEntryId = toLong(row.get("id"));
            if (requestEntryId != null && existingEntryIds.contains(requestEntryId)) {
                replacedCount += 1;
                retainedEntryIds.add(requestEntryId);
            } else {
                insertedCount += 1;
            }
            jdbcTemplate.update(
                """
                INSERT INTO npc_shop_entries
                  (npc_id, item_id, source_item_id, price_text, notes, sort_order, status, deleted)
                VALUES (?, ?, ?, ?, ?, ?, 1, 0)
                """,
                npcId,
                itemId,
                sourceItemId,
                trimToNull(row.get("priceText")),
                trimToNull(row.get("notes")),
                resolveSortOrder(row.get("sortOrder"), index)
            );
            Long shopEntryId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
            List<Map<String, Object>> conditions = normalizeObjectList(row.get("conditions"));
            for (int conditionIndex = 0; conditionIndex < conditions.size(); conditionIndex += 1) {
                Map<String, Object> condition = conditions.get(conditionIndex);
                String refType = normalizeConditionRefType(trimToNull(condition.get("refType")));
                Long refId = toLong(condition.get("refId"));
                if (refType == null || refId == null || refId <= 0) continue;
                jdbcTemplate.update(
                    """
                    INSERT INTO npc_shop_conditions
                      (shop_entry_id, ref_type, ref_id, condition_role, notes, sort_order)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    shopEntryId,
                    refType,
                    refId,
                    defaultIfBlank(trimToNull(condition.get("conditionRole")), "required"),
                    trimToNull(condition.get("notes")),
                    resolveSortOrder(condition.get("sortOrder"), conditionIndex)
                );
            }
        }
        int persistedCount = insertedCount + replacedCount;
        int removedCount = (int) existingEntryIds.stream().filter(id -> !retainedEntryIds.contains(id)).count();
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("submittedCount", rows.size());
        summary.put("persistedCount", persistedCount);
        summary.put("insertedCount", insertedCount);
        summary.put("replacedCount", replacedCount);
        summary.put("skippedCount", skippedCount);
        summary.put("removedCount", removedCount);
        return summary;
    }

    private List<Map<String, Object>> normalizeObjectList(Object raw) {
        if (raw == null) return List.of();
        Object source = raw;
        if (raw instanceof String text) {
            try {
                source = objectMapper.readValue(text, new TypeReference<>() {});
            } catch (Exception exception) {
                return List.of();
            }
        }
        if (!(source instanceof List<?> list)) return List.of();
        List<Map<String, Object>> normalized = new java.util.ArrayList<>();
        for (Object entry : list) {
            if (!(entry instanceof Map<?, ?> map)) continue;
            Map<String, Object> payload = new LinkedHashMap<>();
            map.forEach((key, value) -> payload.put(String.valueOf(key), value));
            normalized.add(payload);
        }
        return normalized;
    }

    private int resolveSortOrder(Object rawSortOrder, int index) {
        Integer sortOrder = toInteger(rawSortOrder);
        return sortOrder == null ? index + 1 : sortOrder;
    }

    private String normalizeConditionRefType(String rawType) {
        if (rawType == null) return null;
        String normalized = rawType.trim().toUpperCase();
        return switch (normalized) {
            case "BIOME" -> "BIOME";
            case "WORLD_CONTEXT", "CONTEXT", "ENVIRONMENT", "MOON_PHASE" -> "WORLD_CONTEXT";
            case "GAME_PERIOD", "PERIOD" -> "GAME_PERIOD";
            case "NPC" -> "NPC";
            case "ITEM" -> "ITEM";
            default -> null;
        };
    }

    private String defaultIfBlank(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
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

    private String trimToNull(Object value) {
        if (value == null) return null;
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }

    private Integer toInteger(Object value) {
        if (value == null) return null;
        if (value instanceof Number number) return number.intValue();
        try {
            return Integer.parseInt(String.valueOf(value).trim());
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private BigDecimal toDecimal(Object value) {
        if (value == null) return null;
        if (value instanceof BigDecimal decimal) return decimal;
        if (value instanceof Number number) return BigDecimal.valueOf(number.doubleValue());
        try {
            return new BigDecimal(String.valueOf(value).trim());
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private Boolean toBoolean(Object value) {
        if (value == null) return null;
        if (value instanceof Boolean bool) return bool;
        String text = String.valueOf(value).trim();
        if ("true".equalsIgnoreCase(text) || "1".equals(text)) return true;
        if ("false".equalsIgnoreCase(text) || "0".equals(text)) return false;
        return null;
    }

    private Long toLong(Object value) {
        if (value == null) return null;
        if (value instanceof Number number) return number.longValue();
        try {
            return Long.parseLong(String.valueOf(value).trim());
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

    private Long firstNonNullLong(Long... values) {
        if (values == null) return null;
        for (Long value : values) {
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

    private Boolean firstNonNullBoolean(Boolean... values) {
        if (values == null) return null;
        for (Boolean value : values) {
            if (value != null) return value;
        }
        return null;
    }

    private Map<Long, Category> loadCategoriesById(List<Long> categoryIds) {
        if (categoryIds == null || categoryIds.isEmpty()) {
            return Map.of();
        }
        return categoryMapper.selectBatchIds(categoryIds).stream()
            .filter(Objects::nonNull)
            .collect(Collectors.toMap(Category::getId, Function.identity(), (left, right) -> left, LinkedHashMap::new));
    }

    private Map<Long, BossGroup> loadBossGroupsById(List<Long> bossGroupIds) {
        if (bossGroupIds == null || bossGroupIds.isEmpty()) {
            return Map.of();
        }
        return bossGroupMapper.selectBatchIds(bossGroupIds).stream()
            .filter(Objects::nonNull)
            .collect(Collectors.toMap(BossGroup::getId, Function.identity(), (left, right) -> left, LinkedHashMap::new));
    }

    private Map<Long, Integer> countNpcRelationsByIds(String tableName, List<Long> npcIds) {
        if (jdbcTemplate == null || npcIds == null || npcIds.isEmpty()) {
            return Map.of();
        }

        List<Long> ids = npcIds.stream().filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) {
            return Map.of();
        }

        String placeholders = String.join(",", Collections.nCopies(ids.size(), "?"));
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            "SELECT npc_id AS npcId, COUNT(*) AS total FROM " + tableName + " WHERE deleted = 0 AND npc_id IN (" + placeholders + ") GROUP BY npc_id",
            ids.toArray()
        );

        Map<Long, Integer> result = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            Long npcId = toLong(row.get("npcId"));
            Integer total = toInteger(row.get("total"));
            if (npcId != null && total != null) {
                result.put(npcId, total);
            }
        }
        return result;
    }

    private Map<Long, NpcLootInheritance> loadNpcLootInheritanceBySourceIds(List<Long> sourceIds) {
        if (jdbcTemplate == null || sourceIds == null || sourceIds.isEmpty()) {
            return Map.of();
        }

        List<Long> ids = sourceIds.stream().filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) {
            return Map.of();
        }

        String placeholders = String.join(",", Collections.nCopies(ids.size(), "?"));
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
            SELECT
              n.game_id AS variantSourceId,
              n.id AS sourceNpcId,
              n.internal_name AS sourceInternalName,
              n.name AS sourceName,
              n.name_zh AS sourceNameZh,
              COUNT(nle.id) AS total
            FROM npcs n
            JOIN npc_loot_entries nle ON nle.npc_id = n.id AND nle.deleted = 0
            WHERE n.deleted = 0
              AND n.game_id IN (%s)
            GROUP BY n.game_id, n.id, n.internal_name, n.name, n.name_zh
            """.formatted(placeholders),
            ids.toArray()
        );

        Map<Long, NpcLootInheritance> result = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            Long variantSourceId = toLong(row.get("variantSourceId"));
            Long sourceNpcId = toLong(row.get("sourceNpcId"));
            Integer total = toInteger(row.get("total"));
            if (variantSourceId != null && sourceNpcId != null && total != null && total > 0) {
                result.put(variantSourceId, new NpcLootInheritance(
                    variantSourceId,
                    sourceNpcId,
                    trimToNull(row.get("sourceInternalName")),
                    trimToNull(row.get("sourceName")),
                    trimToNull(row.get("sourceNameZh")),
                    total
                ));
            }
        }
        return result;
    }

    private NpcLootInheritance loadNpcLootInheritance(Long sourceId) {
        if (sourceId == null) {
            return null;
        }
        return safeGet(loadNpcLootInheritanceBySourceIds(List.of(sourceId)), sourceId);
    }

    private Map<Long, Integer> countNpcDerivedLootEntriesBySourceIds(List<Long> npcSourceIds) {
        if (jdbcTemplate == null || npcSourceIds == null || npcSourceIds.isEmpty()) {
            return Map.of();
        }

        List<Long> ids = npcSourceIds.stream().filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) {
            return Map.of();
        }

        String placeholders = String.join(",", Collections.nCopies(ids.size(), "?"));
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
            SELECT source_ref_id AS sourceRefId, COUNT(*) AS total
            FROM item_acquisition_sources
            WHERE source_type = 'drop'
              AND source_ref_type = 'npc'
              AND source_ref_id IN (%s)
              AND status = 1
              AND deleted = 0
            GROUP BY source_ref_id
            """.formatted(placeholders),
            ids.toArray()
        );

        Map<Long, Integer> result = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            Long sourceId = toLong(row.get("sourceRefId"));
            Integer total = toInteger(row.get("total"));
            if (sourceId != null && total != null) {
                result.put(sourceId, total);
            }
        }
        return result;
    }

    private Map<String, Integer> countNpcDerivedLootEntriesByNames(List<String> npcNames) {
        if (jdbcTemplate == null || npcNames == null || npcNames.isEmpty()) {
            return Map.of();
        }

        List<String> normalizedNames = npcNames.stream()
            .map(this::trimToNull)
            .filter(Objects::nonNull)
            .map(name -> name.toLowerCase(Locale.ROOT))
            .distinct()
            .toList();
        if (normalizedNames.isEmpty()) {
            return Map.of();
        }

        String placeholders = String.join(",", Collections.nCopies(normalizedNames.size(), "?"));
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
            SELECT LOWER(TRIM(source_ref_name)) AS normalizedName, COUNT(*) AS total
            FROM item_acquisition_sources
            WHERE source_type = 'drop'
              AND source_ref_type = 'npc'
              AND source_ref_id IS NULL
              AND LOWER(TRIM(source_ref_name)) IN (%s)
              AND status = 1
              AND deleted = 0
            GROUP BY LOWER(TRIM(source_ref_name))
            """.formatted(placeholders),
            normalizedNames.toArray()
        );

        Map<String, Integer> result = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String normalizedName = trimToNull(row.get("normalizedName"));
            Integer total = toInteger(row.get("total"));
            if (normalizedName != null && total != null) {
                result.put(normalizedName.toLowerCase(Locale.ROOT), total);
            }
        }
        return result;
    }

    private int resolveDerivedLootCount(Npc npc, Map<Long, Integer> derivedBySourceId, Map<String, Integer> derivedByName) {
        if (npc == null) {
            return 0;
        }
        int bySourceId = safeGetOrDefault(derivedBySourceId, npc.getGameId(), 0);
        if (bySourceId > 0) {
            return bySourceId;
        }
        String normalizedName = trimToNull(npc.getName());
        if (normalizedName == null) {
            return 0;
        }
        return safeGetOrDefault(derivedByName, normalizedName.toLowerCase(Locale.ROOT), 0);
    }

    private Long resolveLootInheritanceSourceId(Npc npc, Map<String, Object> supplement) {
        if (npc == null) {
            return null;
        }
        Integer npcType = npc.getNpcType();
        if (npcType == null || npcType <= 0) {
            return null;
        }
        Long gameId = npc.getGameId();
        if (gameId != null && gameId.equals(npcType.longValue())) {
            return null;
        }
        return npcType.longValue();
    }

    private Integer resolveNpcType(Npc npc, Map<String, Object> supplement) {
        return firstNonNullInteger(npc == null ? null : npc.getNpcType(), toInteger(supplement == null ? null : supplement.get("npcType")));
    }

    private void putLootInheritance(Map<String, Object> payload, NpcLootInheritance inheritance) {
        payload.put("inheritedLootEntryCount", inheritance == null ? 0 : inheritance.lootCount());
        payload.put("lootInheritanceSourceId", inheritance == null ? null : inheritance.sourceId());
        payload.put("lootInheritanceNpcId", inheritance == null ? null : inheritance.sourceNpcId());
        payload.put("lootInheritanceInternalName", inheritance == null ? null : inheritance.sourceInternalName());
        payload.put("lootInheritanceName", inheritance == null ? null : inheritance.sourceName());
        payload.put("lootInheritanceNameZh", inheritance == null ? null : inheritance.sourceNameZh());
    }

    private <K, V> V safeGet(Map<K, V> map, K key) {
        if (map == null || key == null) {
            return null;
        }
        return map.get(key);
    }

    private <K, V> V safeGetOrDefault(Map<K, V> map, K key, V fallback) {
        if (map == null || key == null) {
            return fallback;
        }
        return map.getOrDefault(key, fallback);
    }

    private int countNpcRelations(String tableName, Long npcId) {
        if (npcId == null || jdbcTemplate == null) return 0;
        Integer total = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM " + tableName + " WHERE npc_id = ? AND deleted = 0",
            Integer.class,
            npcId
        );
        return total == null ? 0 : total;
    }

    private int countNpcDerivedLootEntries(Long npcSourceId, String npcName) {
        if (jdbcTemplate == null) return 0;
        if (npcSourceId != null) {
            int total = countNpcDerivedLootEntriesBySourceId(npcSourceId);
            if (total > 0) {
                return total;
            }
        }
        String normalizedNpcName = trimToNull(npcName);
        if (normalizedNpcName == null) {
            return 0;
        }
        Integer total = jdbcTemplate.queryForObject(
            """
            SELECT COUNT(*)
            FROM item_acquisition_sources
            WHERE source_type = 'drop'
              AND source_ref_type = 'npc'
              AND source_ref_id IS NULL
              AND LOWER(TRIM(source_ref_name)) = LOWER(TRIM(?))
              AND status = 1
              AND deleted = 0
            """,
            Integer.class,
            normalizedNpcName
        );
        return total == null ? 0 : total;
    }

    private int countNpcDerivedLootEntriesBySourceId(Long npcSourceId) {
        if (npcSourceId == null || jdbcTemplate == null) return 0;
        Integer total = jdbcTemplate.queryForObject(
            """
            SELECT COUNT(*)
            FROM item_acquisition_sources
            WHERE source_type = 'drop'
              AND source_ref_type = 'npc'
              AND source_ref_id = ?
              AND status = 1
              AND deleted = 0
            """,
            Integer.class,
            npcSourceId
        );
        return total == null ? 0 : total;
    }

    private boolean isValid(TimedValue<?> cached) {
        return cached != null && cached.expiresAtMillis() > System.currentTimeMillis();
    }

    private record TimedValue<T>(T value, long expiresAtMillis) {
    }

    private record NpcLootInheritance(
        Long sourceId,
        Long sourceNpcId,
        String sourceInternalName,
        String sourceName,
        String sourceNameZh,
        int lootCount
    ) {
    }
}

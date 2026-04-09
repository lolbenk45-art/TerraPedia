package com.terraria.skills.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.entity.BossGroup;
import com.terraria.skills.entity.Npc;
import com.terraria.skills.mapper.BossGroupMapper;
import com.terraria.skills.mapper.NpcMapper;
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
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@RestController
@RequestMapping("/admin/bosses")
@RequiredArgsConstructor
@Tag(name = "AdminBosses", description = "Admin boss group management")
@SecurityRequirement(name = "bearerAuth")
public class AdminBossController {

    private static final Map<String, List<String>> REFERENCE_BOSS_GROUP_CODES = Map.of(
        "MECHDUSA", List.of("THE_TWINS", "THE_DESTROYER", "SKELETRON_PRIME")
    );
    private static final Map<String, String> DEFAULT_SUMMON_METHODS = Map.ofEntries(
        Map.entry("KING_SLIME", "使用史莱姆王冠（Slime Crown）主动召唤；也可在史莱姆雨期间击杀足够史莱姆后出现，或极少在地图两侧外缘自然生成。"),
        Map.entry("EYE_OF_CTHULHU", "夜晚使用可疑眼球（Suspicious Looking Eye）召唤；满足生命值和防御条件后也可能在夜晚随机出现。"),
        Map.entry("EATER_OF_WORLDS", "在腐化之地使用蠕虫诱饵（Worm Food）召唤；也可通过摧毁 3 个暗影珠触发。"),
        Map.entry("BRAIN_OF_CTHULHU", "在猩红之地使用血腥脊椎（Bloody Spine）召唤；也可通过摧毁 3 个猩红心触发。"),
        Map.entry("QUEEN_BEE", "在地下丛林使用憎恶蜂巢（Abeemination）召唤；也可通过破坏蜂巢中的幼虫触发。"),
        Map.entry("SKELETRON", "夜晚在地牢门口与老人对话并选择诅咒即可召唤。"),
        Map.entry("DEERCLOPS", "在雪原使用鹿华（Deer Thing）主动召唤；也可能在暴风雪的午夜附近自然出现。"),
        Map.entry("WALL_OF_FLESH", "向地狱岩浆中丢入向导巫毒娃娃，且向导存活时即可召唤血肉墙。"),
        Map.entry("QUEEN_SLIME", "在神圣之地破坏明胶水晶（Gelatin Crystal）即可召唤。"),
        Map.entry("THE_TWINS", "夜晚使用机械魔眼（Mechanical Eye）召唤；满足条件时也可能在夜晚随机出现。"),
        Map.entry("THE_DESTROYER", "夜晚使用机械蠕虫（Mechanical Worm）召唤；满足条件时也可能在夜晚随机出现。"),
        Map.entry("SKELETRON_PRIME", "夜晚使用机械骷髅头（Mechanical Skull）召唤；满足条件时也可能在夜晚随机出现。"),
        Map.entry("PLANTERA", "击败三王后，在地下丛林破坏世纪之花花苞即可召唤。"),
        Map.entry("GOLEM", "在丛林神庙的蜥蜴祭坛上消耗蜥蜴能量电池（Lihzahrd Power Cell）召唤。"),
        Map.entry("DUKE_FISHRON", "在海洋中用装有松露虫（Truffle Worm）的鱼竿钓鱼即可召唤。"),
        Map.entry("EMPRESS_OF_LIGHT", "夜晚在地表神圣之地击杀七彩草蛉（Prismatic Lacewing）即可召唤。"),
        Map.entry("LUNATIC_CULTIST", "击败石巨人后，在地牢入口击杀拜月教邪教徒即可召唤。"),
        Map.entry("MOON_LORD", "摧毁全部四柱后会自动降临；也可使用天界符（Celestial Sigil）主动召唤。"),
        Map.entry("DARK_MAGE", "在永恒水晶座上放置永恒水晶并开启撒旦军队（Old One's Army）事件后，于对应波次出现。"),
        Map.entry("OGRE", "在撒旦军队（Old One's Army）事件的困难模式波次中出现。"),
        Map.entry("BETSY", "在石巨人后开启的撒旦军队（Old One's Army）最终波次出现。"),
        Map.entry("FLYING_DUTCHMAN", "在海盗入侵事件中出现。"),
        Map.entry("MOURNING_WOOD", "在南瓜月事件中出现。"),
        Map.entry("PUMPKING", "在南瓜月高波次中出现。"),
        Map.entry("EVERSCREAM", "在霜月事件中出现。"),
        Map.entry("SANTA_NK1", "在霜月事件中出现。"),
        Map.entry("ICE_QUEEN", "在霜月高波次中出现。"),
        Map.entry("MARTIAN_SAUCER", "触发火星暴乱事件后出现；通常需让火星探测怪发现玩家并成功逃离。"),
        Map.entry("SOLAR_PILLAR", "击败拜月教邪教徒后出现的天界柱之一，无需额外召唤物。"),
        Map.entry("NEBULA_PILLAR", "击败拜月教邪教徒后出现的天界柱之一，无需额外召唤物。"),
        Map.entry("VORTEX_PILLAR", "击败拜月教邪教徒后出现的天界柱之一，无需额外召唤物。"),
        Map.entry("STARDUST_PILLAR", "击败拜月教邪教徒后出现的天界柱之一，无需额外召唤物。"),
        Map.entry("MECHDUSA", "仅限天顶世界（Get fixed boi）等特殊种子，夜晚使用奥库瑞姆剃刀（Ocram's Razor）召唤。")
    );

    private final BossGroupMapper bossGroupMapper;
    private final NpcMapper npcMapper;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbcTemplate;

    @GetMapping
    @Operation(summary = "Get boss groups")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getBossGroups(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) String bossType
    ) {
        int safePage = PaginationParams.resolvePage(page);
        int safeLimit = PaginationParams.resolveLimit(limit, size, 20, 100);
        LambdaQueryWrapper<BossGroup> wrapper = new LambdaQueryWrapper<BossGroup>()
            .orderByAsc(BossGroup::getProgressionOrder, BossGroup::getId);
        if (bossType != null && !bossType.isBlank()) {
            wrapper.eq(BossGroup::getBossType, bossType.trim());
        }
        if (search != null && !search.isBlank()) {
            String keyword = search.trim();
            wrapper.and(w -> w.like(BossGroup::getCode, keyword)
                .or().like(BossGroup::getNameEn, keyword)
                .or().like(BossGroup::getNameZh, keyword)
                .or().like(BossGroup::getNotes, keyword));
        }
        Page<BossGroup> mpPage = bossGroupMapper.selectPage(new Page<>(safePage, safeLimit), wrapper);
        Pagination pagination = new Pagination(mpPage.getTotal(), (int) mpPage.getCurrent(), (int) mpPage.getSize());
        Map<String, Map<String, Object>> npcSupplementMap = loadNpcSupplementMap();
        ApiResponse<List<Map<String, Object>>> response = ApiResponse.success(mpPage.getRecords().stream()
            .map(bossGroup -> toSummaryPayload(bossGroup, npcSupplementMap))
            .toList());
        response.setPagination(pagination);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get boss group detail")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getBossGroupById(@PathVariable Long id) {
        BossGroup bossGroup = bossGroupMapper.selectById(id);
        if (bossGroup == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Boss group not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(toDetailPayload(bossGroup, loadNpcSupplementMap())));
    }

    @PostMapping
    @Transactional
    @Operation(summary = "Create boss group")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createBossGroup(@RequestBody Map<String, Object> request) {
        String code = trimToNull(firstValue(request, "code"));
        String nameEn = trimToNull(firstValue(request, "nameEn", "name"));
        if (code == null || nameEn == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "code and nameEn are required"));
        }
        long duplicate = bossGroupMapper.selectCount(new LambdaQueryWrapper<BossGroup>().eq(BossGroup::getCode, code));
        if (duplicate > 0) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "code already exists"));
        }
        BossGroup bossGroup = new BossGroup();
        applyFields(bossGroup, request, true);
        bossGroupMapper.insert(bossGroup);
        syncMembers(bossGroup.getId(), parseLongList(request.get("memberNpcIds")));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(toDetailPayload(bossGroupMapper.selectById(bossGroup.getId()), loadNpcSupplementMap()), "Boss group created"));
    }

    @PutMapping("/{id}")
    @Transactional
    @Operation(summary = "Update boss group")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateBossGroup(@PathVariable Long id, @RequestBody Map<String, Object> request) {
        BossGroup existing = bossGroupMapper.selectById(id);
        if (existing == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Boss group not found"));
        }
        String nextCode = trimToNull(firstNonNull(request, "code"));
        if (nextCode != null) {
            long duplicate = bossGroupMapper.selectCount(new LambdaQueryWrapper<BossGroup>()
                .eq(BossGroup::getCode, nextCode)
                .ne(BossGroup::getId, id));
            if (duplicate > 0) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "code already exists"));
            }
        }
        applyFields(existing, request, false);
        bossGroupMapper.updateById(existing);
        if (request.containsKey("memberNpcIds")) {
            syncMembers(id, parseLongList(request.get("memberNpcIds")));
        }
        return ResponseEntity.ok(ApiResponse.success(toDetailPayload(bossGroupMapper.selectById(id), loadNpcSupplementMap()), "Boss group updated"));
    }

    @DeleteMapping("/{id}")
    @Transactional
    @Operation(summary = "Delete boss group")
    public ResponseEntity<ApiResponse<Void>> deleteBossGroup(@PathVariable Long id) {
        BossGroup existing = bossGroupMapper.selectById(id);
        if (existing == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "Boss group not found"));
        }
        clearGroupAssignments(id);
        bossGroupMapper.deleteById(id);
        return ResponseEntity.ok(ApiResponse.success(null, "Boss group deleted"));
    }

    private Map<String, Object> toSummaryPayload(BossGroup bossGroup, Map<String, Map<String, Object>> npcSupplementMap) {
        Map<String, Object> payload = basePayload(bossGroup);
        List<Npc> members = loadMembers(bossGroup.getId());
        List<Map<String, Object>> referenceMembers = loadReferenceMembers(bossGroup, npcSupplementMap);
        Npc lootOwnerNpc = resolveLootOwnerNpc(members);
        List<Map<String, Object>> lootEntries = loadLootEntries(lootOwnerNpc == null ? null : lootOwnerNpc.getId());
        payload.put("memberCount", resolveVisibleMemberCount(members, referenceMembers));
        payload.put("memberNpcIds", members.stream().map(Npc::getId).filter(Objects::nonNull).toList());
        payload.put("memberNames", resolveVisibleMemberNames(members, referenceMembers));
        payload.put("memberSourceMode", resolveMemberSourceMode(members, referenceMembers));
        payload.put("referenceMemberCount", referenceMembers.size());
        payload.put("referenceBossCodes", REFERENCE_BOSS_GROUP_CODES.getOrDefault(bossGroup.getCode(), List.of()));
        payload.put("lootEntryCount", lootEntries.size());
        payload.put("uniqueLootItemCount", countUniqueLootItems(lootEntries));
        payload.put("lootOwnerNpcId", lootOwnerNpc == null ? null : lootOwnerNpc.getId());
        payload.put("lootOwnerNpcName", lootOwnerNpc == null ? null : firstNonBlank(lootOwnerNpc.getNameZh(), lootOwnerNpc.getName(), lootOwnerNpc.getInternalName()));
        return payload;
    }

    private List<String> resolveVisibleMemberNames(List<Npc> members, List<Map<String, Object>> referenceMembers) {
        if (members != null && !members.isEmpty()) {
            return members.stream()
                .map(npc -> firstNonBlank(npc.getNameZh(), npc.getName(), npc.getInternalName()))
                .filter(Objects::nonNull)
                .limit(4)
                .toList();
        }
        return referenceMembers.stream()
            .map(member -> firstNonBlank(
                trimToNull(member.get("nameZh")),
                trimToNull(member.get("name")),
                trimToNull(member.get("internalName"))
            ))
            .filter(Objects::nonNull)
            .limit(4)
            .toList();
    }

    private Map<String, Object> toDetailPayload(BossGroup bossGroup, Map<String, Map<String, Object>> npcSupplementMap) {
        List<Npc> assignedMembers = loadMembers(bossGroup.getId());
        Map<String, Object> payload = toSummaryPayload(bossGroup, npcSupplementMap);
        List<Map<String, Object>> members = buildMemberPayloads(assignedMembers, npcSupplementMap, null);
        List<Map<String, Object>> referenceMembers = loadReferenceMembers(bossGroup, npcSupplementMap);
        Npc lootOwnerNpc = resolveLootOwnerNpc(assignedMembers);
        List<Map<String, Object>> lootEntries = loadLootEntries(lootOwnerNpc == null ? null : lootOwnerNpc.getId());
        payload.put("members", members);
        payload.put("referenceMembers", referenceMembers);
        payload.put("memberSourceMode", resolveMemberSourceMode(members, referenceMembers));
        payload.put("memberCount", resolveVisibleMemberCount(members, referenceMembers));
        payload.put("lootOwnerNpc", toNpcSummaryPayload(lootOwnerNpc));
        payload.put("lootEntries", lootEntries);
        payload.put("directLootCount", countLootEntriesByKind(lootEntries, "direct_boss"));
        payload.put("treasureBagLootCount", countLootEntriesByKind(lootEntries, "treasure_bag"));
        payload.put("uniqueLootItemCount", countUniqueLootItems(lootEntries));
        return payload;
    }

    private Map<String, Object> basePayload(BossGroup bossGroup) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", bossGroup.getId());
        payload.put("code", bossGroup.getCode());
        payload.put("nameEn", bossGroup.getNameEn());
        payload.put("nameZh", bossGroup.getNameZh());
        payload.put("name", firstNonBlank(bossGroup.getNameZh(), bossGroup.getNameEn(), bossGroup.getCode()));
        payload.put("bossType", bossGroup.getBossType());
        payload.put("imageUrl", bossGroup.getImageUrl());
        payload.put("progressionOrder", bossGroup.getProgressionOrder());
        payload.put("notes", bossGroup.getNotes());
        payload.put("summonMethod", resolveSummonMethod(bossGroup));
        payload.put("sourcePage", bossGroup.getSourcePage());
        payload.put("sourceRevisionTimestamp", bossGroup.getSourceRevisionTimestamp());
        payload.put("status", bossGroup.getStatus());
        payload.put("createdAt", bossGroup.getCreatedAt());
        payload.put("updatedAt", bossGroup.getUpdatedAt());
        return payload;
    }

    private List<Npc> loadMembers(Long bossGroupId) {
        return npcMapper.selectList(new LambdaQueryWrapper<Npc>()
            .eq(Npc::getBossGroupId, bossGroupId)
            .orderByAsc(Npc::getGameId, Npc::getId));
    }

    private Npc resolveLootOwnerNpc(List<Npc> members) {
        if (members == null || members.isEmpty()) {
            return null;
        }
        return members.stream()
            .filter(Objects::nonNull)
            .filter(member -> "primary".equalsIgnoreCase(trimToNull(member.getBossRole())))
            .findFirst()
            .orElse(null);
    }

    private String resolveSummonMethod(BossGroup bossGroup) {
        if (bossGroup == null) {
            return null;
        }
        String explicit = trimToNull(bossGroup.getSummonMethod());
        if (explicit != null) {
            return explicit;
        }
        String code = trimToNull(bossGroup.getCode());
        if (code == null) {
            return null;
        }
        return DEFAULT_SUMMON_METHODS.get(code);
    }

    private Map<String, Object> toNpcSummaryPayload(Npc npc) {
        if (npc == null) {
            return null;
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", npc.getId());
        payload.put("gameId", npc.getGameId());
        payload.put("internalName", npc.getInternalName());
        payload.put("name", npc.getName());
        payload.put("nameZh", npc.getNameZh());
        payload.put("bossRole", npc.getBossRole());
        payload.put("displayName", firstNonBlank(npc.getNameZh(), npc.getName(), npc.getInternalName()));
        return payload;
    }

    private List<Map<String, Object>> loadLootEntries(Long npcId) {
        if (npcId == null || jdbcTemplate == null) {
            return List.of();
        }
        return jdbcTemplate.queryForList(
            """
            SELECT
              nle.id,
              nle.npc_id AS npcId,
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
            ORDER BY
              CASE nle.drop_source_kind
                WHEN 'direct_boss' THEN 0
                WHEN 'treasure_bag' THEN 1
                ELSE 9
              END ASC,
              nle.sort_order ASC,
              nle.id ASC
            """,
            npcId
        );
    }

    private int countLootEntriesByKind(List<Map<String, Object>> lootEntries, String kind) {
        if (lootEntries == null || lootEntries.isEmpty() || kind == null) {
            return 0;
        }
        int count = 0;
        for (Map<String, Object> entry : lootEntries) {
            if (kind.equalsIgnoreCase(trimToNull(entry.get("dropSourceKind")))) {
                count += 1;
            }
        }
        return count;
    }

    private int countUniqueLootItems(List<Map<String, Object>> lootEntries) {
        if (lootEntries == null || lootEntries.isEmpty()) {
            return 0;
        }
        Set<String> uniqueKeys = new LinkedHashSet<>();
        for (Map<String, Object> entry : lootEntries) {
            String key = firstNonBlank(
                toLong(entry.get("itemId")) == null ? null : "id:" + toLong(entry.get("itemId")),
                trimToNull(entry.get("itemInternalName")) == null ? null : "internal:" + trimToNull(entry.get("itemInternalName")),
                trimToNull(entry.get("itemName")) == null ? null : "name:" + trimToNull(entry.get("itemName")),
                toLong(entry.get("sourceItemId")) == null ? null : "source:" + toLong(entry.get("sourceItemId"))
            );
            if (key != null) {
                uniqueKeys.add(key);
            }
        }
        return uniqueKeys.size();
    }

    private int resolveVisibleMemberCount(List<?> members, List<?> referenceMembers) {
        if (members != null && !members.isEmpty()) {
            return members.size();
        }
        return referenceMembers == null ? 0 : referenceMembers.size();
    }

    private String resolveMemberSourceMode(List<?> members, List<?> referenceMembers) {
        if (members != null && !members.isEmpty()) {
            return "assigned";
        }
        if (referenceMembers != null && !referenceMembers.isEmpty()) {
            return "reference";
        }
        return "none";
    }

    private List<Map<String, Object>> buildMemberPayloads(
        List<Npc> members,
        Map<String, Map<String, Object>> npcSupplementMap,
        String sourceBossCode
    ) {
        if (members == null || members.isEmpty()) {
            return List.of();
        }
        return members.stream()
            .map(npc -> {
                Map<String, Object> member = new LinkedHashMap<>();
                member.put("id", npc.getId());
                member.put("gameId", npc.getGameId());
                member.put("internalName", npc.getInternalName());
                member.put("name", npc.getName());
                member.put("nameZh", npc.getNameZh());
                member.put("bossRole", npc.getBossRole());
                member.put("isBoss", npc.getIsBoss());
                member.put("isFriendly", npc.getIsFriendly());
                member.put("isTownNpc", npc.getIsTownNpc());
                member.put("imageUrl", resolveNpcImageUrl(npc, npcSupplementMap));
                if (sourceBossCode != null) {
                    member.put("sourceBossCode", sourceBossCode);
                }
                return member;
            })
            .toList();
    }

    private List<Map<String, Object>> loadReferenceMembers(BossGroup bossGroup, Map<String, Map<String, Object>> npcSupplementMap) {
        List<String> codes = REFERENCE_BOSS_GROUP_CODES.getOrDefault(trimToNull(bossGroup.getCode()), List.of());
        if (codes.isEmpty()) {
            return List.of();
        }

        List<BossGroup> referencedGroups = bossGroupMapper.selectList(new LambdaQueryWrapper<BossGroup>()
            .in(BossGroup::getCode, codes));
        if (referencedGroups == null || referencedGroups.isEmpty()) {
            return List.of();
        }

        Map<String, BossGroup> byCode = new LinkedHashMap<>();
        for (BossGroup group : referencedGroups) {
            String code = trimToNull(group.getCode());
            if (code != null) {
                byCode.put(code, group);
            }
        }

        List<Map<String, Object>> referenceMembers = new ArrayList<>();
        for (String code : codes) {
            BossGroup group = byCode.get(code);
            if (group == null) {
                continue;
            }
            referenceMembers.addAll(buildMemberPayloads(loadMembers(group.getId()), npcSupplementMap, code));
        }
        return referenceMembers.stream()
            .sorted(Comparator
                .comparing((Map<String, Object> member) -> roleSortOrder(trimToNull(member.get("bossRole"))))
                .thenComparing(member -> trimToNull(member.get("sourceBossCode")), Comparator.nullsLast(String::compareTo))
                .thenComparing(member -> trimToNull(member.get("internalName")), Comparator.nullsLast(String::compareTo))
                .thenComparing(member -> toLong(member.get("id")), Comparator.nullsLast(Long::compareTo)))
            .toList();
    }

    private int roleSortOrder(String bossRole) {
        if (bossRole == null) {
            return 99;
        }
        return switch (bossRole.trim().toLowerCase()) {
            case "primary" -> 0;
            case "phase" -> 1;
            case "part" -> 2;
            case "clone" -> 3;
            default -> 10;
        };
    }

    private String resolveNpcImageUrl(Npc npc, Map<String, Map<String, Object>> npcSupplementMap) {
        if (npc == null || npc.getGameId() == null || npcSupplementMap == null || npcSupplementMap.isEmpty()) {
            return null;
        }
        Map<String, Object> supplement = npcSupplementMap.get(String.valueOf(npc.getGameId()));
        if (supplement == null) {
            return null;
        }
        return firstNonBlank(
            trimToNull(supplement.get("imageUrl")),
            extractImageUrlFromRawJson(supplement.get("rawJson"))
        );
    }

    private String extractImageUrlFromRawJson(Object rawJson) {
        if (!(rawJson instanceof String text) || text.isBlank()) {
            return null;
        }
        try {
            Object parsed = objectMapper.readValue(text, Object.class);
            if (!(parsed instanceof Map<?, ?> map)) {
                return null;
            }
            return firstNonBlank(
                trimToNull(map.get("imageUrl")),
                trimToNull(map.get("image_url"))
            );
        } catch (Exception exception) {
            return null;
        }
    }

    private Map<String, Map<String, Object>> loadNpcSupplementMap() {
        Path path = resolveDataFile(Path.of("generated", "npc-standardized-map.json"));
        if (path == null) {
            return Map.of();
        }
        try {
            Map<String, Object> root = objectMapper.readValue(path.toFile(), new TypeReference<>() {});
            Object recordsRaw = root == null ? null : root.get("records");
            if (!(recordsRaw instanceof Map<?, ?> records)) {
                return Map.of();
            }
            Map<String, Map<String, Object>> lookup = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : records.entrySet()) {
                if (entry.getKey() == null || !(entry.getValue() instanceof Map<?, ?> value)) {
                    continue;
                }
                Map<String, Object> normalized = new LinkedHashMap<>();
                for (Map.Entry<?, ?> field : value.entrySet()) {
                    if (field.getKey() != null) {
                        normalized.put(String.valueOf(field.getKey()), field.getValue());
                    }
                }
                lookup.put(String.valueOf(entry.getKey()), normalized);
            }
            return lookup;
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
            if (Files.exists(candidate)) {
                return candidate;
            }
        }
        return null;
    }

    private void syncMembers(Long bossGroupId, List<Long> memberNpcIds) {
        clearGroupAssignments(bossGroupId);
        if (memberNpcIds == null || memberNpcIds.isEmpty()) {
            return;
        }
        List<Npc> npcs = npcMapper.selectBatchIds(memberNpcIds);
        for (Npc npc : npcs) {
            npc.setIsBoss(true);
            npc.setBossGroupId(bossGroupId);
            if (trimToNull(npc.getBossRole()) == null) {
                npc.setBossRole("primary");
            }
            npcMapper.updateById(npc);
        }
    }

    private void clearGroupAssignments(Long bossGroupId) {
        List<Npc> existingMembers = loadMembers(bossGroupId);
        for (Npc npc : existingMembers) {
            npc.setBossGroupId(null);
            npc.setBossRole(null);
            npcMapper.updateById(npc);
        }
    }

    private void applyFields(BossGroup target, Map<String, Object> request, boolean creating) {
        if (creating || request.containsKey("code")) {
            target.setCode(trimToNull(firstValue(request, "code")));
        }
        if (creating || request.containsKey("nameEn") || request.containsKey("name")) {
            target.setNameEn(firstNonBlank(trimToNull(firstValue(request, "nameEn")), trimToNull(firstValue(request, "name"))));
        }
        if (creating || request.containsKey("nameZh")) {
            target.setNameZh(trimToNull(firstValue(request, "nameZh")));
        }
        if (creating || request.containsKey("bossType")) {
            target.setBossType(trimToNull(firstValue(request, "bossType")));
        }
        if (creating || request.containsKey("imageUrl")) {
            target.setImageUrl(trimToNull(firstValue(request, "imageUrl")));
        }
        if (creating || request.containsKey("progressionOrder")) {
            Integer progressionOrder = toInteger(firstValue(request, "progressionOrder"));
            target.setProgressionOrder(progressionOrder == null ? 0 : progressionOrder);
        }
        if (creating || request.containsKey("notes")) {
            target.setNotes(trimToNull(firstValue(request, "notes")));
        }
        if (creating || request.containsKey("summonMethod")) {
            target.setSummonMethod(trimToNull(firstValue(request, "summonMethod")));
        }
        if (creating || request.containsKey("sourcePage")) {
            target.setSourcePage(trimToNull(firstValue(request, "sourcePage")));
        }
        if (creating || request.containsKey("sourceRevisionTimestamp")) {
            target.setSourceRevisionTimestamp(parseDateTime(trimToNull(firstValue(request, "sourceRevisionTimestamp"))));
        }
        if (creating || request.containsKey("status")) {
            Integer status = toInteger(firstValue(request, "status"));
            target.setStatus(status == null ? 1 : status);
        }
        if (creating) {
            target.setDeleted(0);
        }
    }

    private List<Long> parseLongList(Object raw) {
        if (raw == null) {
            return List.of();
        }
        List<?> source = null;
        if (raw instanceof List<?> list) {
            source = list;
        } else if (raw instanceof String text && !text.isBlank()) {
            try {
                Object parsed = objectMapper.readValue(text, new TypeReference<>() {});
                if (parsed instanceof List<?> list) {
                    source = list;
                }
            } catch (Exception ignored) {
            }
        }
        if (source == null) {
            return List.of();
        }
        LinkedHashSet<Long> values = new LinkedHashSet<>();
        for (Object entry : source) {
            Long id = toLong(entry);
            if (id != null && id > 0) {
                values.add(id);
            }
        }
        return new ArrayList<>(values);
    }

    private Object firstNonNull(Map<String, Object> source, String key) {
        return source == null ? null : source.get(key);
    }

    private Object firstValue(Map<String, Object> source, String... keys) {
        if (source == null || keys == null) {
            return null;
        }
        for (String key : keys) {
            if (key == null) {
                continue;
            }
            Object value = source.get(key);
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            String trimmed = trimToNull(value);
            if (trimmed != null) {
                return trimmed;
            }
        }
        return null;
    }

    private Integer toInteger(Object raw) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(raw).trim());
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private Long toLong(Object raw) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(raw).trim());
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private java.time.LocalDateTime parseDateTime(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return java.time.LocalDateTime.parse(raw.trim());
        } catch (Exception exception) {
            return null;
        }
    }

    private String trimToNull(Object value) {
        if (value == null) {
            return null;
        }
        String trimmed = String.valueOf(value).trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}

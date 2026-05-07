package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.PublicBossDetailDTO;
import com.terraria.skills.dto.PublicBossListDTO;
import com.terraria.skills.dto.PublicBossLootEntryDTO;
import com.terraria.skills.dto.PublicBossLootOwnerDTO;
import com.terraria.skills.dto.PublicBossMemberDTO;
import com.terraria.skills.dto.PublicBossQuery;
import com.terraria.skills.entity.BossGroup;
import com.terraria.skills.entity.Npc;
import com.terraria.skills.mapper.BossGroupMapper;
import com.terraria.skills.mapper.NpcMapper;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import com.terraria.skills.service.PublicBossService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

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

@Service
@RequiredArgsConstructor
public class PublicBossServiceImpl implements PublicBossService {

    private static final List<String> BOSS_MANAGED_IMAGE_URL_PREFIXES = List.of(
        "http://localhost:9000/terrapedia-images/bosses/",
        "http://127.0.0.1:9000/terrapedia-images/bosses/"
    );

    private static final Map<String, List<String>> REFERENCE_BOSS_GROUP_CODES = Map.of(
        "MECHDUSA", List.of("THE_TWINS", "THE_DESTROYER", "SKELETRON_PRIME")
    );

    private static final Map<String, String> DEFAULT_SUMMON_METHODS = Map.ofEntries(
        Map.entry("KING_SLIME", "Use the Slime Crown to summon King Slime."),
        Map.entry("EYE_OF_CTHULHU", "Use the Suspicious Looking Eye at night, or wait for a natural night spawn."),
        Map.entry("WALL_OF_FLESH", "Throw the Guide Voodoo Doll into lava while the Guide is alive."),
        Map.entry("QUEEN_SLIME", "Break a Gelatin Crystal in the Hallow."),
        Map.entry("MOON_LORD", "Defeat all Celestial Pillars or use the Celestial Sigil."),
        Map.entry("MECHDUSA", "Only on get fixed boi, use Ocram's Razor at night to summon Mechdusa.")
    );

    private final BossGroupMapper bossGroupMapper;
    private final NpcMapper npcMapper;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final ManagedImageUrlPolicy managedImageUrlPolicy;

    @Override
    public Page<PublicBossListDTO> getPublicBosses(PublicBossQuery query) {
        PublicBossQuery safeQuery = query == null ? new PublicBossQuery() : query;
        Page<BossGroup> page = bossGroupMapper.selectPage(
            new Page<>(Math.max(1, safeQuery.getPage()), Math.max(1, safeQuery.getLimit())),
            buildListWrapper(safeQuery)
        );

        Map<String, Map<String, Object>> npcSupplementMap = loadNpcSupplementMap();
        Page<PublicBossListDTO> result = new Page<>(page.getCurrent(), page.getSize(), page.getTotal());
        result.setRecords(page.getRecords().stream()
            .map(bossGroup -> toListDto(bossGroup, npcSupplementMap))
            .toList());
        return result;
    }

    @Override
    public PublicBossDetailDTO getPublicBossById(Long id) {
        if (id == null) {
            return null;
        }

        BossGroup bossGroup = bossGroupMapper.selectById(id);
        if (!isPublicBoss(bossGroup)) {
            return null;
        }

        return toDetailDto(bossGroup, loadNpcSupplementMap());
    }

    private LambdaQueryWrapper<BossGroup> buildListWrapper(PublicBossQuery query) {
        LambdaQueryWrapper<BossGroup> wrapper = new LambdaQueryWrapper<>();
        wrapper.and(scope -> scope.eq(BossGroup::getStatus, 1).or().isNull(BossGroup::getStatus));

        if (query.getBossType() != null && !query.getBossType().isBlank()) {
            wrapper.eq(BossGroup::getBossType, query.getBossType().trim());
        }
        if (query.getSearch() != null && !query.getSearch().isBlank()) {
            String keyword = query.getSearch().trim();
            wrapper.and(scope -> scope.like(BossGroup::getCode, keyword)
                .or().like(BossGroup::getNameEn, keyword)
                .or().like(BossGroup::getNameZh, keyword)
                .or().like(BossGroup::getNotes, keyword));
        }

        String sortBy = normalizeSortBy(query.getSortBy());
        boolean ascending = "asc".equals(normalizeSortDirection(query.getSortDirection()));
        switch (sortBy) {
            case "name" -> wrapper.orderBy(true, ascending, BossGroup::getNameZh)
                .orderBy(true, ascending, BossGroup::getNameEn)
                .orderBy(true, ascending, BossGroup::getId);
            case "id" -> wrapper.orderBy(true, ascending, BossGroup::getId);
            default -> wrapper.orderBy(true, ascending, BossGroup::getProgressionOrder)
                .orderBy(true, ascending, BossGroup::getId);
        }
        return wrapper;
    }

    private boolean isPublicBoss(BossGroup bossGroup) {
        if (bossGroup == null) {
            return false;
        }
        return bossGroup.getStatus() == null || bossGroup.getStatus() == 1;
    }

    private PublicBossListDTO toListDto(BossGroup bossGroup, Map<String, Map<String, Object>> npcSupplementMap) {
        PublicBossListDTO dto = new PublicBossListDTO();
        applyBaseFields(dto, bossGroup);

        List<Npc> members = loadMembers(bossGroup.getId());
        List<PublicBossMemberDTO> referenceMembers = loadReferenceMembers(bossGroup, npcSupplementMap);
        Npc lootOwnerNpc = resolveLootOwnerNpc(members);
        List<PublicBossLootEntryDTO> lootEntries = loadLootEntries(lootOwnerNpc == null ? null : lootOwnerNpc.getId());

        dto.setMemberCount(resolveVisibleMemberCount(members, referenceMembers));
        dto.setMemberNames(resolveVisibleMemberNames(members, referenceMembers));
        dto.setMemberSourceMode(resolveMemberSourceMode(members, referenceMembers));
        dto.setLootEntryCount(lootEntries.size());
        dto.setUniqueLootItemCount(countUniqueLootItems(lootEntries));
        return dto;
    }

    private PublicBossDetailDTO toDetailDto(BossGroup bossGroup, Map<String, Map<String, Object>> npcSupplementMap) {
        PublicBossDetailDTO dto = new PublicBossDetailDTO();
        applyBaseFields(dto, bossGroup);

        List<Npc> members = loadMembers(bossGroup.getId());
        List<PublicBossMemberDTO> memberDtos = buildMemberDtos(members, npcSupplementMap, null);
        List<PublicBossMemberDTO> referenceMembers = loadReferenceMembers(bossGroup, npcSupplementMap);
        Npc lootOwnerNpc = resolveLootOwnerNpc(members);
        List<PublicBossLootEntryDTO> lootEntries = loadLootEntries(lootOwnerNpc == null ? null : lootOwnerNpc.getId());

        dto.setMembers(memberDtos);
        dto.setReferenceMembers(referenceMembers);
        dto.setLootOwnerNpc(toLootOwnerDto(lootOwnerNpc));
        dto.setLootEntries(lootEntries);
        dto.setMemberCount(resolveVisibleMemberCount(memberDtos, referenceMembers));
        dto.setMemberNames(resolveVisibleMemberNames(members, referenceMembers));
        dto.setMemberSourceMode(resolveMemberSourceMode(memberDtos, referenceMembers));
        dto.setLootEntryCount(lootEntries.size());
        dto.setDirectLootCount(countLootEntriesByKind(lootEntries, "direct_boss"));
        dto.setTreasureBagLootCount(countLootEntriesByKind(lootEntries, "treasure_bag"));
        dto.setUniqueLootItemCount(countUniqueLootItems(lootEntries));
        return dto;
    }

    private void applyBaseFields(PublicBossListDTO dto, BossGroup bossGroup) {
        dto.setId(bossGroup.getId());
        dto.setCode(bossGroup.getCode());
        dto.setName(firstNonBlank(bossGroup.getNameZh(), bossGroup.getNameEn(), bossGroup.getCode()));
        dto.setNameZh(bossGroup.getNameZh());
        dto.setNameEn(bossGroup.getNameEn());
        dto.setBossType(bossGroup.getBossType());
        dto.setImageUrl(managedImageOrNull(bossGroup.getImageUrl()));
        dto.setProgressionOrder(bossGroup.getProgressionOrder());
        dto.setSummonMethod(resolveSummonMethod(bossGroup));
        dto.setNotes(trimToNull(bossGroup.getNotes()));
    }

    private List<Npc> loadMembers(Long bossGroupId) {
        if (bossGroupId == null) {
            return List.of();
        }
        return npcMapper.selectList(new LambdaQueryWrapper<Npc>()
            .eq(Npc::getBossGroupId, bossGroupId)
            .and(scope -> scope.eq(Npc::getStatus, 1).or().isNull(Npc::getStatus))
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
            .orElseGet(() -> members.stream().filter(Objects::nonNull).findFirst().orElse(null));
    }

    private List<PublicBossMemberDTO> buildMemberDtos(
        List<Npc> members,
        Map<String, Map<String, Object>> npcSupplementMap,
        String sourceBossCode
    ) {
        if (members == null || members.isEmpty()) {
            return List.of();
        }
        return members.stream()
            .map(npc -> {
                PublicBossMemberDTO dto = new PublicBossMemberDTO();
                dto.setId(npc.getId());
                dto.setGameId(npc.getGameId());
                dto.setInternalName(npc.getInternalName());
                dto.setName(npc.getName());
                dto.setNameZh(npc.getNameZh());
                dto.setBossRole(npc.getBossRole());
                dto.setImageUrl(resolveNpcImageUrl(npc, npcSupplementMap));
                dto.setSourceBossCode(sourceBossCode);
                return dto;
            })
            .toList();
    }

    private List<PublicBossMemberDTO> loadReferenceMembers(BossGroup bossGroup, Map<String, Map<String, Object>> npcSupplementMap) {
        List<String> codes = REFERENCE_BOSS_GROUP_CODES.getOrDefault(trimToNull(bossGroup.getCode()), List.of());
        if (codes.isEmpty()) {
            return List.of();
        }

        List<BossGroup> referencedGroups = bossGroupMapper.selectList(new LambdaQueryWrapper<BossGroup>()
            .in(BossGroup::getCode, codes)
            .and(scope -> scope.eq(BossGroup::getStatus, 1).or().isNull(BossGroup::getStatus)));
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

        List<PublicBossMemberDTO> referenceMembers = new ArrayList<>();
        for (String code : codes) {
            BossGroup referencedGroup = byCode.get(code);
            if (referencedGroup == null) {
                continue;
            }
            referenceMembers.addAll(buildMemberDtos(loadMembers(referencedGroup.getId()), npcSupplementMap, code));
        }

        return referenceMembers.stream()
            .sorted(Comparator
                .comparing((PublicBossMemberDTO member) -> roleSortOrder(member.getBossRole()))
                .thenComparing(PublicBossMemberDTO::getSourceBossCode, Comparator.nullsLast(String::compareTo))
                .thenComparing(PublicBossMemberDTO::getInternalName, Comparator.nullsLast(String::compareTo))
                .thenComparing(PublicBossMemberDTO::getId, Comparator.nullsLast(Long::compareTo)))
            .toList();
    }

    private PublicBossLootOwnerDTO toLootOwnerDto(Npc npc) {
        if (npc == null) {
            return null;
        }
        PublicBossLootOwnerDTO dto = new PublicBossLootOwnerDTO();
        dto.setId(npc.getId());
        dto.setGameId(npc.getGameId());
        dto.setInternalName(npc.getInternalName());
        dto.setName(npc.getName());
        dto.setNameZh(npc.getNameZh());
        dto.setBossRole(npc.getBossRole());
        dto.setDisplayName(firstNonBlank(npc.getNameZh(), npc.getName(), npc.getInternalName()));
        return dto;
    }

    private List<PublicBossLootEntryDTO> loadLootEntries(Long npcId) {
        if (npcId == null || jdbcTemplate == null) {
            return List.of();
        }

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
        ).stream().map(this::toLootEntryDto).toList();
    }

    private PublicBossLootEntryDTO toLootEntryDto(Map<String, Object> row) {
        PublicBossLootEntryDTO dto = new PublicBossLootEntryDTO();
        dto.setId(toLong(row.get("id")));
        dto.setItemId(toLong(row.get("itemId")));
        dto.setSourceItemId(toInteger(row.get("sourceItemId")));
        dto.setDropSourceKind(trimToNull(row.get("dropSourceKind")));
        dto.setQuantityMin(toInteger(row.get("quantityMin")));
        dto.setQuantityMax(toInteger(row.get("quantityMax")));
        dto.setQuantityText(trimToNull(row.get("quantityText")));
        dto.setChanceValue(toBigDecimal(row.get("chanceValue")));
        dto.setChanceText(trimToNull(row.get("chanceText")));
        dto.setConditions(trimToNull(row.get("conditions")));
        dto.setNotes(trimToNull(row.get("notes")));
        dto.setSortOrder(toInteger(row.get("sortOrder")));
        dto.setItemName(trimToNull(row.get("itemName")));
        dto.setItemNameZh(trimToNull(row.get("itemNameZh")));
        dto.setItemInternalName(trimToNull(row.get("itemInternalName")));
        dto.setItemImage(managedImageOrNull(trimToNull(row.get("itemImage"))));
        return dto;
    }

    private int countLootEntriesByKind(List<PublicBossLootEntryDTO> lootEntries, String kind) {
        if (lootEntries == null || lootEntries.isEmpty() || kind == null) {
            return 0;
        }
        int count = 0;
        for (PublicBossLootEntryDTO entry : lootEntries) {
            if (kind.equalsIgnoreCase(trimToNull(entry.getDropSourceKind()))) {
                count += 1;
            }
        }
        return count;
    }

    private int countUniqueLootItems(List<PublicBossLootEntryDTO> lootEntries) {
        if (lootEntries == null || lootEntries.isEmpty()) {
            return 0;
        }
        Set<String> uniqueKeys = new LinkedHashSet<>();
        for (PublicBossLootEntryDTO entry : lootEntries) {
            String key = firstNonBlank(
                entry.getItemId() == null ? null : "id:" + entry.getItemId(),
                trimToNull(entry.getItemInternalName()) == null ? null : "internal:" + trimToNull(entry.getItemInternalName()),
                trimToNull(entry.getItemName()) == null ? null : "name:" + trimToNull(entry.getItemName()),
                entry.getSourceItemId() == null ? null : "source:" + entry.getSourceItemId()
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

    private List<String> resolveVisibleMemberNames(List<Npc> members, List<PublicBossMemberDTO> referenceMembers) {
        if (members != null && !members.isEmpty()) {
            return members.stream()
                .map(member -> firstNonBlank(member.getNameZh(), member.getName(), member.getInternalName()))
                .filter(Objects::nonNull)
                .limit(4)
                .toList();
        }
        return referenceMembers.stream()
            .map(member -> firstNonBlank(member.getNameZh(), member.getName(), member.getInternalName()))
            .filter(Objects::nonNull)
            .limit(4)
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
        if (npc == null) {
            return null;
        }
        if (managedImageOrNull(npc.getImageUrl()) != null) {
            return managedImageOrNull(npc.getImageUrl());
        }
        if (npc.getGameId() == null || npcSupplementMap == null || npcSupplementMap.isEmpty()) {
            return null;
        }
        Map<String, Object> supplement = npcSupplementMap.get(String.valueOf(npc.getGameId()));
        if (supplement == null) {
            return null;
        }
        return firstNonBlank(
            managedImageOrNull(trimToNull(supplement.get("imageUrl"))),
            managedImageOrNull(extractImageUrlFromRawJson(supplement.get("rawJson")))
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

    private String normalizeSortBy(String sortBy) {
        if (sortBy == null || sortBy.isBlank()) {
            return "progressionOrder";
        }
        return switch (sortBy.trim()) {
            case "id" -> "id";
            case "name" -> "name";
            default -> "progressionOrder";
        };
    }

    private String normalizeSortDirection(String sortDirection) {
        if (sortDirection == null || sortDirection.isBlank()) {
            return "asc";
        }
        return "desc".equalsIgnoreCase(sortDirection.trim()) ? "desc" : "asc";
    }

    private String managedImageOrNull(String value) {
        String text = trimToNull(value);
        if (text == null) {
            return null;
        }
        return isManagedBossImageUrl(text) ? text : null;
    }

    private boolean isManagedBossImageUrl(String value) {
        if (managedImageUrlPolicy.isManagedImageUrl(value)) {
            return true;
        }
        for (String prefix : BOSS_MANAGED_IMAGE_URL_PREFIXES) {
            if (value != null && value.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }

    private String trimToNull(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            String normalized = trimToNull(value);
            if (normalized != null) {
                return normalized;
            }
        }
        return null;
    }

    private Long toLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        String text = trimToNull(value);
        if (text == null) {
            return null;
        }
        try {
            return Long.parseLong(text);
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private Integer toInteger(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        String text = trimToNull(value);
        if (text == null) {
            return null;
        }
        try {
            return Integer.parseInt(text);
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private java.math.BigDecimal toBigDecimal(Object value) {
        if (value instanceof java.math.BigDecimal decimal) {
            return decimal;
        }
        if (value instanceof Number number) {
            return java.math.BigDecimal.valueOf(number.doubleValue());
        }
        String text = trimToNull(value);
        if (text == null) {
            return null;
        }
        try {
            return new java.math.BigDecimal(text);
        } catch (NumberFormatException exception) {
            return null;
        }
    }
}

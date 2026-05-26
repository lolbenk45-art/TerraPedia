package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.common.ItemImageSql;
import com.terraria.skills.dto.BossSummonItemDTO;
import com.terraria.skills.dto.PublicBossMoneyDropDTO;
import com.terraria.skills.dto.PublicBossDetailDTO;
import com.terraria.skills.dto.PublicBossListDTO;
import com.terraria.skills.dto.PublicBossLootEntryDTO;
import com.terraria.skills.dto.PublicBossLootOwnerDTO;
import com.terraria.skills.dto.PublicBossMemberDTO;
import com.terraria.skills.dto.PublicCoinTokenDTO;
import com.terraria.skills.dto.PublicBossQuery;
import com.terraria.skills.entity.BossGroup;
import com.terraria.skills.entity.Npc;
import com.terraria.skills.mapper.BossGroupMapper;
import com.terraria.skills.mapper.NpcMapper;
import com.terraria.skills.service.BossSummonContractResolver;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import com.terraria.skills.service.PublicBossService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class PublicBossServiceImpl implements PublicBossService {

    private static final List<CoinSegment> COIN_SEGMENTS = List.of(
        new CoinSegment("platinum", 1_000_000, "铂金币"),
        new CoinSegment("gold", 10_000, "金币"),
        new CoinSegment("silver", 100, "银币"),
        new CoinSegment("copper", 1, "铜币")
    );

    private static final Map<String, List<String>> REFERENCE_BOSS_GROUP_CODES = Map.of(
        "MECHDUSA", List.of("THE_TWINS", "THE_DESTROYER", "SKELETRON_PRIME")
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
        dto.setMoneyDrops(buildMoneyDrops(lootOwnerNpc));
        dto.setMemberCount(resolveVisibleMemberCount(memberDtos, referenceMembers));
        dto.setMemberNames(resolveVisibleMemberNames(members, referenceMembers));
        dto.setMemberSourceMode(resolveMemberSourceMode(memberDtos, referenceMembers));
        dto.setLootEntryCount(lootEntries.size());
        dto.setDirectLootCount(countLootEntriesByKind(lootEntries, "direct_boss"));
        dto.setTreasureBagLootCount(countLootEntriesByKind(lootEntries, "treasure_bag"));
        dto.setUniqueLootItemCount(countUniqueLootItems(lootEntries));
        dto.setSummonMethodResolved(BossSummonContractResolver.resolveSummonMethodResolved(bossGroup));
        dto.setSummonItems(loadSummonItems(bossGroup));
        return dto;
    }

    private void applyBaseFields(PublicBossListDTO dto, BossGroup bossGroup) {
        dto.setId(bossGroup.getId());
        dto.setCode(bossGroup.getCode());
        dto.setName(firstNonBlank(bossGroup.getNameZh(), bossGroup.getNameEn(), bossGroup.getCode()));
        dto.setNameZh(bossGroup.getNameZh());
        dto.setNameEn(bossGroup.getNameEn());
        dto.setBossType(bossGroup.getBossType());
        dto.setImageUrl(managedBossImageOrNull(bossGroup.getImageUrl()));
        dto.setProgressionOrder(bossGroup.getProgressionOrder());
        dto.setSummonMethod(BossSummonContractResolver.resolveExplicitSummonMethod(bossGroup));
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

    private List<PublicBossMoneyDropDTO> buildMoneyDrops(Npc lootOwnerNpc) {
        if (lootOwnerNpc == null) {
            return null;
        }

        List<MoneyDropValue> values = resolveMoneyDropValues(lootOwnerNpc);
        if (values.isEmpty()) {
            return null;
        }

        Map<String, String> coinIcons = loadCoinIcons();
        List<PublicBossMoneyDropDTO> drops = new ArrayList<>();
        for (MoneyDropValue value : values) {
            addMoneyDrop(drops, value.mode(), value.label(), value.value(), coinIcons);
        }
        return drops.isEmpty() ? null : drops;
    }

    private List<MoneyDropValue> resolveMoneyDropValues(Npc lootOwnerNpc) {
        List<MoneyDropValue> values = new ArrayList<>();
        addMoneyDropValue(values, "normal", "普通", lootOwnerNpc.getValue());
        Map<String, Object> rawJson = parseObjectJson(lootOwnerNpc.getRawJson());
        Object extras = rawJson.get("extras");
        if (extras instanceof Map<?, ?> extrasMap) {
            addMoneyDropValue(values, "expert", "专家", toInteger(extrasMap.get("value_e")));
            addMoneyDropValue(values, "master", "大师", toInteger(extrasMap.get("value_m")));
        }
        return values;
    }

    private void addMoneyDropValue(List<MoneyDropValue> values, String mode, String label, Integer value) {
        if (value == null || value <= 0) {
            return;
        }
        values.add(new MoneyDropValue(mode, label, value));
    }

    private void addMoneyDrop(
        List<PublicBossMoneyDropDTO> drops,
        String mode,
        String label,
        Integer value,
        Map<String, String> coinIcons
    ) {
        if (value == null || value <= 0) {
            return;
        }

        PublicBossMoneyDropDTO drop = new PublicBossMoneyDropDTO();
        drop.setMode(mode);
        drop.setLabel(label);
        drop.setTokens(buildCoinTokens(value, coinIcons));
        drops.add(drop);
    }

    private Map<String, String> loadCoinIcons() {
        if (jdbcTemplate == null) {
            return Map.of();
        }

        List<Map<String, Object>> rows;
        try {
            rows = jdbcTemplate.queryForList(
                """
                SELECT name, %s AS image
                FROM items
                WHERE deleted = 0
                  AND name IN ('Copper Coin', 'Silver Coin', 'Gold Coin', 'Platinum Coin')
                """.formatted(ItemImageSql.preferredItemImageExpression("items"))
            );
        } catch (Exception exception) {
            return Map.of();
        }

        if (rows == null || rows.isEmpty()) {
            return Map.of();
        }

        Map<String, String> icons = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String image = managedImageOrNull(trimToNull(row.get("image")));
            if (image == null) {
                continue;
            }
            String name = trimToNull(row.get("name"));
            if (name == null) {
                continue;
            }
            switch (name) {
                case "Copper Coin" -> icons.put("copper", image);
                case "Silver Coin" -> icons.put("silver", image);
                case "Gold Coin" -> icons.put("gold", image);
                case "Platinum Coin" -> icons.put("platinum", image);
                default -> {
                }
            }
        }
        return icons;
    }

    private List<PublicCoinTokenDTO> buildCoinTokens(Integer value, Map<String, String> coinIcons) {
        if (value == null || value <= 0) {
            return List.of();
        }

        int remainder = value;
        List<PublicCoinTokenDTO> tokens = new ArrayList<>();
        for (CoinSegment segment : COIN_SEGMENTS) {
            int amount = remainder / segment.divider();
            remainder %= segment.divider();
            if (amount <= 0) {
                continue;
            }
            PublicCoinTokenDTO token = new PublicCoinTokenDTO();
            token.setUnit(segment.unit());
            token.setAmount(amount);
            token.setLabel(segment.label());
            token.setIconUrl(coinIcons == null ? null : coinIcons.get(segment.unit()));
            tokens.add(token);
        }
        return tokens;
    }

    private List<BossSummonItemDTO> loadSummonItems(BossGroup bossGroup) {
        List<BossSummonContractResolver.SummonItemRef> refs = BossSummonContractResolver.resolveSummonItemRefs(bossGroup);
        if (refs.isEmpty()) {
            return List.of();
        }

        Map<String, Map<String, Object>> rowsByKey = loadSummonItemRows(refs);
        String sourceText = BossSummonContractResolver.resolveSummonMethodResolved(bossGroup);
        List<BossSummonItemDTO> items = new ArrayList<>();
        for (BossSummonContractResolver.SummonItemRef ref : refs) {
            Map<String, Object> row = rowsByKey.get(summonLookupKey(ref.itemInternalName()));
            if (row == null) {
                row = rowsByKey.get(summonLookupKey(ref.itemName()));
            }
            BossSummonItemDTO dto = new BossSummonItemDTO();
            dto.setItemId(row == null ? null : toLong(row.get("itemId")));
            dto.setInternalName(firstNonBlank(row == null ? null : trimToNull(row.get("internalName")), ref.itemInternalName()));
            dto.setName(firstNonBlank(row == null ? null : trimToNull(row.get("name")), ref.itemName()));
            dto.setNameZh(row == null ? null : trimToNull(row.get("nameZh")));
            dto.setImageUrl(row == null ? null : firstNonBlank(
                managedImageOrNull(trimToNull(row.get("imageUrl"))),
                managedImageOrNull(trimToNull(row.get("fallbackImageUrl")))
            ));
            dto.setRole(ref.role());
            dto.setSourceText(sourceText);
            dto.setConfidence(1.0);
            dto.setDerived(true);
            items.add(dto);
        }
        return items;
    }

    private Map<String, Map<String, Object>> loadSummonItemRows(List<BossSummonContractResolver.SummonItemRef> refs) {
        if (jdbcTemplate == null || refs == null || refs.isEmpty()) {
            return Map.of();
        }

        List<String> values = refs.stream()
            .flatMap(ref -> java.util.stream.Stream.of(ref.itemInternalName(), ref.itemName()))
            .map(this::trimToNull)
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        if (values.isEmpty()) {
            return Map.of();
        }

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
            SELECT
              i.id AS itemId,
              i.internal_name AS internalName,
              i.name,
              i.name_zh AS nameZh,
              %s AS imageUrl,
              i.image AS fallbackImageUrl
            FROM items i
            WHERE i.deleted = 0
              AND (i.internal_name IN (%s) OR i.name IN (%s))
            ORDER BY i.id ASC
            """.formatted(
                ItemImageSql.preferredItemImageExpression("i"),
                buildPlaceholders(values.size()),
                buildPlaceholders(values.size())
            ),
            buildRepeatedArgs(values)
        );
        if (rows == null || rows.isEmpty()) {
            return Map.of();
        }

        Map<String, Map<String, Object>> lookup = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            putSummonRow(lookup, row, "internalName");
            putSummonRow(lookup, row, "name");
        }
        return lookup;
    }

    private void putSummonRow(Map<String, Map<String, Object>> lookup, Map<String, Object> row, String field) {
        String key = summonLookupKey(row == null ? null : row.get(field));
        if (key != null && !lookup.containsKey(key)) {
            lookup.put(key, row);
        }
    }

    private Object[] buildRepeatedArgs(List<String> values) {
        List<String> args = new ArrayList<>(values.size() * 2);
        args.addAll(values);
        args.addAll(values);
        return args.toArray();
    }

    private String buildPlaceholders(int size) {
        return String.join(", ", Collections.nCopies(size, "?"));
    }

    private String summonLookupKey(Object value) {
        String text = trimToNull(value);
        return text == null ? null : text.toLowerCase(Locale.ROOT);
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
              %s AS itemImage
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
            """.formatted(ItemImageSql.preferredItemImageExpression("i")),
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

    private Map<String, Object> parseObjectJson(String rawJson) {
        String text = trimToNull(rawJson);
        if (text == null) {
            return Map.of();
        }
        try {
            Object parsed = objectMapper.readValue(text, Object.class);
            if (!(parsed instanceof Map<?, ?> map)) {
                return Map.of();
            }
            Map<String, Object> result = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (entry.getKey() != null) {
                    result.put(String.valueOf(entry.getKey()), entry.getValue());
                }
            }
            return result;
        } catch (Exception exception) {
            return Map.of();
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

    private String managedBossImageOrNull(String value) {
        String text = trimToNull(value);
        if (text == null) {
            return null;
        }
        return managedImageUrlPolicy.isManagedImageUrlForDomain(text, "bosses") ? text : null;
    }

    private String managedImageOrNull(String value) {
        String text = trimToNull(value);
        if (text == null) {
            return null;
        }
        return managedImageUrlPolicy.isManagedImageUrl(text) ? text : null;
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

    private record CoinSegment(String unit, int divider, String label) {
    }

    private record MoneyDropValue(String mode, String label, Integer value) {
    }
}

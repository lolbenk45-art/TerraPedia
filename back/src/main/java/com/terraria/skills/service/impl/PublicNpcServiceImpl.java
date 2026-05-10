package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.NpcBuffRelationDTO;
import com.terraria.skills.dto.NpcDetailDTO;
import com.terraria.skills.dto.NpcListItemDTO;
import com.terraria.skills.dto.NpcLootEntryDTO;
import com.terraria.skills.dto.NpcShopConditionDTO;
import com.terraria.skills.dto.NpcShopEntryDTO;
import com.terraria.skills.dto.PublicNpcQuery;
import com.terraria.skills.entity.Category;
import com.terraria.skills.entity.Npc;
import com.terraria.skills.mapper.CategoryMapper;
import com.terraria.skills.mapper.NpcMapper;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import com.terraria.skills.service.PublicNpcService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class PublicNpcServiceImpl implements PublicNpcService {

    private final NpcMapper npcMapper;
    private final CategoryMapper categoryMapper;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final ManagedImageUrlPolicy managedImageUrlPolicy;

    private volatile Map<Long, NpcSupplement> supplementByGameId;

    @Override
    public Page<NpcListItemDTO> getNpcs(PublicNpcQuery query) {
        PublicNpcQuery safeQuery = query == null ? new PublicNpcQuery() : query;
        Page<Npc> page = npcMapper.selectPage(
            new Page<>(Math.max(1, safeQuery.getPage()), Math.max(1, safeQuery.getLimit())),
            buildListWrapper(safeQuery)
        );

        Page<NpcListItemDTO> result = new Page<>(page.getCurrent(), page.getSize(), page.getTotal());
        result.setRecords(toListDtos(page.getRecords()));
        return result;
    }

    @Override
    public NpcDetailDTO getNpcById(Long id) {
        if (id == null) {
            return null;
        }
        Npc npc = npcMapper.selectById(id);
        if (!isPublicNpc(npc)) {
            return null;
        }
        return toDetailDto(npc, loadCategoryName(npc.getCategoryId()));
    }

    @Override
    public List<NpcLootEntryDTO> getNpcLoot(Long npcId, Long gameId, String npcName) {
        if (npcId == null) {
            return List.of();
        }
        return loadStructuredLootByNpcId(npcId);
    }

    private List<NpcLootEntryDTO> loadStructuredLootByNpcId(Long npcId) {
        if (npcId == null) {
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
            ORDER BY nle.sort_order ASC, nle.id ASC
            """,
            npcId
        ).stream().map(this::toLootEntryDto).map(dto -> stampLootProvenance(dto, "direct", true, npcId, null)).toList();
    }

    @Override
    public List<NpcShopEntryDTO> getNpcShopEntries(Long npcId) {
        if (npcId == null) {
            return List.of();
        }

        List<NpcShopEntryDTO> entries = jdbcTemplate.queryForList(
            """
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
              i.image AS itemImage
            FROM npc_shop_entries nse
            LEFT JOIN items i ON i.id = nse.item_id AND i.deleted = 0
            WHERE nse.npc_id = ? AND nse.deleted = 0
            ORDER BY nse.sort_order ASC, nse.id ASC
            """,
            npcId
        ).stream().map(this::toShopEntryDto).collect(Collectors.toCollection(ArrayList::new));

        if (entries.isEmpty()) {
            return entries;
        }

        Map<Long, List<NpcShopConditionDTO>> conditionMap = loadShopConditions(
            entries.stream().map(NpcShopEntryDTO::getId).filter(Objects::nonNull).toList()
        );
        entries.forEach(entry -> entry.setConditions(conditionMap.getOrDefault(entry.getId(), List.of())));
        return entries;
    }

    @Override
    public List<NpcBuffRelationDTO> getNpcBuffRelations(Long npcId) {
        if (npcId == null) {
            return List.of();
        }

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
              COALESCE(NULLIF(TRIM(b.image_cached_url), ''), b.image) AS buffImage
            FROM npc_buff_relations nbr
            LEFT JOIN buffs b ON b.id = nbr.buff_id AND b.deleted = 0
            WHERE nbr.npc_id = ? AND nbr.deleted = 0
            ORDER BY nbr.sort_order ASC, nbr.id ASC
            """,
            npcId
        ).stream().map(this::toBuffRelationDto).toList();
    }

    private LambdaQueryWrapper<Npc> buildListWrapper(PublicNpcQuery query) {
        LambdaQueryWrapper<Npc> wrapper = new LambdaQueryWrapper<>();
        wrapper.and(scope -> scope.eq(Npc::getIsBoss, false).or().isNull(Npc::getIsBoss));
        wrapper.and(scope -> scope.eq(Npc::getStatus, 1).or().isNull(Npc::getStatus));

        if (query.getCategoryId() != null) {
            wrapper.eq(Npc::getCategoryId, query.getCategoryId());
        }
        if (query.getIsTownNpc() != null) {
            wrapper.eq(Npc::getIsTownNpc, query.getIsTownNpc());
        }
        if (query.getSearch() != null && !query.getSearch().isBlank()) {
            String keyword = query.getSearch().trim();
            Long maybeGameId = toLong(keyword);
            wrapper.and(scope -> scope.like(Npc::getInternalName, keyword)
                .or().like(Npc::getName, keyword)
                .or().like(Npc::getNameZh, keyword)
                .or().like(Npc::getSubName, keyword)
                .or().like(Npc::getSubNameZh, keyword)
                .or(maybeGameId != null, exact -> exact.eq(Npc::getGameId, maybeGameId)));
        }
        wrapper.orderByDesc(Npc::getIsTownNpc).orderByAsc(Npc::getId);
        return wrapper;
    }

    private boolean isPublicNpc(Npc npc) {
        if (npc == null) {
            return false;
        }
        if (Boolean.TRUE.equals(npc.getIsBoss())) {
            return false;
        }
        return npc.getStatus() == null || npc.getStatus() == 1;
    }

    private List<NpcListItemDTO> toListDtos(List<Npc> npcs) {
        if (npcs == null || npcs.isEmpty()) {
            return List.of();
        }

        Map<Long, String> categoryNames = loadCategoryNames(
            npcs.stream().map(Npc::getCategoryId).filter(Objects::nonNull).toList()
        );

        return npcs.stream()
            .map(npc -> toListDto(npc, categoryNames.get(npc.getCategoryId())))
            .toList();
    }

    private NpcListItemDTO toListDto(Npc npc, String categoryName) {
        NpcSupplement supplement = getSupplement(npc.getGameId());

        NpcListItemDTO dto = new NpcListItemDTO();
        dto.setId(npc.getId());
        dto.setGameId(npc.getGameId());
        dto.setInternalName(npc.getInternalName());
        dto.setName(npc.getName());
        dto.setNameZh(firstNonBlank(npc.getNameZh(), supplement.nameZh));
        dto.setSubName(npc.getSubName());
        dto.setSubNameZh(firstNonBlank(npc.getSubNameZh(), supplement.subNameZh));
        dto.setCategoryId(npc.getCategoryId());
        dto.setCategoryName(categoryName);
        dto.setIsBoss(firstNonNullBoolean(npc.getIsBoss(), supplement.isBoss));
        dto.setIsFriendly(firstNonNullBoolean(npc.getIsFriendly(), supplement.isFriendly));
        dto.setIsTownNpc(firstNonNullBoolean(npc.getIsTownNpc(), supplement.isTownNpc));
        dto.setImageUrl(managedDisplayImageUrl(firstNonBlank(npc.getImageUrl(), supplement.imageUrl)));
        dto.setLootItemsJson(npc.getLootItemsJson());
        dto.setShopItemsJson(npc.getShopItemsJson());
        dto.setSourceItemsJson(npc.getSourceItemsJson());
        return dto;
    }

    private NpcDetailDTO toDetailDto(Npc npc, String categoryName) {
        NpcListItemDTO listItem = toListDto(npc, categoryName);
        NpcDetailDTO dto = new NpcDetailDTO();
        dto.setId(listItem.getId());
        dto.setGameId(listItem.getGameId());
        dto.setInternalName(listItem.getInternalName());
        dto.setName(listItem.getName());
        dto.setNameZh(listItem.getNameZh());
        dto.setSubName(listItem.getSubName());
        dto.setSubNameZh(listItem.getSubNameZh());
        dto.setCategoryId(listItem.getCategoryId());
        dto.setCategoryName(listItem.getCategoryName());
        dto.setIsBoss(listItem.getIsBoss());
        dto.setIsFriendly(listItem.getIsFriendly());
        dto.setIsTownNpc(listItem.getIsTownNpc());
        dto.setImageUrl(listItem.getImageUrl());
        dto.setLootItemsJson(listItem.getLootItemsJson());
        dto.setShopItemsJson(listItem.getShopItemsJson());
        dto.setSourceItemsJson(listItem.getSourceItemsJson());
        dto.setBehaviorNotes(trimToNull(npc.getBehaviorNotes()));
        dto.setStatus(npc.getStatus());
        return dto;
    }

    private Map<Long, List<NpcShopConditionDTO>> loadShopConditions(List<Long> entryIds) {
        if (entryIds == null || entryIds.isEmpty()) {
            return Collections.emptyMap();
        }

        String placeholders = entryIds.stream().map(id -> "?").collect(Collectors.joining(","));
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

        Map<Long, List<NpcShopConditionDTO>> grouped = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            NpcShopConditionDTO dto = toShopConditionDto(row);
            grouped.computeIfAbsent(dto.getShopEntryId(), ignored -> new ArrayList<>()).add(dto);
        }
        return grouped;
    }

    private Map<Long, String> loadCategoryNames(List<Long> categoryIds) {
        if (categoryIds == null || categoryIds.isEmpty()) {
            return Map.of();
        }
        return categoryMapper.selectBatchIds(categoryIds).stream()
            .filter(Category.class::isInstance)
            .map(Category.class::cast)
            .collect(Collectors.toMap(Category::getId, Category::getName, (left, right) -> left));
    }

    private String loadCategoryName(Long categoryId) {
        if (categoryId == null) {
            return null;
        }
        Category category = categoryMapper.selectById(categoryId);
        return category == null ? null : category.getName();
    }

    private NpcLootEntryDTO toLootEntryDto(Map<String, Object> row) {
        NpcLootEntryDTO dto = new NpcLootEntryDTO();
        dto.setId(toLong(row.get("id")));
        dto.setItemId(toLong(row.get("itemId")));
        dto.setSourceItemId(toInteger(row.get("sourceItemId")));
        dto.setDropSourceKind(toStringValue(row.get("dropSourceKind")));
        dto.setQuantityMin(toInteger(row.get("quantityMin")));
        dto.setQuantityMax(toInteger(row.get("quantityMax")));
        dto.setQuantityText(toStringValue(row.get("quantityText")));
        dto.setChanceValue(toBigDecimal(row.get("chanceValue")));
        dto.setChanceText(toStringValue(row.get("chanceText")));
        dto.setConditions(toStringValue(row.get("conditions")));
        dto.setNotes(toStringValue(row.get("notes")));
        dto.setSortOrder(toInteger(row.get("sortOrder")));
        dto.setSourceRefId(toLong(row.get("sourceRefId")));
        dto.setSourceRefName(toStringValue(row.get("sourceRefName")));
        dto.setSourcePage(toStringValue(row.get("sourcePage")));
        dto.setSourceRevisionTimestamp(toStringValue(row.get("sourceRevisionTimestamp")));
        dto.setLootSourceMode(toStringValue(row.get("lootSourceMode")));
        dto.setTrustedStructured(toBoolean(row.get("trustedStructured")));
        dto.setSourceNpcId(toLong(row.get("sourceNpcId")));
        dto.setSourceNpcInternalName(toStringValue(row.get("sourceNpcInternalName")));
        dto.setSourceRowKey(toStringValue(row.get("sourceRowKey")));
        dto.setItemName(toStringValue(row.get("itemName")));
        dto.setItemNameZh(toStringValue(row.get("itemNameZh")));
        dto.setItemInternalName(toStringValue(row.get("itemInternalName")));
        dto.setImageUrl(managedDisplayImageUrl(toStringValue(row.get("itemImage"))));
        return dto;
    }

    private NpcLootEntryDTO stampLootProvenance(
        NpcLootEntryDTO dto,
        String mode,
        boolean trustedStructured,
        Long fallbackSourceNpcId,
        String fallbackSourceNpcInternalName
    ) {
        if (dto == null) {
            return null;
        }
        dto.setLootSourceMode(mode);
        dto.setTrustedStructured(trustedStructured);
        dto.setSourceNpcId(dto.getSourceNpcId() == null ? fallbackSourceNpcId : dto.getSourceNpcId());
        dto.setSourceNpcInternalName(firstNonBlank(dto.getSourceNpcInternalName(), fallbackSourceNpcInternalName));
        return dto;
    }

    private NpcShopEntryDTO toShopEntryDto(Map<String, Object> row) {
        NpcShopEntryDTO dto = new NpcShopEntryDTO();
        dto.setId(toLong(row.get("id")));
        dto.setItemId(toLong(row.get("itemId")));
        dto.setSourceItemId(toInteger(row.get("sourceItemId")));
        dto.setPriceText(toStringValue(row.get("priceText")));
        dto.setNotes(toStringValue(row.get("notes")));
        dto.setSortOrder(toInteger(row.get("sortOrder")));
        dto.setItemName(toStringValue(row.get("itemName")));
        dto.setItemNameZh(toStringValue(row.get("itemNameZh")));
        dto.setItemInternalName(toStringValue(row.get("itemInternalName")));
        dto.setImageUrl(managedDisplayImageUrl(toStringValue(row.get("itemImage"))));
        return dto;
    }

    private NpcShopConditionDTO toShopConditionDto(Map<String, Object> row) {
        NpcShopConditionDTO dto = new NpcShopConditionDTO();
        dto.setId(toLong(row.get("id")));
        dto.setShopEntryId(toLong(row.get("shopEntryId")));
        dto.setRefType(toStringValue(row.get("refType")));
        dto.setRefId(toLong(row.get("refId")));
        dto.setConditionRole(toStringValue(row.get("conditionRole")));
        dto.setNotes(toStringValue(row.get("notes")));
        dto.setSortOrder(toInteger(row.get("sortOrder")));
        dto.setBiomeCode(toStringValue(row.get("biomeCode")));
        dto.setBiomeNameEn(toStringValue(row.get("biomeNameEn")));
        dto.setBiomeNameZh(toStringValue(row.get("biomeNameZh")));
        dto.setContextCode(toStringValue(row.get("contextCode")));
        dto.setContextNameEn(toStringValue(row.get("contextNameEn")));
        dto.setContextNameZh(toStringValue(row.get("contextNameZh")));
        dto.setContextType(toStringValue(row.get("contextType")));
        dto.setGamePeriodCode(toStringValue(row.get("gamePeriodCode")));
        dto.setGamePeriodNameEn(toStringValue(row.get("gamePeriodNameEn")));
        dto.setGamePeriodNameZh(toStringValue(row.get("gamePeriodNameZh")));
        dto.setRefItemName(toStringValue(row.get("refItemName")));
        dto.setRefItemNameZh(toStringValue(row.get("refItemNameZh")));
        dto.setRefItemInternalName(toStringValue(row.get("refItemInternalName")));
        dto.setRefNpcName(toStringValue(row.get("refNpcName")));
        dto.setRefNpcNameZh(toStringValue(row.get("refNpcNameZh")));
        dto.setRefNpcInternalName(toStringValue(row.get("refNpcInternalName")));
        return dto;
    }

    private NpcBuffRelationDTO toBuffRelationDto(Map<String, Object> row) {
        NpcBuffRelationDTO dto = new NpcBuffRelationDTO();
        dto.setId(toLong(row.get("id")));
        dto.setBuffId(toLong(row.get("buffId")));
        dto.setBuffSourceId(toInteger(row.get("buffSourceId")));
        dto.setRelationType(toStringValue(row.get("relationType")));
        dto.setDurationTicks(toInteger(row.get("durationTicks")));
        dto.setChanceValue(toBigDecimal(row.get("chanceValue")));
        dto.setChanceText(toStringValue(row.get("chanceText")));
        dto.setConditions(toStringValue(row.get("conditions")));
        dto.setNotes(toStringValue(row.get("notes")));
        dto.setSortOrder(toInteger(row.get("sortOrder")));
        dto.setBuffInternalName(toStringValue(row.get("buffInternalName")));
        dto.setBuffNameEn(toStringValue(row.get("buffNameEn")));
        dto.setBuffNameZh(toStringValue(row.get("buffNameZh")));
        dto.setImageUrl(managedBuffImageUrl(toStringValue(row.get("buffImage"))));
        return dto;
    }

    private String managedDisplayImageUrl(String value) {
        String text = trimToNull(value);
        if (text == null || !managedImageUrlPolicy.isManagedImageUrl(text)) {
            return null;
        }
        return text;
    }

    private String managedBuffImageUrl(String value) {
        String text = trimToNull(value);
        return managedImageUrlPolicy.isManagedImageUrlForDomain(text, "buffs") ? text : null;
    }

    private NpcSupplement getSupplement(Long gameId) {
        if (gameId == null) {
            return NpcSupplement.EMPTY;
        }
        return getSupplementSnapshot().getOrDefault(gameId, NpcSupplement.EMPTY);
    }

    private Map<Long, NpcSupplement> getSupplementSnapshot() {
        Map<Long, NpcSupplement> snapshot = supplementByGameId;
        if (snapshot != null) {
            return snapshot;
        }
        synchronized (this) {
            if (supplementByGameId == null) {
                supplementByGameId = loadSupplementMap();
            }
            return supplementByGameId;
        }
    }

    private Map<Long, NpcSupplement> loadSupplementMap() {
        for (Path path : List.of(
            Path.of("data", "generated", "npc-standardized-map.json"),
            Path.of("..", "data", "generated", "npc-standardized-map.json")
        )) {
            if (!Files.exists(path)) {
                continue;
            }
            try {
                JsonNode root = objectMapper.readTree(path.toFile());
                JsonNode records = root.path("records");
                if (!records.isObject()) {
                    continue;
                }

                Map<Long, NpcSupplement> loaded = new LinkedHashMap<>();
                records.fields().forEachRemaining(entry -> {
                    JsonNode record = entry.getValue();
                    long gameId = record.path("gameId").asLong(Long.MIN_VALUE);
                    if (gameId == Long.MIN_VALUE) {
                        return;
                    }

                    JsonNode flags = record.path("flags");
                    JsonNode extras = record.path("extras");
                    loaded.put(gameId, new NpcSupplement(
                        textOrNull(record.get("imageUrl")),
                        textOrNull(record.get("nameZh")),
                        textOrNull(record.get("subNameZh")),
                        booleanOrNull(flags.get("boss")),
                        booleanOrNull(flags.get("friendly")),
                        booleanOrNull(extras.get("townNPC"))
                    ));
                });
                return loaded;
            } catch (Exception exception) {
                log.warn("Failed to load npc supplement data from {}", path, exception);
            }
        }
        return Map.of();
    }

    private static String firstNonBlank(String primary, String fallback) {
        return primary != null && !primary.isBlank() ? primary : fallback;
    }

    private static Boolean firstNonNullBoolean(Boolean primary, Boolean fallback) {
        return primary != null ? primary : fallback;
    }

    private static Long toLong(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value).trim());
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private static Integer toInteger(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(value).trim());
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private static BigDecimal toBigDecimal(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof BigDecimal decimal) {
            return decimal;
        }
        if (value instanceof Number number) {
            return BigDecimal.valueOf(number.doubleValue());
        }
        try {
            return new BigDecimal(String.valueOf(value).trim());
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private static String toStringValue(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static Boolean toBoolean(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Boolean bool) {
            return bool;
        }
        if (value instanceof Number number) {
            return number.intValue() != 0;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : Boolean.parseBoolean(text.toLowerCase(Locale.ROOT));
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String textOrNull(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        String value = node.asText();
        return value == null || value.isBlank() ? null : value;
    }

    private static Boolean booleanOrNull(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        if (node.isBoolean()) {
            return node.booleanValue();
        }
        String value = node.asText();
        if (value == null || value.isBlank()) {
            return null;
        }
        return Boolean.parseBoolean(value.toLowerCase(Locale.ROOT));
    }

    private record NpcSupplement(
        String imageUrl,
        String nameZh,
        String subNameZh,
        Boolean isBoss,
        Boolean isFriendly,
        Boolean isTownNpc
    ) {
        private static final NpcSupplement EMPTY = new NpcSupplement(null, null, null, null, null, null);
    }
}

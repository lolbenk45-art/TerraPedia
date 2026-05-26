package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.common.ItemImageSql;
import com.terraria.skills.dto.NpcBuffRelationDTO;
import com.terraria.skills.dto.NpcDetailDTO;
import com.terraria.skills.dto.NpcListItemDTO;
import com.terraria.skills.dto.NpcLootEntryDTO;
import com.terraria.skills.dto.NpcLivingPreferenceDTO;
import com.terraria.skills.dto.NpcShopConditionDTO;
import com.terraria.skills.dto.NpcShopEntryDTO;
import com.terraria.skills.dto.NpcShopPriceTokenDTO;
import com.terraria.skills.dto.NpcWikiAssetsDTO;
import com.terraria.skills.dto.PublicCoinTokenDTO;
import com.terraria.skills.dto.PublicNpcMoneyDropDTO;
import com.terraria.skills.dto.PublicNpcQuery;
import com.terraria.skills.entity.Category;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.Npc;
import com.terraria.skills.mapper.CategoryMapper;
import com.terraria.skills.mapper.NpcMapper;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import com.terraria.skills.service.ManagedItemImageResolver;
import com.terraria.skills.service.PublicNpcService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
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
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class PublicNpcServiceImpl implements PublicNpcService {

    private static final String MULTIPART_SEGMENT_SUFFIX_REGEX = "(Head|Body\\d*|Tail|Legs|Hand)$";
    private static final List<CoinSegment> COIN_SEGMENTS = List.of(
        new CoinSegment("platinum", 1_000_000, "铂金币"),
        new CoinSegment("gold", 10_000, "金币"),
        new CoinSegment("silver", 100, "银币"),
        new CoinSegment("copper", 1, "铜币")
    );
    private static final Pattern SHOP_PRICE_TEXT_TOKEN_PATTERN = Pattern.compile(
        "(?i)(\\d+)\\s*(pc|gc|sc|cc|platinum(?:\\s+coin)?s?|gold(?:\\s+coin)?s?|silver(?:\\s+coin)?s?|copper(?:\\s+coin)?s?|铂金币?|金币?|银币?|铜币?)"
    );

    private final NpcMapper npcMapper;
    private final CategoryMapper categoryMapper;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final ManagedImageUrlPolicy managedImageUrlPolicy;
    private final ManagedItemImageResolver managedItemImageResolver;

    private volatile Map<Long, NpcSupplement> supplementByGameId;

    @Override
    public Page<NpcListItemDTO> getNpcs(PublicNpcQuery query) {
        PublicNpcQuery safeQuery = query == null ? new PublicNpcQuery() : query;
        boolean multipartSearch = isMultipartRepresentativeSearch(safeQuery.getSearch());
        Page<Npc> page = npcMapper.selectPage(
            new Page<>(Math.max(1, safeQuery.getPage()), Math.max(1, safeQuery.getLimit())),
            buildListWrapper(safeQuery, multipartSearch)
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
        Npc representative = resolveMultipartRepresentative(npc);
        return toDetailDto(representative, loadCategoryName(representative.getCategoryId()));
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
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
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
              AND (nle.drop_source_kind IS NULL OR nle.drop_source_kind = 'npc_drop')
            ORDER BY nle.sort_order ASC, nle.id ASC
            """.formatted(ItemImageSql.preferredItemImageExpression("i")),
            npcId
        );
        Map<Long, String> managedImagesByItemId = resolveManagedItemImages(rows);
        return rows.stream()
            .map(row -> toLootEntryDto(row, managedImagesByItemId))
            .map(dto -> stampLootProvenance(dto, "direct", true, npcId, null))
            .toList();
    }

    @Override
    public List<NpcShopEntryDTO> getNpcShopEntries(Long npcId) {
        if (npcId == null) {
            return List.of();
        }

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
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
              i.buy AS buyPrice,
              i.sell AS sellPrice,
              %s AS itemImage
            FROM npc_shop_entries nse
            LEFT JOIN items i ON i.id = nse.item_id AND i.deleted = 0
            WHERE nse.npc_id = ? AND nse.deleted = 0
            ORDER BY nse.sort_order ASC, nse.id ASC
            """.formatted(ItemImageSql.preferredItemImageExpression("i")),
            npcId
        );
        Map<Long, String> managedImagesByItemId = resolveManagedItemImages(rows);
        if (rows.isEmpty()) {
            return List.of();
        }

        Map<String, String> coinIcons = loadCoinIcons();
        List<NpcShopEntryDTO> entries = rows.stream()
            .map(row -> toShopEntryDto(row, managedImagesByItemId, coinIcons))
            .collect(Collectors.toCollection(ArrayList::new));

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

        RelationNpcBuffLookupResult relationResult = loadRelationNpcBuffRelations(npcId);
        if (relationResult.available()) {
            return relationResult.rows();
        }

        return loadLocalNpcBuffRelations(npcId);
    }

    private RelationNpcBuffLookupResult loadRelationNpcBuffRelations(Long npcId) {
        Npc npc = npcMapper.selectById(npcId);
        if (npc == null) {
            return RelationNpcBuffLookupResult.unavailable();
        }
        List<Object> args = new ArrayList<>();
        List<String> predicates = new ArrayList<>();
        if (npc.getGameId() != null) {
            predicates.add("(nbr.npc_source_id = ? OR pn.game_id = ?)");
            args.add(npc.getGameId());
            args.add(npc.getGameId());
        }
        String internalName = trimToNull(npc.getInternalName());
        if (internalName != null) {
            predicates.add("nbr.npc_internal_name = ?");
            args.add(internalName);
        }
        if (predicates.isEmpty()) {
            return RelationNpcBuffLookupResult.unavailable();
        }

        try {
            List<NpcBuffRelationDTO> rows = jdbcTemplate.queryForList(
                """
                SELECT
                  nbr.id,
                  pb.id AS buffId,
                  COALESCE(pb.source_id, nbr.buff_source_id) AS buffSourceId,
                  nbr.relation_type AS relationType,
                  nbr.duration_ticks AS durationTicks,
                  nbr.chance_value AS chanceValue,
                  nbr.chance_text AS chanceText,
                  nbr.conditions,
                  NULL AS notes,
                  nbr.id AS sortOrder,
                  COALESCE(pb.internal_name, nbr.buff_internal_name) AS buffInternalName,
                  pb.english_name AS buffNameEn,
                  pb.name_zh AS buffNameZh,
                  pb.image AS buffImage
                FROM `terria_v1_relation`.`npc_buff_relations` nbr
                LEFT JOIN `terria_v1_relation`.`projection_npcs` pn
                  ON (nbr.npc_source_id IS NOT NULL AND (pn.source_id = nbr.npc_source_id OR pn.game_id = nbr.npc_source_id))
                  OR (nbr.npc_internal_name IS NOT NULL AND pn.internal_name = nbr.npc_internal_name)
                LEFT JOIN `terria_v1_relation`.`projection_buffs` pb
                  ON (nbr.buff_source_id IS NOT NULL AND pb.source_id = nbr.buff_source_id)
                  OR (nbr.buff_internal_name IS NOT NULL AND pb.internal_name = nbr.buff_internal_name)
                WHERE nbr.deleted = 0
                  AND nbr.relation_type = 'inflicts'
                  AND (""" + String.join(" OR ", predicates) + """
)
                ORDER BY nbr.id ASC
                """,
                args.toArray()
            ).stream().map(this::toBuffRelationDto).toList();
            return RelationNpcBuffLookupResult.available(rows);
        } catch (Exception ignored) {
            return RelationNpcBuffLookupResult.unavailable();
        }
    }

    private List<NpcBuffRelationDTO> loadLocalNpcBuffRelations(Long npcId) {
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

    private LambdaQueryWrapper<Npc> buildListWrapper(PublicNpcQuery query, boolean multipartSearch) {
        LambdaQueryWrapper<Npc> wrapper = new LambdaQueryWrapper<>();
        if (Boolean.TRUE.equals(query.getIsBoss())) {
            wrapper.eq(Npc::getIsBoss, true);
        } else if (Boolean.FALSE.equals(query.getIsBoss())) {
            wrapper.and(scope -> scope.eq(Npc::getIsBoss, false).or().isNull(Npc::getIsBoss));
        } else {
            wrapper.and(scope -> scope.eq(Npc::getIsBoss, false).or().isNull(Npc::getIsBoss));
        }
        wrapper.and(scope -> scope.eq(Npc::getStatus, 1).or().isNull(Npc::getStatus));

        if (query.getCategoryId() != null) {
            wrapper.eq(Npc::getCategoryId, query.getCategoryId());
        }
        if (query.getIsTownNpc() != null) {
            wrapper.eq(Npc::getIsTownNpc, query.getIsTownNpc());
        }
        if (Boolean.TRUE.equals(query.getIsFriendly())) {
            wrapper.eq(Npc::getIsFriendly, true);
        } else if (Boolean.FALSE.equals(query.getIsFriendly())) {
            wrapper.and(scope -> scope.eq(Npc::getIsFriendly, false).or().isNull(Npc::getIsFriendly));
        }
        if (query.getHasShop() != null) {
            wrapper.apply((Boolean.TRUE.equals(query.getHasShop()) ? "" : "NOT ") + """
                EXISTS (
                  SELECT 1 FROM npc_shop_entries nse_filter
                  WHERE nse_filter.npc_id = npcs.id
                    AND nse_filter.deleted = 0
                )
                """);
        }
        if (query.getHasLoot() != null) {
            wrapper.apply((Boolean.TRUE.equals(query.getHasLoot()) ? "" : "NOT ") + """
                EXISTS (
                  SELECT 1 FROM npc_loot_entries nle_filter
                  WHERE nle_filter.npc_id = npcs.id
                    AND nle_filter.deleted = 0
                    AND (nle_filter.drop_source_kind IS NULL OR nle_filter.drop_source_kind = 'npc_drop')
                )
                """);
        }
        if (query.getSearch() != null && !query.getSearch().isBlank()) {
            String keyword = query.getSearch().trim();
            Long maybeGameId = toLong(keyword);
            String multipartRoot = multipartSegmentRoot(keyword);
            wrapper.and(scope -> scope.like(Npc::getInternalName, keyword)
                .or().like(Npc::getName, keyword)
                .or().like(Npc::getNameZh, keyword)
                .or().like(Npc::getSubName, keyword)
                .or().like(Npc::getSubNameZh, keyword)
                .or(multipartRoot != null, exact -> exact.likeRight(Npc::getInternalName, multipartRoot))
                .or(maybeGameId != null, exact -> exact.eq(Npc::getGameId, maybeGameId)));
            if (multipartSearch) {
                wrapper.apply("""
                    (
                      internal_name REGEXP 'Head$'
                      OR NOT EXISTS (
                        SELECT 1 FROM npcs representative
                        WHERE representative.deleted = 0
                          AND (representative.status = 1 OR representative.status IS NULL)
                          AND (representative.is_boss = 0 OR representative.is_boss IS NULL)
                          AND representative.name = npcs.name
                          AND representative.internal_name REGEXP 'Head$'
                      )
                    )
                    """);
            }
        }
        wrapper.orderByDesc(Npc::getIsTownNpc).orderByAsc(Npc::getId);
        return wrapper;
    }

    private boolean isPublicNpc(Npc npc) {
        if (npc == null) {
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
        Map<Long, Integer> shopCounts = loadRelationCounts("npc_shop_entries", npcs, false);
        Map<Long, Integer> lootCounts = loadRelationCounts("npc_loot_entries", npcs, true);
        Map<Long, Integer> buffCounts = loadRelationCounts("npc_buff_relations", npcs, false);

        return npcs.stream()
            .map(npc -> toListDto(
                npc,
                categoryNames.get(npc.getCategoryId()),
                shopCounts.getOrDefault(npc.getId(), 0),
                lootCounts.getOrDefault(npc.getId(), 0),
                buffCounts.getOrDefault(npc.getId(), 0)
            ))
            .toList();
    }

    private Npc resolveMultipartRepresentative(Npc npc) {
        if (npc == null || isMultipartHead(npc) || !isMultipartSegment(npc)) {
            return npc;
        }
        String name = trimToNull(npc.getName());
        if (name == null) {
            return npc;
        }
        String root = trimToNull(multipartRoot(npc.getInternalName()));
        if (root == null) {
            return npc;
        }
        Npc representative = npcMapper.selectOne(new LambdaQueryWrapper<Npc>()
            .eq(Npc::getName, name)
            .likeRight(Npc::getInternalName, root)
            .apply("internal_name REGEXP 'Head$'")
            .and(scope -> scope.eq(Npc::getStatus, 1).or().isNull(Npc::getStatus))
            .last("LIMIT 1"));
        return representative == null ? npc : representative;
    }

    private boolean isMultipartRepresentativeSearch(String search) {
        String text = trimToNull(search);
        return text != null && !text.matches("\\d+");
    }

    private boolean isMultipartSegment(Npc npc) {
        String internalName = trimToNull(npc == null ? null : npc.getInternalName());
        return internalName != null && internalName.matches(".*" + MULTIPART_SEGMENT_SUFFIX_REGEX);
    }

    private boolean isMultipartHead(Npc npc) {
        String internalName = trimToNull(npc == null ? null : npc.getInternalName());
        return internalName != null && internalName.matches(".*Head$");
    }

    private String multipartSegmentRoot(String value) {
        String text = trimToNull(value);
        if (text == null || !text.matches(".*" + MULTIPART_SEGMENT_SUFFIX_REGEX)) {
            return null;
        }
        return trimToNull(multipartRoot(text));
    }

    private String multipartRoot(String internalName) {
        String text = trimToNull(internalName);
        if (text == null) {
            return "";
        }
        return text.replaceFirst(MULTIPART_SEGMENT_SUFFIX_REGEX, "");
    }

    private NpcListItemDTO toListDto(Npc npc, String categoryName) {
        return toListDto(npc, categoryName, null, null, null);
    }

    private NpcListItemDTO toListDto(
        Npc npc,
        String categoryName,
        Integer shopEntryCount,
        Integer lootEntryCount,
        Integer buffRelationCount
    ) {
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
        dto.setNpcType(supplement.npcType);
        dto.setDamage(supplement.damage);
        dto.setDefense(supplement.defense);
        dto.setLifeMax(supplement.lifeMax);
        dto.setKnockBackResist(supplement.knockBackResist);
        dto.setShopEntryCount(shopEntryCount);
        dto.setLootEntryCount(lootEntryCount);
        dto.setBuffRelationCount(buffRelationCount);
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
        dto.setNpcType(listItem.getNpcType());
        dto.setDamage(listItem.getDamage());
        dto.setDefense(listItem.getDefense());
        dto.setLifeMax(listItem.getLifeMax());
        dto.setKnockBackResist(listItem.getKnockBackResist());
        dto.setShopEntryCount(countNpcRelations("npc_shop_entries", npc.getId(), false));
        dto.setLootEntryCount(countNpcRelations("npc_loot_entries", npc.getId(), true));
        dto.setBuffRelationCount(countNpcRelations("npc_buff_relations", npc.getId(), false));
        dto.setImageUrl(listItem.getImageUrl());
        dto.setLootItemsJson(listItem.getLootItemsJson());
        dto.setShopItemsJson(listItem.getShopItemsJson());
        dto.setSourceItemsJson(listItem.getSourceItemsJson());
        dto.setBehaviorNotes(trimToNull(npc.getBehaviorNotes()));
        dto.setStatus(npc.getStatus());
        dto.setWikiAssets(parseWikiAssets(npc.getWikiAssetsJson()));
        dto.setLivingPreferences(enrichLivingPreferenceTargetImages(parseLivingPreferences(npc.getLivingPreferencesJson())));
        dto.setMoneyDrops(buildNpcMoneyDrops(npc.getValue(), dto));
        return dto;
    }

    private NpcWikiAssetsDTO parseWikiAssets(String json) {
        String text = trimToNull(json);
        if (text == null) {
            return null;
        }
        try {
            JsonNode root = objectMapper.readTree(text);
            NpcWikiAssetsDTO dto = new NpcWikiAssetsDTO();
            dto.setSpriteImage(managedDisplayImageUrl(textOrNull(root.path("spriteImage"))));
            dto.setMapIconImage(managedDisplayImageUrl(textOrNull(root.path("mapIconImage"))));
            dto.setDialogPortraitImage(managedDisplayImageUrl(textOrNull(root.path("dialogPortraitImage"))));
            if (dto.getSpriteImage() == null && dto.getMapIconImage() == null && dto.getDialogPortraitImage() == null) {
                return null;
            }
            return dto;
        } catch (Exception exception) {
            log.warn("Failed to parse NPC wiki assets JSON", exception);
            return null;
        }
    }

    private List<NpcLivingPreferenceDTO> parseLivingPreferences(String json) {
        String text = trimToNull(json);
        if (text == null) {
            return List.of();
        }
        try {
            JsonNode root = objectMapper.readTree(text);
            if (!root.isArray()) {
                return List.of();
            }
            List<NpcLivingPreferenceDTO> result = new ArrayList<>();
            for (JsonNode node : root) {
                NpcLivingPreferenceDTO dto = new NpcLivingPreferenceDTO();
                dto.setTargetType(textOrNull(node.path("targetType")));
                dto.setPreference(textOrNull(node.path("preference")));
                dto.setTargetId(node.path("targetId").isNumber() ? node.path("targetId").asLong() : null);
                dto.setTargetName(textOrNull(node.path("targetName")));
                dto.setTargetNameZh(textOrNull(node.path("targetNameZh")));
                if (dto.getPreference() != null && (dto.getTargetName() != null || dto.getTargetNameZh() != null)) {
                    result.add(dto);
                }
            }
            return result;
        } catch (Exception exception) {
            log.warn("Failed to parse NPC living preferences JSON", exception);
            return List.of();
        }
    }

    private List<NpcLivingPreferenceDTO> enrichLivingPreferenceTargetImages(List<NpcLivingPreferenceDTO> preferences) {
        if (preferences == null || preferences.isEmpty()) {
            return List.of();
        }
        List<Long> targetIds = preferences.stream()
            .filter(preference -> "npc".equalsIgnoreCase(trimToNull(preference.getTargetType())))
            .map(NpcLivingPreferenceDTO::getTargetId)
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        if (targetIds.isEmpty()) {
            return preferences;
        }

        String placeholders = targetIds.stream().map(ignored -> "?").collect(Collectors.joining(","));
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT id, image_url AS imageUrl, wiki_assets_json AS wikiAssetsJson FROM npcs WHERE deleted = 0 AND id IN (" + placeholders + ")",
                targetIds.toArray()
            );
            Map<Long, String> imageByTargetId = new LinkedHashMap<>();
            for (Map<String, Object> row : rows) {
                Long id = toLong(row.get("id"));
                if (id == null) {
                    continue;
                }
                String imageUrl = firstNonBlank(
                    wikiAssetPreviewImage(toStringValue(row.get("wikiAssetsJson"))),
                    managedDisplayImageUrl(toStringValue(row.get("imageUrl")))
                );
                if (imageUrl != null) {
                    imageByTargetId.put(id, imageUrl);
                }
            }
            for (NpcLivingPreferenceDTO preference : preferences) {
                if (preference.getTargetId() != null) {
                    preference.setTargetImageUrl(imageByTargetId.get(preference.getTargetId()));
                }
            }
            return preferences;
        } catch (Exception exception) {
            log.warn("Failed to enrich NPC living preference target images", exception);
            return preferences;
        }
    }

    private String wikiAssetPreviewImage(String json) {
        NpcWikiAssetsDTO assets = parseWikiAssets(json);
        if (assets == null) {
            return null;
        }
        return firstNonBlank(assets.getDialogPortraitImage(), assets.getSpriteImage(), assets.getMapIconImage());
    }

    private Map<Long, Integer> loadRelationCounts(String tableName, List<Npc> npcs, boolean npcDropOnly) {
        if (npcs == null || npcs.isEmpty()) {
            return Map.of();
        }
        List<Long> npcIds = npcs.stream()
            .map(Npc::getId)
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        if (npcIds.isEmpty()) {
            return Map.of();
        }

        String placeholders = npcIds.stream().map(ignored -> "?").collect(Collectors.joining(","));
        String dropPredicate = npcDropOnly ? " AND (drop_source_kind IS NULL OR drop_source_kind = 'npc_drop')" : "";
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT npc_id AS npcId, COUNT(*) AS entryCount FROM " + tableName
                    + " WHERE deleted = 0 AND npc_id IN (" + placeholders + ")"
                    + dropPredicate
                    + " GROUP BY npc_id",
                npcIds.toArray()
            );
            Map<Long, Integer> counts = new LinkedHashMap<>();
            for (Map<String, Object> row : rows) {
                Long npcId = toLong(row.get("npcId"));
                Integer count = toInteger(row.get("entryCount"));
                if (npcId != null && count != null) {
                    counts.put(npcId, count);
                }
            }
            return counts;
        } catch (Exception exception) {
            log.warn("Failed to load {} counts for public NPC list", tableName, exception);
            return Map.of();
        }
    }

    private Integer countNpcRelations(String tableName, Long npcId, boolean npcDropOnly) {
        if (npcId == null) {
            return 0;
        }
        String dropPredicate = npcDropOnly ? " AND (drop_source_kind IS NULL OR drop_source_kind = 'npc_drop')" : "";
        try {
            return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM " + tableName + " WHERE deleted = 0 AND npc_id = ?" + dropPredicate,
                Integer.class,
                npcId
            );
        } catch (Exception exception) {
            log.warn("Failed to count {} for public NPC {}", tableName, npcId, exception);
            return 0;
        }
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
              ct.code AS conditionTermCode,
              ct.name_en AS conditionTermNameEn,
              ct.name_zh AS conditionTermNameZh,
              ct.term_type AS conditionTermType,
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
            LEFT JOIN condition_terms ct ON nsc.ref_type = 'CONDITION_TERM' AND ct.id = nsc.ref_id AND ct.deleted = 0
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

    private Map<Long, String> resolveManagedItemImages(List<Map<String, Object>> rows) {
        if (rows == null || rows.isEmpty()) {
            return Map.of();
        }
        Map<Long, Item> itemsById = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            Long itemId = toLong(row.get("itemId"));
            if (itemId == null) {
                continue;
            }
            Item item = new Item();
            item.setId(itemId);
            item.setImage(toStringValue(row.get("itemImage")));
            itemsById.putIfAbsent(itemId, item);
        }
        if (itemsById.isEmpty()) {
            return Map.of();
        }
        Map<Long, String> resolved = managedItemImageResolver.resolveManagedImages(itemsById.values());
        return resolved == null ? Map.of() : resolved;
    }

    private String resolveManagedItemImage(Map<String, Object> row, Map<Long, String> managedImagesByItemId) {
        Long itemId = toLong(row.get("itemId"));
        if (itemId == null) {
            return null;
        }
        Item item = new Item();
        item.setId(itemId);
        item.setImage(toStringValue(row.get("itemImage")));
        return managedItemImageResolver.resolveManagedImage(item, managedImagesByItemId);
    }

    private NpcLootEntryDTO toLootEntryDto(Map<String, Object> row, Map<Long, String> managedImagesByItemId) {
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
        dto.setImageUrl(resolveManagedItemImage(row, managedImagesByItemId));
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

    private NpcShopEntryDTO toShopEntryDto(
        Map<String, Object> row,
        Map<Long, String> managedImagesByItemId,
        Map<String, String> coinIcons
    ) {
        NpcShopEntryDTO dto = new NpcShopEntryDTO();
        dto.setId(toLong(row.get("id")));
        dto.setItemId(toLong(row.get("itemId")));
        dto.setSourceItemId(toInteger(row.get("sourceItemId")));
        dto.setPriceText(toStringValue(row.get("priceText")));
        dto.setBuyPrice(toInteger(row.get("buyPrice")));
        dto.setSellPrice(toInteger(row.get("sellPrice")));
        dto.setNotes(toStringValue(row.get("notes")));
        dto.setSortOrder(toInteger(row.get("sortOrder")));
        dto.setItemName(toStringValue(row.get("itemName")));
        dto.setItemNameZh(toStringValue(row.get("itemNameZh")));
        dto.setItemInternalName(toStringValue(row.get("itemInternalName")));
        dto.setImageUrl(resolveManagedItemImage(row, managedImagesByItemId));
        dto.setPriceTokens(buildPriceTokens(dto.getPriceText(), dto.getBuyPrice(), dto.getSellPrice(), coinIcons));
        return dto;
    }

    private Map<String, String> loadCoinIcons() {
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
        } catch (DataAccessException exception) {
            log.warn("Failed to load public NPC shop coin icons", exception);
            return Map.of();
        }

        if (rows == null || rows.isEmpty()) {
            return Map.of();
        }

        Map<String, String> icons = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String image = managedDisplayImageUrl(toStringValue(row.get("image")));
            if (image == null) {
                continue;
            }
            switch (toStringValue(row.get("name"))) {
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

    private List<NpcShopPriceTokenDTO> buildPriceTokens(
        String priceText,
        Integer buyPrice,
        Integer sellPrice,
        Map<String, String> coinIcons
    ) {
        Integer rawTotal = parseShopPriceTextCopperValue(priceText);
        if (rawTotal == null) {
            rawTotal = buyPrice != null && buyPrice >= 0 ? buyPrice : sellPrice;
        }
        if (rawTotal == null || rawTotal < 0) {
            return List.of();
        }

        int remainder = rawTotal;
        List<NpcShopPriceTokenDTO> tokens = new ArrayList<>();
        if (remainder == 0) {
            tokens.add(priceToken(COIN_SEGMENTS.get(COIN_SEGMENTS.size() - 1), 0, coinIcons));
            return tokens;
        }

        for (CoinSegment segment : COIN_SEGMENTS) {
            int amount = remainder / segment.divider();
            remainder %= segment.divider();
            if (amount <= 0) {
                continue;
            }
            tokens.add(priceToken(segment, amount, coinIcons));
        }
        return tokens;
    }

    private List<PublicNpcMoneyDropDTO> buildNpcMoneyDrops(Integer value, NpcDetailDTO dto) {
        if (value == null || value <= 0 || !isNpcMoneyDropEligible(dto)) {
            return null;
        }
        PublicNpcMoneyDropDTO drop = new PublicNpcMoneyDropDTO();
        drop.setMode("normal");
        drop.setLabel("普通");
        drop.setTokens(buildMoneyDropTokens(value, loadCoinIcons()));
        return List.of(drop);
    }

    private boolean isNpcMoneyDropEligible(NpcDetailDTO dto) {
        return dto != null
            && !Boolean.TRUE.equals(dto.getIsFriendly())
            && !Boolean.TRUE.equals(dto.getIsTownNpc())
            && !Boolean.TRUE.equals(dto.getIsBoss());
    }

    private List<PublicCoinTokenDTO> buildMoneyDropTokens(int value, Map<String, String> coinIcons) {
        int remainder = value;
        List<PublicCoinTokenDTO> tokens = new ArrayList<>();
        for (CoinSegment segment : COIN_SEGMENTS) {
            int amount = remainder / segment.divider();
            remainder %= segment.divider();
            if (amount <= 0) {
                continue;
            }
            tokens.add(moneyDropToken(segment, amount, coinIcons));
        }
        return tokens;
    }

    private static Integer parseShopPriceTextCopperValue(String priceText) {
        if (priceText == null || priceText.isBlank()) {
            return null;
        }

        Matcher matcher = SHOP_PRICE_TEXT_TOKEN_PATTERN.matcher(priceText);
        int total = 0;
        int tokenCount = 0;
        int scanFrom = 0;
        while (matcher.find()) {
            String separator = priceText.substring(scanFrom, matcher.start());
            if (tokenCount > 0 && !separator.isBlank()) {
                break;
            }

            int amount;
            try {
                amount = Integer.parseInt(matcher.group(1));
            } catch (NumberFormatException exception) {
                return null;
            }

            CoinSegment segment = coinSegmentByPriceTextUnit(matcher.group(2));
            if (segment == null) {
                return null;
            }
            total += amount * segment.divider();
            tokenCount += 1;
            scanFrom = matcher.end();
        }
        return tokenCount > 0 ? total : null;
    }

    private static CoinSegment coinSegmentByPriceTextUnit(String value) {
        String unit = value == null ? "" : value.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
        if (unit.equals("pc") || unit.startsWith("platinum") || unit.equals("铂金币") || unit.equals("铂金")) {
            return COIN_SEGMENTS.get(0);
        }
        if (unit.equals("gc") || unit.startsWith("gold") || unit.equals("金币") || unit.equals("金")) {
            return COIN_SEGMENTS.get(1);
        }
        if (unit.equals("sc") || unit.startsWith("silver") || unit.equals("银币") || unit.equals("银")) {
            return COIN_SEGMENTS.get(2);
        }
        if (unit.equals("cc") || unit.startsWith("copper") || unit.equals("铜币") || unit.equals("铜")) {
            return COIN_SEGMENTS.get(3);
        }
        return null;
    }

    private NpcShopPriceTokenDTO priceToken(CoinSegment segment, int amount, Map<String, String> coinIcons) {
        NpcShopPriceTokenDTO token = new NpcShopPriceTokenDTO();
        token.setUnit(segment.unit());
        token.setAmount(amount);
        token.setLabel(segment.label());
        token.setIconUrl(coinIcons == null ? null : coinIcons.get(segment.unit()));
        return token;
    }

    private PublicCoinTokenDTO moneyDropToken(CoinSegment segment, int amount, Map<String, String> coinIcons) {
        PublicCoinTokenDTO token = new PublicCoinTokenDTO();
        token.setUnit(segment.unit());
        token.setAmount(amount);
        token.setLabel(segment.label());
        token.setIconUrl(coinIcons == null ? null : coinIcons.get(segment.unit()));
        return token;
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
        dto.setConditionTermCode(toStringValue(row.get("conditionTermCode")));
        dto.setConditionTermNameEn(toStringValue(row.get("conditionTermNameEn")));
        dto.setConditionTermNameZh(toStringValue(row.get("conditionTermNameZh")));
        dto.setConditionTermType(toStringValue(row.get("conditionTermType")));
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
                    JsonNode combat = record.path("combat");
                    JsonNode rawJson = parseJson(record.get("rawJson"));
                    loaded.put(gameId, new NpcSupplement(
                        textOrNull(record.get("imageUrl")),
                        textOrNull(record.get("nameZh")),
                        textOrNull(record.get("subNameZh")),
                        booleanOrNull(flags.get("boss")),
                        booleanOrNull(flags.get("friendly")),
                        booleanOrNull(extras.get("townNPC")),
                        integerOrNull(firstExisting(rawJson.path("type"), record.get("npcType"), record.get("type"))),
                        integerOrNull(combat.get("damage")),
                        integerOrNull(combat.get("defense")),
                        integerOrNull(combat.get("lifeMax")),
                        scalarOrNull(combat.get("knockBackResist"))
                    ));
                });
                return loaded;
            } catch (Exception exception) {
                log.warn("Failed to load npc supplement data from {}", path, exception);
            }
        }
        return Map.of();
    }

    private static String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
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

    private JsonNode parseJson(JsonNode node) {
        String text = textOrNull(node);
        if (text == null) {
            return objectMapper.createObjectNode();
        }
        try {
            return objectMapper.readTree(text);
        } catch (Exception ignored) {
            return objectMapper.createObjectNode();
        }
    }

    private static JsonNode firstExisting(JsonNode... nodes) {
        for (JsonNode node : nodes) {
            if (node != null && !node.isMissingNode() && !node.isNull()) {
                return node;
            }
        }
        return null;
    }

    private static Integer integerOrNull(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        if (node.isInt() || node.isLong() || node.isDouble() || node.isFloat()) {
            return node.asInt();
        }
        String value = node.asText();
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static Object scalarOrNull(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        if (node.isNumber()) {
            double value = node.asDouble();
            return value % 1 == 0 ? (int) value : value;
        }
        String value = node.asText();
        return value == null || value.isBlank() ? null : value;
    }

    private record NpcSupplement(
        String imageUrl,
        String nameZh,
        String subNameZh,
        Boolean isBoss,
        Boolean isFriendly,
        Boolean isTownNpc,
        Integer npcType,
        Integer damage,
        Integer defense,
        Integer lifeMax,
        Object knockBackResist
    ) {
        private static final NpcSupplement EMPTY = new NpcSupplement(null, null, null, null, null, null, null, null, null, null, null);
    }

    private record RelationNpcBuffLookupResult(boolean available, List<NpcBuffRelationDTO> rows) {
        private static RelationNpcBuffLookupResult available(List<NpcBuffRelationDTO> rows) {
            return new RelationNpcBuffLookupResult(true, rows == null ? List.of() : rows);
        }

        private static RelationNpcBuffLookupResult unavailable() {
            return new RelationNpcBuffLookupResult(false, List.of());
        }
    }

    private record CoinSegment(String unit, int divider, String label) {
    }
}

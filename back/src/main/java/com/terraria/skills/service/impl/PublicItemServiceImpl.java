package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.common.PageQuery;
import com.terraria.skills.dto.CategoryDTO;
import com.terraria.skills.dto.PublicItemBuffEffectDTO;
import com.terraria.skills.dto.PublicItemDetailDTO;
import com.terraria.skills.dto.PublicItemListDTO;
import com.terraria.skills.dto.PublicItemSuggestionDTO;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.CategoryManagementService;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import com.terraria.skills.service.PublicItemService;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PublicItemServiceImpl implements PublicItemService {

    static final String ITEM_BUFF_EFFECTS_SQL = """
        SELECT
            ibr.id AS id,
            COALESCE(pb.id, lb.id) AS buffId,
            COALESCE(pb.source_id, lb.source_id, ibr.buff_source_id) AS buffSourceId,
            COALESCE(pb.internal_name, lb.internal_name, ibr.buff_internal_name) AS buffInternalName,
            COALESCE(pb.english_name, lb.english_name, ibr.buff_internal_name) AS buffNameEn,
            COALESCE(pb.name_zh, lb.name_zh) AS buffNameZh,
            COALESCE(pb.image, lb.image) AS imageUrl,
            ibr.relation_type AS relationType,
            ibr.duration_ticks AS durationTicks,
            ibr.chance_value AS chanceValue,
            ibr.chance_text AS chanceText,
            ibr.conditions AS conditions
        FROM items li
        JOIN `terria_v1_relation`.`item_buff_relations` ibr
            ON (
                (ibr.item_internal_name IS NOT NULL AND li.internal_name COLLATE utf8mb4_unicode_ci = ibr.item_internal_name COLLATE utf8mb4_unicode_ci)
                OR (ibr.item_source_id IS NOT NULL AND li.id = ibr.item_source_id)
            )
        LEFT JOIN `terria_v1_relation`.`projection_buffs` pb
            ON (
                (ibr.buff_source_id IS NOT NULL AND pb.source_id = ibr.buff_source_id)
                OR (ibr.buff_internal_name IS NOT NULL AND pb.internal_name = ibr.buff_internal_name)
            )
        LEFT JOIN buffs lb
            ON lb.deleted = 0
            AND (
                (ibr.buff_source_id IS NOT NULL AND lb.source_id = ibr.buff_source_id)
                OR (ibr.buff_internal_name IS NOT NULL AND lb.internal_name COLLATE utf8mb4_unicode_ci = ibr.buff_internal_name COLLATE utf8mb4_unicode_ci)
            )
        WHERE li.deleted = 0
            AND li.id = ?
            AND ibr.deleted = 0
            AND ibr.relation_type = 'buff_source_item'
        ORDER BY ibr.id ASC
        """;

    private final ItemMapper itemMapper;
    private final CategoryManagementService categoryManagementService;
    private final ManagedImageUrlPolicy managedImageUrlPolicy;
    private final JdbcTemplate jdbcTemplate;

    @Override
    @Cacheable(cacheNames = "item:public:list", key = "#root.target.buildPublicListCacheKey(#pageQuery)", unless = "#result == null")
    public Page<PublicItemListDTO> getPublicItems(PageQuery pageQuery) {
        PageQuery safeQuery = pageQuery == null ? new PageQuery() : pageQuery;
        String normalizedSearch = trimToEmpty(safeQuery.getSearch());
        Long rarityId = mapRarityToId(safeQuery.getRarity());
        List<Long> categoryIds = resolveCategoryIds(safeQuery.getCategoryId(), safeQuery.getCategoryIds());
        long total = itemMapper.countItemsWithSearch(
            normalizedSearch,
            safeQuery.getCategoryId(),
            categoryIds,
            rarityId,
            safeQuery.getGamePeriodId()
        );
        long limit = Math.max(safeQuery.getLimit(), 1);
        long offset = Math.max(safeQuery.getPage() - 1L, 0L) * limit;
        List<PublicItemListDTO> records = itemMapper.selectPublicItemsWithSearch(
            normalizedSearch,
            safeQuery.getCategoryId(),
            categoryIds,
            rarityId,
            safeQuery.getGamePeriodId(),
            normalizeSortBy(safeQuery.getSortBy()),
            normalizeSortDirection(safeQuery.getSortDirection()),
            limit,
            offset,
            managedImagePrefixes()
        );

        Page<PublicItemListDTO> itemPage = new Page<>(safeQuery.getPage(), safeQuery.getLimit(), total);
        itemPage.setRecords(records);
        itemPage.setTotal(total);
        return itemPage;
    }

    @Override
    @Cacheable(cacheNames = "item:public:detail", key = "#root.target.buildPublicDetailCacheKey(#id)", unless = "#result == null")
    public PublicItemDetailDTO getPublicItemById(Long id) {
        return itemMapper.selectPublicItemDetailById(id, managedImagePrefixes());
    }

    @Override
    @Cacheable(
        cacheNames = "item:public:suggestions",
        key = "#root.target.buildPublicSuggestionsCacheKey(#keyword, #limit)",
        condition = "#keyword != null && !#keyword.trim().isEmpty()",
        unless = "#result == null"
    )
    public List<PublicItemSuggestionDTO> searchSuggestions(String keyword, int limit) {
        String normalizedKeyword = trimToEmpty(keyword);
        if (normalizedKeyword.isBlank()) {
            return List.of();
        }

        return itemMapper.selectPublicItemSuggestions(
            normalizedKeyword,
            normalizeSuggestionLimit(limit),
            managedImagePrefixes()
        );
    }

    @Override
    public List<PublicItemBuffEffectDTO> getPublicItemBuffEffects(Long id) {
        if (id == null) {
            return List.of();
        }
        return jdbcTemplate.query(ITEM_BUFF_EFFECTS_SQL, this::mapPublicItemBuffEffect, id);
    }

    public String buildPublicListCacheKey(PageQuery pageQuery) {
        int page = pageQuery == null || pageQuery.getPage() < 1 ? 1 : pageQuery.getPage();
        int limit = pageQuery == null || pageQuery.getLimit() < 1 ? 20 : pageQuery.getLimit();
        String search = pageQuery == null ? "" : trimToEmpty(pageQuery.getSearch());
        String categoryId = pageQuery == null || pageQuery.getCategoryId() == null ? "" : String.valueOf(pageQuery.getCategoryId());
        String categoryIds = pageQuery == null || pageQuery.getCategoryIds() == null ? "" : pageQuery.getCategoryIds().stream()
            .filter(Objects::nonNull)
            .sorted()
            .map(String::valueOf)
            .collect(Collectors.joining(","));
        String rarity = pageQuery == null ? "" : trimToEmpty(pageQuery.getRarity());
        String gamePeriodId = pageQuery == null || pageQuery.getGamePeriodId() == null ? "" : String.valueOf(pageQuery.getGamePeriodId());
        String sortBy = normalizeSortBy(pageQuery == null ? null : pageQuery.getSortBy());
        String sortDirection = normalizeSortDirection(pageQuery == null ? null : pageQuery.getSortDirection());

        return String.join("|",
            "v5",
            managedImagePrefixFingerprint(),
            String.valueOf(page),
            String.valueOf(limit),
            search,
            categoryId,
            categoryIds,
            rarity,
            gamePeriodId,
            sortBy,
            sortDirection
        );
    }

    public String buildPublicDetailCacheKey(Long id) {
        return String.join("|", "v3", managedImagePrefixFingerprint(), id == null ? "" : String.valueOf(id));
    }

    public String buildPublicSuggestionsCacheKey(String keyword, int limit) {
        return String.join("|",
            "v3",
            managedImagePrefixFingerprint(),
            trimToEmpty(keyword),
            String.valueOf(normalizeSuggestionLimit(limit))
        );
    }

    PublicItemBuffEffectDTO mapPublicItemBuffEffect(ResultSet resultSet, int rowNum) throws SQLException {
        PublicItemBuffEffectDTO dto = new PublicItemBuffEffectDTO();
        dto.setId(nullableLong(resultSet, "id"));
        dto.setBuffId(nullableLong(resultSet, "buffId"));
        dto.setBuffSourceId(nullableInteger(resultSet, "buffSourceId"));
        dto.setBuffInternalName(trimToNull(resultSet.getString("buffInternalName")));
        dto.setBuffNameEn(trimToNull(resultSet.getString("buffNameEn")));
        dto.setBuffNameZh(trimToNull(resultSet.getString("buffNameZh")));
        dto.setImageUrl(managedBuffImageUrl(resultSet.getString("imageUrl")));
        dto.setRelationType(trimToNull(resultSet.getString("relationType")));
        dto.setRelationLabel("buff_source_item".equals(dto.getRelationType()) ? "来源物品" : null);
        dto.setDurationTicks(nullableInteger(resultSet, "durationTicks"));
        dto.setDurationText(formatDurationText(dto.getDurationTicks()));
        dto.setChanceValue(nullableBigDecimal(resultSet, "chanceValue"));
        dto.setChanceText(trimToNull(resultSet.getString("chanceText")));
        dto.setConditions(trimToNull(resultSet.getString("conditions")));
        return dto;
    }

    private int normalizeSuggestionLimit(int limit) {
        if (limit < 1) {
            return 8;
        }
        return Math.min(limit, 10);
    }

    private List<Long> resolveCategoryIds(Long categoryId, List<Long> requestedCategoryIds) {
        LinkedHashSet<Long> requested = new LinkedHashSet<>();
        if (categoryId != null) {
            requested.add(categoryId);
        }
        if (requestedCategoryIds != null) {
            requestedCategoryIds.stream()
                .filter(Objects::nonNull)
                .forEach(requested::add);
        }
        if (requested.isEmpty()) {
            return null;
        }

        LinkedHashSet<Long> categoryIds = new LinkedHashSet<>();
        for (Long requestedCategoryId : requested) {
            categoryIds.add(requestedCategoryId);
            categoryManagementService.getAllDescendants(requestedCategoryId).stream()
                .map(CategoryDTO::getId)
                .filter(Objects::nonNull)
                .forEach(categoryIds::add);
        }

        return new ArrayList<>(categoryIds);
    }

    private Long mapRarityToId(String rarity) {
        if (rarity == null || rarity.isBlank()) {
            return null;
        }
        String value = rarity.trim();
        return switch (value) {
            case "鐏拌壊", "gray" -> -1L;
            case "鐧借壊", "普通", "white", "common" -> 0L;
            case "钃濊壊", "blue" -> 1L;
            case "缁胯壊", "green" -> 2L;
            case "姗欒壊", "orange" -> 3L;
            case "娴呯孩鑹?", "light_red", "light red" -> 4L;
            case "绮夎壊", "绮夌孩鑹?", "pink", "稀有", "rare" -> 5L;
            case "娴呯传鑹?", "light_purple", "light purple" -> 6L;
            case "榛勭豢鑹?", "lime" -> 7L;
            case "榛勮壊", "yellow", "史诗", "epic" -> 8L;
            case "闈掕壊", "cyan" -> 9L;
            case "绾㈣壊", "red", "传说", "legendary" -> 10L;
            case "绱壊", "purple" -> 11L;
            case "浠诲姟", "quest" -> -11L;
            case "涓撳", "expert" -> -12L;
            case "澶у笀", "master" -> -13L;
            default -> {
                try {
                    yield Long.parseLong(value);
                } catch (NumberFormatException ex) {
                    yield null;
                }
            }
        };
    }

    private String normalizeSortBy(String sortBy) {
        if (sortBy == null || sortBy.isBlank()) {
            return "id";
        }

        return switch (sortBy.trim()) {
            case "name" -> "name";
            case "rarityId" -> "rarityId";
            default -> "id";
        };
    }

    private String normalizeSortDirection(String sortDirection) {
        if (sortDirection == null || sortDirection.isBlank()) {
            return "asc";
        }

        return "asc".equalsIgnoreCase(sortDirection.trim()) ? "asc" : "desc";
    }

    private String trimToEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private Long nullableLong(ResultSet resultSet, String columnLabel) throws SQLException {
        long value = resultSet.getLong(columnLabel);
        return resultSet.wasNull() ? null : value;
    }

    private Integer nullableInteger(ResultSet resultSet, String columnLabel) throws SQLException {
        int value = resultSet.getInt(columnLabel);
        return resultSet.wasNull() ? null : value;
    }

    private BigDecimal nullableBigDecimal(ResultSet resultSet, String columnLabel) throws SQLException {
        return resultSet.getBigDecimal(columnLabel);
    }

    private String formatDurationText(Integer durationTicks) {
        if (durationTicks == null || durationTicks <= 0) {
            return null;
        }
        if (durationTicks < 60) {
            return durationTicks + "帧";
        }
        double seconds = durationTicks / 60.0;
        if (seconds == Math.rint(seconds)) {
            return ((int) seconds) + "秒";
        }
        return String.format(java.util.Locale.ROOT, "%.1f秒", seconds);
    }

    private String managedBuffImageUrl(String value) {
        String text = trimToNull(value);
        return managedImageUrlPolicy.isManagedImageUrlForDomain(text, "buffs") ? text : null;
    }

    private List<String> managedImagePrefixes() {
        List<String> prefixes = managedImageUrlPolicy.trustedManagedImageUrlPrefixes();
        return prefixes == null ? List.of() : prefixes;
    }

    private String managedImagePrefixFingerprint() {
        List<String> prefixes = managedImagePrefixes();
        if (prefixes.isEmpty()) {
            return "none";
        }
        return sha256Hex(String.join("\n", prefixes));
    }

    private String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(hash.length * 2);
            for (byte item : hash) {
                builder.append(String.format("%02x", item));
            }
            return builder.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 algorithm is not available", exception);
        }
    }
}

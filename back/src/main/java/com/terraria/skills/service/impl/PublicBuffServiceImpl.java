package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.PublicBuffDetailDTO;
import com.terraria.skills.dto.PublicBuffListDTO;
import com.terraria.skills.dto.PublicBuffQuery;
import com.terraria.skills.entity.Buff;
import com.terraria.skills.mapper.BuffMapper;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import com.terraria.skills.service.PublicBuffService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class PublicBuffServiceImpl implements PublicBuffService {

    private static final String RELATION_DATABASE_NAME = "terria_v1_relation";

    private final BuffMapper buffMapper;
    private final ManagedImageUrlPolicy managedImageUrlPolicy;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    @Override
    public Page<PublicBuffListDTO> getPublicBuffs(PublicBuffQuery query) {
        PublicBuffQuery safeQuery = query == null ? new PublicBuffQuery() : query;
        Page<Buff> page = buffMapper.selectPage(
            new Page<>(Math.max(1, safeQuery.getPage()), Math.max(1, safeQuery.getLimit())),
            buildListWrapper(safeQuery)
        );

        Page<PublicBuffListDTO> result = new Page<>(page.getCurrent(), page.getSize(), page.getTotal());
        result.setRecords(page.getRecords().stream().map(this::toListDto).toList());
        return result;
    }

    @Override
    public PublicBuffDetailDTO getPublicBuffDetail(Long id) {
        if (id == null) {
            return null;
        }
        Buff buff = buffMapper.selectById(id);
        if (buff == null || Integer.valueOf(0).equals(buff.getStatus())) {
            return null;
        }

        PublicBuffDetailDTO dto = new PublicBuffDetailDTO();
        dto.setId(buff.getId());
        dto.setSourceId(buff.getSourceId());
        dto.setInternalName(buff.getInternalName());
        dto.setName(firstNonBlank(buff.getNameZh(), buff.getEnglishName(), buff.getInternalName()));
        dto.setNameZh(buff.getNameZh());
        dto.setEnglishName(buff.getEnglishName());
        dto.setImageUrl(firstNonBlank(managedImageOrNull(buff.getImageCachedUrl()), managedImageOrNull(buff.getImage())));
        dto.setBuffType(buff.getBuffType());
        dto.setTooltipZh(buff.getTooltipZh());
        dto.setTooltipEn(buff.getTooltipEn());

        List<PublicBuffDetailDTO.FactSummary> sourceItems = loadSourceItems(buff);
        List<PublicBuffDetailDTO.FactSummary> inflictingNpcs = loadInflictingNpcs(buff.getId());
        List<PublicBuffDetailDTO.FactSummary> immuneNpcs = loadImmuneNpcs(buff);
        dto.setSourceItems(sourceItems);
        dto.setInflictingNpcs(inflictingNpcs);
        dto.setImmuneNpcs(immuneNpcs);
        dto.setSourceItemCount(firstNonNullInteger(buff.getSourceItemCount(), sourceItems.isEmpty() ? null : sourceItems.size(), 0));
        dto.setInflictingNpcCount(inflictingNpcs.size());
        dto.setImmuneNpcCount(firstNonNullInteger(buff.getImmuneNpcCount(), immuneNpcs.isEmpty() ? null : immuneNpcs.size(), 0));
        dto.setProvenance(PublicBuffDetailDTO.Provenance.builder()
            .provider("terraria.wiki.gg")
            .pageTitle(firstNonBlank(buff.getNameZh(), buff.getEnglishName(), buff.getInternalName()))
            .sectionAnchors(buildSectionAnchors(sourceItems, inflictingNpcs, immuneNpcs))
            .build());
        return dto;
    }

    private LambdaQueryWrapper<Buff> buildListWrapper(PublicBuffQuery query) {
        LambdaQueryWrapper<Buff> wrapper = new LambdaQueryWrapper<>();
        wrapper.and(scope -> scope.eq(Buff::getStatus, 1).or().isNull(Buff::getStatus));

        if (query.getSearch() != null && !query.getSearch().isBlank()) {
            String keyword = query.getSearch().trim();
            wrapper.and(scope -> scope.like(Buff::getInternalName, keyword)
                .or().like(Buff::getEnglishName, keyword)
                .or().like(Buff::getNameZh, keyword));
        }

        String sortBy = normalizeSortBy(query.getSortBy());
        boolean ascending = "asc".equals(normalizeSortDirection(query.getSortDirection()));
        switch (sortBy) {
            case "name" -> wrapper.orderBy(true, ascending, Buff::getNameZh)
                .orderBy(true, ascending, Buff::getEnglishName)
                .orderBy(true, ascending, Buff::getId);
            case "sourceItemCount" -> wrapper.orderBy(true, ascending, Buff::getSourceItemCount)
                .orderBy(true, ascending, Buff::getId);
            default -> wrapper.orderBy(true, ascending, Buff::getId);
        }
        return wrapper;
    }

    private PublicBuffListDTO toListDto(Buff buff) {
        PublicBuffListDTO dto = new PublicBuffListDTO();
        dto.setId(buff.getId());
        dto.setSourceId(buff.getSourceId());
        dto.setInternalName(buff.getInternalName());
        dto.setName(firstNonBlank(buff.getNameZh(), buff.getEnglishName(), buff.getInternalName()));
        dto.setNameZh(buff.getNameZh());
        dto.setImageUrl(firstNonBlank(managedImageOrNull(buff.getImageCachedUrl()), managedImageOrNull(buff.getImage())));
        dto.setBuffType(buff.getBuffType());
        dto.setTooltipZh(buff.getTooltipZh());
        dto.setSourceItemCount(buff.getSourceItemCount());
        dto.setImmuneNpcCount(buff.getImmuneNpcCount());
        return dto;
    }

    private List<PublicBuffDetailDTO.FactSummary> loadSourceItems(Buff buff) {
        if (buff == null || buff.getId() == null || jdbcTemplate == null) {
            return parseFactSummaries(buff == null ? null : buff.getSourceItemsJson(), "来自玩家");
        }
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                SELECT
                  bsi.item_id AS id,
                  bsi.source_item_id AS sourceId,
                  COALESCE(i.internal_name, bsi.source_item_internal_name) AS internalName,
                  COALESCE(i.name, bsi.source_item_name) AS name,
                  i.name_zh AS nameZh,
                  i.image AS imageUrl,
                  bsi.buff_time AS durationTicks
                FROM buff_source_items bsi
                LEFT JOIN items i ON i.id = bsi.item_id AND i.deleted = 0
                WHERE bsi.buff_id = ?
                ORDER BY bsi.sort_order ASC, bsi.id ASC
                """,
                buff.getId()
            );
            if (!rows.isEmpty()) {
                return rows.stream().map(row -> PublicBuffDetailDTO.FactSummary.builder()
                    .id(toLong(row.get("id")))
                    .sourceId(toInteger(row.get("sourceId")))
                    .internalName(trimToNull(row.get("internalName")))
                    .name(trimToNull(row.get("name")))
                    .nameZh(trimToNull(row.get("nameZh")))
                    .imageUrl(managedImageOrNull(trimToNull(row.get("imageUrl"))))
                    .durationTicks(toInteger(row.get("durationTicks")))
                    .sourceProvider("terraria.wiki.gg")
                    .sourcePage(firstNonBlank(buff.getNameZh(), buff.getEnglishName(), buff.getInternalName()))
                    .sourceSection("来自玩家")
                    .build()).toList();
            }
        } catch (Exception ignored) {
            // Fall back to the projection JSON when relation tables are unavailable.
        }
        return parseFactSummaries(buff.getSourceItemsJson(), "来自玩家");
    }

    private List<PublicBuffDetailDTO.FactSummary> loadInflictingNpcs(Long buffId) {
        if (buffId == null || jdbcTemplate == null) {
            return List.of();
        }
        try {
            return jdbcTemplate.queryForList(
                """
                SELECT
                  n.id AS id,
                  COALESCE(n.game_id, n.source_id) AS sourceId,
                  n.internal_name AS internalName,
                  n.name AS name,
                  n.name_zh AS nameZh,
                  n.image_url AS imageUrl,
                  nbr.relation_type AS relationType,
                  nbr.duration_ticks AS durationTicks,
                  nbr.chance_text AS chanceText,
                  nbr.conditions AS conditions
                FROM npc_buff_relations nbr
                JOIN npcs n ON n.id = nbr.npc_id AND n.deleted = 0
                WHERE nbr.buff_id = ? AND nbr.deleted = 0 AND nbr.relation_type = 'inflicts'
                ORDER BY nbr.sort_order ASC, nbr.id ASC
                """,
                buffId
            ).stream().map(row -> PublicBuffDetailDTO.FactSummary.builder()
                .id(toLong(row.get("id")))
                .sourceId(toInteger(row.get("sourceId")))
                .internalName(trimToNull(row.get("internalName")))
                .name(trimToNull(row.get("name")))
                .nameZh(trimToNull(row.get("nameZh")))
                .imageUrl(managedImageOrNull(trimToNull(row.get("imageUrl"))))
                .relationType(firstNonBlank(trimToNull(row.get("relationType")), "inflicts"))
                .durationTicks(toInteger(row.get("durationTicks")))
                .chanceText(trimToNull(row.get("chanceText")))
                .conditions(trimToNull(row.get("conditions")))
                .sourceProvider("terraria.wiki.gg")
                .sourceSection("来自敌怪")
                .build()).toList();
        } catch (Exception ignored) {
            return List.of();
        }
    }

    private List<PublicBuffDetailDTO.FactSummary> loadImmuneNpcs(Buff buff) {
        List<PublicBuffDetailDTO.FactSummary> fullFacts = loadProjectionImmuneNpcs(buff);
        if (!fullFacts.isEmpty()) {
            return fullFacts;
        }
        return parseFactSummaries(buff == null ? null : buff.getImmuneNpcSampleJson(), "免疫的 NPC");
    }

    private List<PublicBuffDetailDTO.FactSummary> loadProjectionImmuneNpcs(Buff buff) {
        if (buff == null || jdbcTemplate == null) {
            return List.of();
        }
        try {
            List<Object> args = new ArrayList<>();
            String where;
            if (buff.getId() != null) {
                where = "id = ?";
                args.add(buff.getId());
            } else if (buff.getSourceId() != null) {
                where = "source_id = ?";
                args.add(buff.getSourceId());
            } else if (buff.getInternalName() != null && !buff.getInternalName().isBlank()) {
                where = "internal_name = ?";
                args.add(buff.getInternalName());
            } else {
                return List.of();
            }

            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT immune_npcs_json FROM " + qualifiedProjectionBuffsTable() + " WHERE " + where + " LIMIT 1",
                args.toArray()
            );
            if (rows.isEmpty()) {
                return List.of();
            }
            return parseFactSummaries(trimToNull(rows.get(0).get("immune_npcs_json")), "免疫的 NPC");
        } catch (Exception ignored) {
            return List.of();
        }
    }

    private String qualifiedProjectionBuffsTable() {
        return "`" + RELATION_DATABASE_NAME + "`.`projection_buffs`";
    }

    private List<PublicBuffDetailDTO.FactSummary> parseFactSummaries(String json, String sourceSection) {
        List<Map<String, Object>> rows = parseJsonObjectList(json);
        List<PublicBuffDetailDTO.FactSummary> facts = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            facts.add(PublicBuffDetailDTO.FactSummary.builder()
                .id(toLong(firstValue(row, "id", "itemId", "npcDbId")))
                .sourceId(toInteger(firstValue(row, "sourceId", "source_id", "itemId", "npcId")))
                .internalName(trimToNull(firstValue(row, "internalName", "internal_name", "itemInternalName", "npcInternalName")))
                .name(trimToNull(firstValue(row, "name", "nameEn", "itemName", "npcName")))
                .nameZh(trimToNull(firstValue(row, "nameZh", "itemNameZh", "npcNameZh")))
                .imageUrl(managedImageOrNull(trimToNull(firstValue(row, "imageUrl", "image", "itemImageUrl", "npcImageUrl"))))
                .relationType(trimToNull(firstValue(row, "relationType", "relation_type")))
                .durationTicks(toInteger(firstValue(row, "durationTicks", "buffTime")))
                .chanceText(trimToNull(firstValue(row, "chanceText", "chance_text")))
                .conditions(trimToNull(firstValue(row, "conditions")))
                .sourceProvider(firstNonBlank(trimToNull(firstValue(row, "sourceProvider", "source_provider")), "terraria.wiki.gg"))
                .sourcePage(trimToNull(firstValue(row, "sourcePage", "source_page", "pageTitle")))
                .sourceSection(firstNonBlank(trimToNull(firstValue(row, "sourceSection", "source_section")), sourceSection))
                .sourceRevisionTimestamp(trimToNull(firstValue(row, "sourceRevisionTimestamp", "source_revision_timestamp")))
                .build());
        }
        return facts;
    }

    private List<Map<String, Object>> parseJsonObjectList(String json) {
        if (json == null || json.isBlank() || objectMapper == null) {
            return List.of();
        }
        try {
            List<Map<String, Object>> parsed = objectMapper.readValue(json, new TypeReference<>() {});
            return parsed == null ? List.of() : parsed;
        } catch (Exception ignored) {
            return List.of();
        }
    }

    private List<String> buildSectionAnchors(
        List<PublicBuffDetailDTO.FactSummary> sourceItems,
        List<PublicBuffDetailDTO.FactSummary> inflictingNpcs,
        List<PublicBuffDetailDTO.FactSummary> immuneNpcs
    ) {
        Set<String> sections = new LinkedHashSet<>();
        if (!sourceItems.isEmpty()) sections.add("来自玩家");
        if (!inflictingNpcs.isEmpty()) sections.add("来自敌怪");
        if (!immuneNpcs.isEmpty()) sections.add("免疫的_NPC");
        return List.copyOf(sections);
    }

    private String managedImageOrNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim();
        return managedImageUrlPolicy.isManagedImageUrlForDomain(normalized, "buffs") ? normalized : null;
    }

    private String firstNonBlank(String... values) {
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

    private Integer firstNonNullInteger(Integer... values) {
        if (values == null) {
            return null;
        }
        for (Integer value : values) {
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private Object firstValue(Map<String, Object> row, String... keys) {
        if (row == null || keys == null) {
            return null;
        }
        for (String key : keys) {
            if (row.containsKey(key)) {
                return row.get(key);
            }
        }
        return null;
    }

    private String trimToNull(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
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
            return Integer.valueOf(text);
        } catch (NumberFormatException ignored) {
            return null;
        }
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
            return Long.valueOf(text);
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private String normalizeSortBy(String sortBy) {
        if (sortBy == null || sortBy.isBlank()) {
            return "id";
        }
        return switch (sortBy.trim()) {
            case "name" -> "name";
            case "sourceItemCount" -> "sourceItemCount";
            default -> "id";
        };
    }

    private String normalizeSortDirection(String sortDirection) {
        if (sortDirection == null || sortDirection.isBlank()) {
            return "asc";
        }
        return "asc".equalsIgnoreCase(sortDirection.trim()) ? "asc" : "desc";
    }
}

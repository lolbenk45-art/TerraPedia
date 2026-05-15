package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.common.ItemImageSql;
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
import java.util.LinkedHashMap;
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

        ProjectionBuffEvidence projectionEvidence = loadProjectionBuffEvidence(buff);
        List<PublicBuffDetailDTO.FactSummary> sourceItems = loadSourceItems(buff, projectionEvidence);
        List<PublicBuffDetailDTO.FactSummary> inflictingNpcs = loadInflictingNpcs(buff, projectionEvidence);
        List<PublicBuffDetailDTO.FactSummary> immuneNpcs = loadImmuneNpcs(buff, projectionEvidence);
        dto.setSourceItems(sourceItems);
        dto.setInflictingNpcs(inflictingNpcs);
        dto.setImmuneNpcs(immuneNpcs);
        dto.setSourceItemCount(firstNonNullInteger(buff.getSourceItemCount(), sourceItems.isEmpty() ? null : sourceItems.size(), 0));
        dto.setInflictingNpcCount(inflictingNpcs.size());
        dto.setImmuneNpcCount(firstNonNullInteger(buff.getImmuneNpcCount(), immuneNpcs.isEmpty() ? null : immuneNpcs.size(), 0));
        PublicBuffDetailDTO.SourceEvidence sourceEvidence = parseSourceEvidence(projectionEvidence.sourceEvidenceJson());
        dto.setSourceEvidence(sourceEvidence);
        dto.setProvenance(PublicBuffDetailDTO.Provenance.builder()
            .provider(firstNonBlank(sourceEvidence == null ? null : sourceEvidence.getProvider(), "terraria.wiki.gg"))
            .pageTitle(firstNonBlank(sourceEvidence == null ? null : sourceEvidence.getPageTitle(), buff.getNameZh(), buff.getEnglishName(), buff.getInternalName()))
            .revisionTimestamp(sourceEvidence == null ? null : sourceEvidence.getRevisionTimestamp())
            .sectionAnchors(firstNonEmptyList(sourceEvidence == null ? null : sourceEvidence.getSectionAnchors(), buildSectionAnchors(sourceItems, inflictingNpcs, immuneNpcs)))
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

    private List<PublicBuffDetailDTO.FactSummary> loadSourceItems(Buff buff, ProjectionBuffEvidence projectionEvidence) {
        List<PublicBuffDetailDTO.FactSummary> projectionFacts = parseFactSummaries(
            firstNonBlank(projectionEvidence == null ? null : projectionEvidence.sourceItemsJson(), buff == null ? null : buff.getSourceItemsJson()),
            "来自玩家",
            "items"
        );
        if (buff == null || buff.getId() == null || jdbcTemplate == null) {
            return projectionFacts;
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
                  COALESCE(%s, i.image) AS imageUrl,
                  bsi.buff_time AS durationTicks
                FROM buff_source_items bsi
                LEFT JOIN items i ON i.id = bsi.item_id AND i.deleted = 0
                WHERE bsi.buff_id = ?
                ORDER BY bsi.sort_order ASC, bsi.id ASC
                """.formatted(ItemImageSql.preferredItemImageExpression("i")),
                buff.getId()
            );
            if (!rows.isEmpty()) {
                List<PublicBuffDetailDTO.FactSummary> relationFacts = rows.stream().map(row -> PublicBuffDetailDTO.FactSummary.builder()
                    .id(toLong(row.get("id")))
                    .sourceId(toInteger(row.get("sourceId")))
                    .internalName(trimToNull(row.get("internalName")))
                    .name(trimToNull(row.get("name")))
                    .nameZh(trimToNull(row.get("nameZh")))
                    .imageUrl(managedImageOrNull(trimToNull(row.get("imageUrl")), "items"))
                    .durationTicks(toInteger(row.get("durationTicks")))
                    .sourceProvider("terraria.wiki.gg")
                    .sourcePage(firstNonBlank(buff.getNameZh(), buff.getEnglishName(), buff.getInternalName()))
                    .sourceSection("来自玩家")
                    .build())
                .toList();
                return mergeFactSummaries(relationFacts, projectionFacts);
            }
        } catch (Exception ignored) {
            // Fall back to the projection JSON when relation tables are unavailable.
        }
        return projectionFacts;
    }

    private List<PublicBuffDetailDTO.FactSummary> loadInflictingNpcs(Buff buff, ProjectionBuffEvidence projectionEvidence) {
        List<PublicBuffDetailDTO.FactSummary> projectionFacts = enrichNpcFacts(parseFactSummaries(
            projectionEvidence == null ? null : projectionEvidence.inflictingNpcsJson(),
            "来自敌怪",
            "npcs"
        ));
        if (buff == null || jdbcTemplate == null) {
            return projectionFacts;
        }
        List<Object> relationArgs = new ArrayList<>();
        List<String> relationPredicates = new ArrayList<>();
        if (buff.getSourceId() != null) {
            relationPredicates.add("nbr.buff_source_id = ?");
            relationArgs.add(buff.getSourceId());
        }
        if (buff.getInternalName() != null && !buff.getInternalName().isBlank()) {
            relationPredicates.add("nbr.buff_internal_name = ?");
            relationArgs.add(buff.getInternalName());
        }
        if (!relationPredicates.isEmpty()) {
            try {
                List<PublicBuffDetailDTO.FactSummary> relationFacts = jdbcTemplate.queryForList(
                    """
                    SELECT
                      pn.id AS id,
                      COALESCE(pn.game_id, pn.source_id, nbr.npc_source_id) AS sourceId,
                      COALESCE(pn.internal_name, nbr.npc_internal_name) AS internalName,
                      COALESCE(pn.name, nbr.npc_name) AS name,
                      pn.name_zh AS nameZh,
                      pn.image_url AS imageUrl,
                      nbr.relation_type AS relationType,
                      nbr.duration_ticks AS durationTicks,
                      nbr.chance_text AS chanceText,
                      nbr.conditions AS conditions
                    FROM `terria_v1_relation`.`npc_buff_relations` nbr
                    LEFT JOIN `terria_v1_relation`.`projection_npcs` pn
                      ON (nbr.npc_source_id IS NOT NULL AND (pn.source_id = nbr.npc_source_id OR pn.game_id = nbr.npc_source_id))
                      OR (nbr.npc_internal_name IS NOT NULL AND pn.internal_name = nbr.npc_internal_name)
                    WHERE nbr.deleted = 0
                      AND nbr.relation_type = 'inflicts'
                      AND (""" + String.join(" OR ", relationPredicates) + """
)
                    ORDER BY nbr.id ASC
                    """,
                    relationArgs.toArray()
                ).stream().map(row -> PublicBuffDetailDTO.FactSummary.builder()
                    .id(toLong(row.get("id")))
                    .sourceId(toInteger(row.get("sourceId")))
                    .internalName(trimToNull(row.get("internalName")))
                    .name(trimToNull(row.get("name")))
                    .nameZh(trimToNull(row.get("nameZh")))
                    .imageUrl(managedImageOrNull(trimToNull(row.get("imageUrl")), "npcs"))
                    .relationType(firstNonBlank(trimToNull(row.get("relationType")), "inflicts"))
                    .durationTicks(toInteger(row.get("durationTicks")))
                    .chanceText(trimToNull(row.get("chanceText")))
                    .conditions(trimToNull(row.get("conditions")))
                    .sourceProvider("terraria.wiki.gg")
                    .sourceSection("来自敌怪")
                    .build())
                .toList();
                if (!relationFacts.isEmpty()) {
                    return mergeFactSummaries(relationFacts, projectionFacts);
                }
            } catch (Exception ignored) {
                // Fall back to legacy local compatibility table below.
            }
        }
        if (buff.getId() == null) {
            return projectionFacts;
        }
        try {
            List<PublicBuffDetailDTO.FactSummary> legacyFacts = jdbcTemplate.queryForList(
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
                buff.getId()
            ).stream().map(row -> PublicBuffDetailDTO.FactSummary.builder()
                .id(toLong(row.get("id")))
                .sourceId(toInteger(row.get("sourceId")))
                .internalName(trimToNull(row.get("internalName")))
                .name(trimToNull(row.get("name")))
                .nameZh(trimToNull(row.get("nameZh")))
                .imageUrl(managedImageOrNull(trimToNull(row.get("imageUrl")), "npcs"))
                .relationType(firstNonBlank(trimToNull(row.get("relationType")), "inflicts"))
                .durationTicks(toInteger(row.get("durationTicks")))
                .chanceText(trimToNull(row.get("chanceText")))
                .conditions(trimToNull(row.get("conditions")))
                .sourceProvider("terraria.wiki.gg")
                .sourceSection("来自敌怪")
                .build())
            .toList();
            return mergeFactSummaries(legacyFacts, projectionFacts);
        } catch (Exception ignored) {
            return projectionFacts;
        }
    }

    private List<PublicBuffDetailDTO.FactSummary> loadImmuneNpcs(Buff buff, ProjectionBuffEvidence projectionEvidence) {
        List<PublicBuffDetailDTO.FactSummary> fullFacts = parseFactSummaries(
            projectionEvidence == null ? null : projectionEvidence.immuneNpcsJson(),
            "免疫的 NPC",
            "npcs"
        );
        if (!fullFacts.isEmpty()) {
            return enrichNpcFacts(fullFacts);
        }
        return enrichNpcFacts(parseFactSummaries(buff == null ? null : buff.getImmuneNpcSampleJson(), "免疫的 NPC", "npcs"));
    }

    private ProjectionBuffEvidence loadProjectionBuffEvidence(Buff buff) {
        if (buff == null || jdbcTemplate == null) {
            return ProjectionBuffEvidence.empty();
        }
        ProjectionBuffLookup lookup = projectionBuffLookup(buff);
        if (lookup == null) {
            return ProjectionBuffEvidence.empty();
        }

        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT source_items_json, inflicting_npcs_json, immune_npcs_json, source_evidence_json FROM " + qualifiedProjectionBuffsTable() + " WHERE " + lookup.where() + " LIMIT 1",
                lookup.args()
            );
            if (rows.isEmpty()) {
                return ProjectionBuffEvidence.empty();
            }
            return new ProjectionBuffEvidence(
                trimToNull(rows.get(0).get("source_items_json")),
                trimToNull(rows.get(0).get("inflicting_npcs_json")),
                trimToNull(rows.get(0).get("immune_npcs_json")),
                trimToNull(rows.get(0).get("source_evidence_json"))
            );
        } catch (Exception ignored) {
            return new ProjectionBuffEvidence(
                loadProjectionBuffJsonColumn(lookup, "source_items_json"),
                loadProjectionBuffJsonColumn(lookup, "inflicting_npcs_json"),
                loadProjectionBuffJsonColumn(lookup, "immune_npcs_json"),
                loadProjectionBuffJsonColumn(lookup, "source_evidence_json")
            );
        }
    }

    private ProjectionBuffLookup projectionBuffLookup(Buff buff) {
        List<Object> args = new ArrayList<>();
        String where;
        if (buff.getSourceId() != null) {
            where = "source_id = ?";
            args.add(buff.getSourceId());
        } else if (buff.getInternalName() != null && !buff.getInternalName().isBlank()) {
            where = "internal_name = ?";
            args.add(buff.getInternalName());
        } else if (buff.getId() != null) {
            where = "id = ?";
            args.add(buff.getId());
        } else {
            return null;
        }
        return new ProjectionBuffLookup(where, args.toArray());
    }

    private String loadProjectionBuffJsonColumn(ProjectionBuffLookup lookup, String column) {
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT " + column + " FROM " + qualifiedProjectionBuffsTable() + " WHERE " + lookup.where() + " LIMIT 1",
                lookup.args()
            );
            if (rows.isEmpty()) {
                return null;
            }
            return trimToNull(rows.get(0).get(column));
        } catch (Exception ignored) {
            return null;
        }
    }

    private String qualifiedProjectionBuffsTable() {
        return "`" + RELATION_DATABASE_NAME + "`.`projection_buffs`";
    }

    private List<PublicBuffDetailDTO.FactSummary> parseFactSummaries(String json, String sourceSection, String imageDomain) {
        List<Map<String, Object>> rows = parseJsonObjectList(json);
        List<PublicBuffDetailDTO.FactSummary> facts = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            boolean npcFact = "npcs".equals(imageDomain);
            facts.add(PublicBuffDetailDTO.FactSummary.builder()
                .id(toLong(firstValue(row, npcFact ? new String[]{"npcDbId", "npc_db_id", "dbId"} : new String[]{"itemDbId", "item_db_id", "dbId"})))
                .sourceId(toInteger(firstValue(row, npcFact ? new String[]{"sourceId", "source_id", "npcId", "id"} : new String[]{"sourceId", "source_id", "itemId", "npcId"})))
                .internalName(trimToNull(firstValue(row, "internalName", "internal_name", "itemInternalName", "npcInternalName")))
                .name(trimToNull(firstValue(row, "name", "nameEn", "itemName", "npcName")))
                .nameZh(trimToNull(firstValue(row, "nameZh", "itemNameZh", "npcNameZh")))
                .imageUrl(managedImageOrNull(trimToNull(firstValue(row, "imageUrl", "image", "itemImageUrl", "npcImageUrl")), imageDomain))
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

    private List<PublicBuffDetailDTO.FactSummary> enrichNpcFacts(List<PublicBuffDetailDTO.FactSummary> facts) {
        if (facts == null || facts.isEmpty() || jdbcTemplate == null) {
            return facts == null ? List.of() : facts;
        }

        Set<Long> ids = new LinkedHashSet<>();
        Set<Integer> sourceIds = new LinkedHashSet<>();
        Set<String> internalNames = new LinkedHashSet<>();
        Set<String> names = new LinkedHashSet<>();
        for (PublicBuffDetailDTO.FactSummary fact : facts) {
            if (fact.getId() != null) ids.add(fact.getId());
            if (fact.getSourceId() != null) sourceIds.add(fact.getSourceId());
            String internalName = trimToNull(fact.getInternalName());
            if (internalName != null) internalNames.add(internalName);
            String name = trimToNull(fact.getName());
            if (name != null) names.add(name);
            String nameZh = trimToNull(fact.getNameZh());
            if (nameZh != null) names.add(nameZh);
            String sourcePage = trimToNull(fact.getSourcePage());
            if (sourcePage != null) names.add(sourcePage);
        }
        if (ids.isEmpty() && sourceIds.isEmpty() && internalNames.isEmpty() && names.isEmpty()) {
            return facts;
        }

        List<Object> args = new ArrayList<>();
        List<String> predicates = new ArrayList<>();
        addInPredicate(predicates, args, "n.id", ids);
        addInPredicate(predicates, args, "n.source_id", sourceIds);
        addInPredicate(predicates, args, "n.game_id", sourceIds);
        addInPredicate(predicates, args, "n.internal_name", internalNames);
        addInPredicate(predicates, args, "n.name", names);
        addInPredicate(predicates, args, "n.name_zh", names);

        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                SELECT
                  n.id AS id,
                  COALESCE(n.game_id, n.source_id) AS sourceId,
                  n.source_id AS rawSourceId,
                  n.game_id AS gameId,
                  n.internal_name AS internalName,
                  n.name AS name,
                  n.name_zh AS nameZh,
                  n.image_url AS imageUrl
                FROM npcs n
                WHERE n.deleted = 0 AND (
                """ + String.join(" OR ", predicates) + ")",
                args.toArray()
            );
            if (rows == null || rows.isEmpty()) {
                return facts;
            }

            Map<Long, Map<String, Object>> byId = new java.util.HashMap<>();
            Map<Integer, Map<String, Object>> bySourceId = new java.util.HashMap<>();
            Map<String, Map<String, Object>> byInternalName = new java.util.HashMap<>();
            Map<String, List<Map<String, Object>>> byName = new java.util.HashMap<>();
            for (Map<String, Object> row : rows) {
                Long id = toLong(row.get("id"));
                if (id != null) byId.putIfAbsent(id, row);
                putIntegerKey(bySourceId, row.get("sourceId"), row);
                putIntegerKey(bySourceId, row.get("rawSourceId"), row);
                putIntegerKey(bySourceId, row.get("gameId"), row);
                String internalName = trimToNull(row.get("internalName"));
                if (internalName != null) byInternalName.putIfAbsent(internalName, row);
                putTextKey(byName, row.get("name"), row);
                putTextKey(byName, row.get("nameZh"), row);
            }

            return facts.stream().map(fact -> enrichNpcFact(fact, byId, bySourceId, byInternalName, byName)).toList();
        } catch (Exception ignored) {
            return facts;
        }
    }

    private List<PublicBuffDetailDTO.FactSummary> mergeFactSummaries(
        List<PublicBuffDetailDTO.FactSummary> primary,
        List<PublicBuffDetailDTO.FactSummary> fallback
    ) {
        List<PublicBuffDetailDTO.FactSummary> merged = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (PublicBuffDetailDTO.FactSummary fact : nonNullFacts(primary)) {
            merged.add(fact);
            seen.add(factSummaryKey(fact));
        }
        for (PublicBuffDetailDTO.FactSummary fact : nonNullFacts(fallback)) {
            if (seen.add(factSummaryKey(fact))) {
                merged.add(fact);
            }
        }
        return List.copyOf(merged);
    }

    private List<PublicBuffDetailDTO.FactSummary> nonNullFacts(List<PublicBuffDetailDTO.FactSummary> facts) {
        return facts == null ? List.of() : facts;
    }

    private String factSummaryKey(PublicBuffDetailDTO.FactSummary fact) {
        if (fact == null) {
            return "";
        }
        if (fact.getSourceId() != null) {
            return "sourceId:" + fact.getSourceId();
        }
        String internalName = trimToNull(fact.getInternalName());
        if (internalName != null) {
            return "internalName:" + internalName;
        }
        String name = trimToNull(fact.getName());
        if (name != null) {
            return "name:" + name;
        }
        String sourcePage = trimToNull(fact.getSourcePage());
        if (sourcePage != null) {
            return "sourcePage:" + sourcePage;
        }
        return String.valueOf(System.identityHashCode(fact));
    }

    private PublicBuffDetailDTO.FactSummary enrichNpcFact(
        PublicBuffDetailDTO.FactSummary fact,
        Map<Long, Map<String, Object>> byId,
        Map<Integer, Map<String, Object>> bySourceId,
        Map<String, Map<String, Object>> byInternalName,
        Map<String, List<Map<String, Object>>> byName
    ) {
        Map<String, Object> npc = null;
        if (fact.getId() != null) npc = byId.get(fact.getId());
        if (npc == null && fact.getSourceId() != null) npc = bySourceId.get(fact.getSourceId());
        String internalName = trimToNull(fact.getInternalName());
        if (npc == null && internalName != null) npc = byInternalName.get(internalName);
        String name = trimToNull(fact.getName());
        if (npc == null && name != null) npc = uniqueNameMatch(byName, name);
        String nameZh = trimToNull(fact.getNameZh());
        if (npc == null && nameZh != null) npc = uniqueNameMatch(byName, nameZh);
        String sourcePage = trimToNull(fact.getSourcePage());
        if (npc == null && sourcePage != null) npc = uniqueNameMatch(byName, sourcePage);
        if (npc == null) {
            return fact;
        }

        return PublicBuffDetailDTO.FactSummary.builder()
            .id(firstNonNullLong(toLong(npc.get("id")), fact.getId()))
            .sourceId(firstNonNullInteger(toInteger(firstValue(npc, "sourceId", "rawSourceId", "gameId")), fact.getSourceId()))
            .internalName(firstNonBlank(trimToNull(npc.get("internalName")), fact.getInternalName()))
            .name(firstNonBlank(fact.getName(), trimToNull(npc.get("name"))))
            .nameZh(firstNonBlank(fact.getNameZh(), trimToNull(npc.get("nameZh"))))
            .imageUrl(firstNonBlank(managedImageOrNull(trimToNull(npc.get("imageUrl")), "npcs"), fact.getImageUrl()))
            .relationType(fact.getRelationType())
            .durationTicks(fact.getDurationTicks())
            .chanceText(fact.getChanceText())
            .conditions(fact.getConditions())
            .sourceProvider(fact.getSourceProvider())
            .sourcePage(fact.getSourcePage())
            .sourceSection(fact.getSourceSection())
            .sourceRevisionTimestamp(fact.getSourceRevisionTimestamp())
            .build();
    }

    private void putIntegerKey(Map<Integer, Map<String, Object>> target, Object key, Map<String, Object> row) {
        Integer integerKey = toInteger(key);
        if (integerKey != null) {
            target.putIfAbsent(integerKey, row);
        }
    }

    private void putTextKey(Map<String, List<Map<String, Object>>> target, Object key, Map<String, Object> row) {
        String textKey = trimToNull(key);
        if (textKey != null) {
            target.computeIfAbsent(textKey, ignored -> new ArrayList<>()).add(row);
        }
    }

    private Map<String, Object> uniqueNameMatch(Map<String, List<Map<String, Object>>> byName, String key) {
        List<Map<String, Object>> matches = byName.get(key);
        if (matches == null || matches.size() != 1) {
            return null;
        }
        return matches.get(0);
    }

    private void addInPredicate(List<String> predicates, List<Object> args, String column, Set<?> values) {
        if (values == null || values.isEmpty()) {
            return;
        }
        predicates.add(column + " IN (" + "?,".repeat(values.size()).replaceFirst(",$", "") + ")");
        args.addAll(values);
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

    private PublicBuffDetailDTO.SourceEvidence parseSourceEvidence(String json) {
        Map<String, Object> payload = parseJsonObject(json);
        if (payload.isEmpty()) {
            return null;
        }
        return PublicBuffDetailDTO.SourceEvidence.builder()
            .provider(firstNonBlank(trimToNull(firstValue(payload, "provider", "sourceProvider", "source_provider")), "terraria.wiki.gg"))
            .pageTitle(trimToNull(firstValue(payload, "pageTitle", "page_title")))
            .canonicalPageTitle(trimToNull(firstValue(payload, "canonicalPageTitle", "canonical_page_title")))
            .revisionId(toLong(firstValue(payload, "revisionId", "revision_id")))
            .revisionTimestamp(trimToNull(firstValue(payload, "revisionTimestamp", "revision_timestamp", "sourceRevisionTimestamp", "source_revision_timestamp")))
            .parseStatus(trimToNull(firstValue(payload, "parseStatus", "parse_status")))
            .sectionAnchors(parseStringList(firstValue(payload, "sectionAnchors", "section_anchors")))
            .unresolvedFacts(parseObjectListValue(firstValue(payload, "unresolvedFacts", "unresolved_facts")))
            .build();
    }

    private Map<String, Object> parseJsonObject(String json) {
        if (json == null || json.isBlank() || objectMapper == null) {
            return Map.of();
        }
        try {
            Map<String, Object> parsed = objectMapper.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() {});
            return parsed == null ? Map.of() : parsed;
        } catch (Exception ignored) {
            return Map.of();
        }
    }

    private List<String> parseStringList(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        return list.stream().map(this::trimToNull).filter(java.util.Objects::nonNull).toList();
    }

    private List<Map<String, Object>> parseObjectListValue(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Object entry : list) {
            if (entry instanceof Map<?, ?> map) {
                Map<String, Object> row = new LinkedHashMap<>();
                map.forEach((key, rowValue) -> {
                    if (key != null) {
                        row.put(String.valueOf(key), rowValue);
                    }
                });
                rows.add(row);
            }
        }
        return rows;
    }

    private List<String> firstNonEmptyList(List<String> first, List<String> second) {
        return first != null && !first.isEmpty() ? first : second;
    }

    private String managedImageOrNull(String value) {
        return managedImageOrNull(value, "buffs");
    }

    private String managedImageOrNull(String value, String domain) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim();
        return managedImageUrlPolicy.isManagedImageUrlForDomain(normalized, domain) ? normalized : null;
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

    private Long firstNonNullLong(Long... values) {
        if (values == null) {
            return null;
        }
        for (Long value : values) {
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

    private record ProjectionBuffEvidence(
        String sourceItemsJson,
        String inflictingNpcsJson,
        String immuneNpcsJson,
        String sourceEvidenceJson
    ) {
        private static ProjectionBuffEvidence empty() {
            return new ProjectionBuffEvidence(null, null, null, null);
        }
    }

    private record ProjectionBuffLookup(String where, Object[] args) {
    }
}

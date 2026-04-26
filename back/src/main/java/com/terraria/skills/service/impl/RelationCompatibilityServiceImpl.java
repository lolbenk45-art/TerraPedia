package com.terraria.skills.service.impl;

import com.terraria.skills.config.RelationCompatibilityProperties;
import com.terraria.skills.dto.RelationCompatibilityDomainStatusDTO;
import com.terraria.skills.dto.RelationCompatibilityStatusDTO;
import com.terraria.skills.service.RelationCompatibilityService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class RelationCompatibilityServiceImpl implements RelationCompatibilityService {

    private static final List<DomainConfig> DOMAINS = List.of(
        new DomainConfig(
            "items",
            "items",
            "projection_items",
            "internal_name",
            List.of("name", "name_zh", "image", "damage", "defense", "knockback", "use_time", "buy", "sell", "tooltip", "tooltip_zh", "rarity_id", "is_stackable", "stack_size")
        ),
        new DomainConfig(
            "npcs",
            "npcs",
            "projection_npcs",
            "internal_name",
            List.of("name", "name_zh", "sub_name", "sub_name_zh", "image_url", "is_boss", "is_friendly", "is_town_npc", "damage", "defense", "life_max", "knock_back_resist", "scale", "value", "buff_immune")
        ),
        new DomainConfig(
            "projectiles",
            "projectiles",
            "projection_projectiles",
            "internal_name",
            List.of("name", "name_zh", "image_url", "ai_style", "damage", "knock_back", "penetrate", "time_left", "scale", "friendly", "hostile", "tile_collide")
        ),
        new DomainConfig(
            "buffs",
            "buffs",
            "projection_buffs",
            "internal_name",
            List.of("english_name", "name_zh", "tooltip_en", "tooltip_zh", "image", "buff_type", "source_item_count", "immune_npc_count")
        )
    );

    private final JdbcTemplate jdbcTemplate;
    private final RelationCompatibilityProperties properties;

    @Override
    public RelationCompatibilityStatusDTO getStatus() {
        RelationCompatibilityStatusDTO status = new RelationCompatibilityStatusDTO();
        status.setGeneratedAt(Instant.now());

        Map<String, RelationCompatibilityDomainStatusDTO> domains = new LinkedHashMap<>();
        List<String> switchableDomains = new ArrayList<>();
        List<String> blockedDomains = new ArrayList<>();
        for (DomainConfig domain : DOMAINS) {
            RelationCompatibilityDomainStatusDTO domainStatus = buildDomainStatus(
                domain,
                queryRows(domain.localTable()),
                queryRows(qualifiedProjectionTable(domain.projectionTable()))
            );
            domains.put(domain.name(), domainStatus);
            if ("switchable".equals(domainStatus.getStatus())) {
                switchableDomains.add(domain.name());
            } else {
                blockedDomains.add(domain.name());
            }
        }

        status.setDomains(domains);
        status.setSwitchableDomains(switchableDomains);
        status.setBlockedDomains(blockedDomains);
        status.setSwitchable(blockedDomains.isEmpty());
        return status;
    }

    private RelationCompatibilityDomainStatusDTO buildDomainStatus(
        DomainConfig domain,
        List<Map<String, Object>> localRows,
        List<Map<String, Object>> projectionRows
    ) {
        Map<String, Map<String, Object>> localByKey = indexRows(localRows, domain.keyColumn());
        Map<String, Map<String, Object>> projectionByKey = indexRows(projectionRows, domain.keyColumn());
        Set<String> localKeys = localByKey.keySet();
        Set<String> projectionKeys = projectionByKey.keySet();
        List<String> missingInProjection = localKeys.stream()
            .filter(key -> !projectionByKey.containsKey(key))
            .toList();
        List<String> extraInProjection = projectionKeys.stream()
            .filter(key -> !localByKey.containsKey(key))
            .toList();
        List<String> sharedKeys = localKeys.stream()
            .filter(projectionByKey::containsKey)
            .toList();

        List<RelationCompatibilityDomainStatusDTO.BlockingFieldDTO> blockingFields = new ArrayList<>();
        for (String field : domain.fields()) {
            int localNonNull = 0;
            int projectionNonNull = 0;
            for (String key : sharedKeys) {
                if (isPresent(localByKey.get(key).get(field))) {
                    localNonNull += 1;
                }
                if (isPresent(projectionByKey.get(key).get(field))) {
                    projectionNonNull += 1;
                }
            }
            if (projectionNonNull < localNonNull) {
                RelationCompatibilityDomainStatusDTO.BlockingFieldDTO blockingField = new RelationCompatibilityDomainStatusDTO.BlockingFieldDTO();
                blockingField.setField(field);
                blockingField.setLocalNonNull(localNonNull);
                blockingField.setProjectionNonNull(projectionNonNull);
                blockingField.setGap(localNonNull - projectionNonNull);
                blockingFields.add(blockingField);
            }
        }

        RelationCompatibilityDomainStatusDTO status = new RelationCompatibilityDomainStatusDTO();
        status.setDomain(domain.name());
        status.setLocalRows(localRows.size());
        status.setProjectionRows(projectionRows.size());
        status.setSharedRows(sharedKeys.size());
        status.setMissingInProjectionCount(missingInProjection.size());
        status.setExtraInProjectionCount(extraInProjection.size());
        status.setMissingInProjectionSamples(sample(missingInProjection));
        status.setExtraInProjectionSamples(sample(extraInProjection));
        status.setBlockingFields(blockingFields);
        status.setStatus(missingInProjection.isEmpty() && extraInProjection.isEmpty() && blockingFields.isEmpty() ? "switchable" : "blocked");
        return status;
    }

    private List<Map<String, Object>> queryRows(String tableName) {
        return jdbcTemplate.queryForList("SELECT * FROM " + tableName);
    }

    private String qualifiedProjectionTable(String tableName) {
        return quoteIdentifier(properties.getRelationDatabase()) + "." + quoteIdentifier(tableName);
    }

    private String quoteIdentifier(String value) {
        return "`" + value.replace("`", "``") + "`";
    }

    private Map<String, Map<String, Object>> indexRows(List<Map<String, Object>> rows, String keyColumn) {
        Map<String, Map<String, Object>> indexed = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            Object rawKey = row.get(keyColumn);
            if (rawKey == null) {
                continue;
            }
            String key = String.valueOf(rawKey).trim();
            if (!key.isEmpty()) {
                indexed.put(key, row);
            }
        }
        return indexed;
    }

    private boolean isPresent(Object value) {
        return value != null && !String.valueOf(value).isBlank();
    }

    private List<String> sample(List<String> values) {
        int limit = Math.max(0, properties.getSampleLimit());
        return values.stream()
            .limit(limit)
            .toList();
    }

    private record DomainConfig(
        String name,
        String localTable,
        String projectionTable,
        String keyColumn,
        List<String> fields
    ) {
        @Override
        public String localTable() {
            return "`" + localTable + "`";
        }
    }
}

package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.terraria.skills.dto.ItemSourceDTO;
import com.terraria.skills.entity.Biome;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.ItemAcquisitionSource;
import com.terraria.skills.entity.Npc;
import com.terraria.skills.mapper.BiomeMapper;
import com.terraria.skills.mapper.ItemAcquisitionSourceMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.mapper.NpcMapper;
import com.terraria.skills.service.ItemSourceService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ItemSourceServiceImpl implements ItemSourceService {

    private static final String SOURCE_REF_TYPE_ITEM = "item";
    private static final String SOURCE_REF_TYPE_NPC = "npc";
    private static final String SOURCE_REF_TYPE_BOSS = "boss";
    private static final Set<String> ITEM_BACKED_SOURCE_REF_TYPES = Set.of("item", "container", "crate", "treasure_bag");
    private static final Set<String> NPC_BACKED_SOURCE_REF_TYPES = Set.of(SOURCE_REF_TYPE_NPC, SOURCE_REF_TYPE_BOSS);

    private final ItemAcquisitionSourceMapper itemAcquisitionSourceMapper;
    private final BiomeMapper biomeMapper;
    private final ItemMapper itemMapper;
    private final NpcMapper npcMapper;

    @Override
    public List<ItemSourceDTO> getSourcesByItemId(Long itemId) {
        List<ItemAcquisitionSource> sources = itemAcquisitionSourceMapper.selectList(new LambdaQueryWrapper<ItemAcquisitionSource>()
            .eq(ItemAcquisitionSource::getItemId, itemId)
            .eq(ItemAcquisitionSource::getStatus, 1)
            .orderByAsc(ItemAcquisitionSource::getSortOrder, ItemAcquisitionSource::getId));

        if (sources == null || sources.isEmpty()) {
            return Collections.emptyList();
        }

        List<Long> biomeIds = sources.stream()
            .map(ItemAcquisitionSource::getBiomeId)
            .filter(java.util.Objects::nonNull)
            .distinct()
            .toList();

        Map<Long, Biome> biomeById = biomeIds.isEmpty()
            ? Collections.emptyMap()
            : biomeMapper.selectBatchIds(biomeIds).stream().collect(Collectors.toMap(Biome::getId, Function.identity()));

        Set<String> sourceNames = sources.stream()
            .map(ItemAcquisitionSource::getSourceRefName)
            .map(this::cleanSourceRefName)
            .filter(Objects::nonNull)
            .collect(Collectors.toCollection(LinkedHashSet::new));
        Set<String> npcSourceNames = npcBackedSourceNames(sources);

        Map<Long, SourceRefMetadata> itemMetadataById = loadItemMetadataById(sources);
        Map<Long, SourceRefMetadata> npcMetadataById = loadNpcMetadataById(sources);
        Map<String, SourceRefMetadata> itemMetadataByName = loadItemMetadataByName(sourceNames);
        Map<String, SourceRefMetadata> npcMetadataByName = loadNpcMetadataByName(npcSourceNames);

        Map<String, ItemSourceDTO> deduped = new LinkedHashMap<>();

        for (ItemAcquisitionSource source : sources) {
            ItemSourceDTO dto = new ItemSourceDTO();
            BeanUtils.copyProperties(source, dto);

            String cleanedSourceRefName = cleanSourceRefName(source.getSourceRefName());
            dto.setSourceRefName(cleanedSourceRefName);
            SourceRefMetadata sourceRefMetadata = resolveSourceRefMetadata(source, cleanedSourceRefName, itemMetadataById, npcMetadataById, itemMetadataByName, npcMetadataByName);
            if (sourceRefMetadata != null) {
                dto.setSourceRefNameZh(sourceRefMetadata.nameZh());
                dto.setImageUrl(sourceRefMetadata.imageUrl());
                dto.setSourceRefImageUrl(sourceRefMetadata.imageUrl());
                if (SOURCE_REF_TYPE_ITEM.equalsIgnoreCase(normalizeText(sourceRefMetadata.sourceRefType(), ""))) {
                    dto.setItemImageUrl(sourceRefMetadata.imageUrl());
                } else if (SOURCE_REF_TYPE_NPC.equalsIgnoreCase(normalizeText(sourceRefMetadata.sourceRefType(), ""))) {
                    dto.setNpcImageUrl(sourceRefMetadata.imageUrl());
                }
            }

            Biome biome = biomeById.get(source.getBiomeId());
            if (biome != null) {
                dto.setBiomeCode(biome.getCode());
                dto.setBiomeNameEn(biome.getNameEn());
                dto.setBiomeNameZh(biome.getNameZh());
            }

            String dedupeKey = buildDedupeKey(dto);
            ItemSourceDTO existing = deduped.get(dedupeKey);
            if (existing == null) {
                deduped.put(dedupeKey, dto);
            } else {
                mergeMissingSourceMetadata(existing, dto);
            }
        }

        return List.copyOf(deduped.values());
    }

    private Map<Long, SourceRefMetadata> loadItemMetadataById(List<ItemAcquisitionSource> sources) {
        Set<Long> ids = itemBackedSourceRefIds(sources);
        if (ids.isEmpty()) {
            return Collections.emptyMap();
        }
        List<Item> items = itemMapper.selectList(
            new LambdaQueryWrapper<Item>()
                .eq(Item::getStatus, 1)
                .eq(Item::getDeleted, 0)
                .in(Item::getId, ids)
        );
        Map<Long, SourceRefMetadata> lookup = new LinkedHashMap<>();
        for (Item item : items) {
            if (item != null && item.getId() != null) {
                lookup.putIfAbsent(item.getId(), SourceRefMetadata.fromItem(item));
            }
        }
        return lookup;
    }

    private Map<Long, SourceRefMetadata> loadNpcMetadataById(List<ItemAcquisitionSource> sources) {
        Set<Long> ids = npcBackedSourceRefIds(sources);
        if (ids.isEmpty()) {
            return Collections.emptyMap();
        }
        List<Npc> npcs = npcMapper.selectList(
            new QueryWrapper<Npc>()
                .eq("status", 1)
                .eq("deleted", 0)
                .in("id", ids)
        );
        Map<Long, SourceRefMetadata> lookup = new LinkedHashMap<>();
        for (Npc npc : npcs) {
            if (npc != null && npc.getId() != null) {
                lookup.putIfAbsent(npc.getId(), SourceRefMetadata.fromNpc(npc));
            }
        }
        return lookup;
    }

    private Map<String, SourceRefMetadata> loadItemMetadataByName(Set<String> sourceNames) {
        if (sourceNames.isEmpty()) {
            return Collections.emptyMap();
        }

        List<Item> items = itemMapper.selectList(
            new QueryWrapper<Item>()
                .eq("status", 1)
                .eq("deleted", 0)
                .and(wrapper -> wrapper.in("name", sourceNames).or().in("internal_name", sourceNames))
        );

        Map<String, SourceRefMetadata> lookup = new LinkedHashMap<>();
        for (Item item : items) {
            SourceRefMetadata metadata = SourceRefMetadata.fromItem(item);
            putLookup(lookup, item.getName(), metadata);
            putLookup(lookup, item.getInternalName(), metadata);
        }
        return lookup;
    }

    private Map<String, SourceRefMetadata> loadNpcMetadataByName(Set<String> sourceNames) {
        if (sourceNames.isEmpty()) {
            return Collections.emptyMap();
        }

        List<Npc> npcs = npcMapper.selectList(
            new QueryWrapper<Npc>()
                .eq("status", 1)
                .eq("deleted", 0)
                .and(wrapper -> wrapper.in("name", sourceNames).or().in("internal_name", sourceNames))
        );

        Map<String, SourceRefMetadata> lookup = new LinkedHashMap<>();
        for (Npc npc : npcs) {
            SourceRefMetadata metadata = SourceRefMetadata.fromNpc(npc);
            putLookup(lookup, npc.getName(), metadata);
            putLookup(lookup, npc.getInternalName(), metadata);
        }
        return lookup;
    }

    private SourceRefMetadata resolveSourceRefMetadata(
        ItemAcquisitionSource source,
        String cleanedSourceRefName,
        Map<Long, SourceRefMetadata> itemMetadataById,
        Map<Long, SourceRefMetadata> npcMetadataById,
        Map<String, SourceRefMetadata> itemMetadataByName,
        Map<String, SourceRefMetadata> npcMetadataByName
    ) {
        String sourceRefType = normalizeText(source.getSourceRefType(), "");
        if (ITEM_BACKED_SOURCE_REF_TYPES.contains(sourceRefType.toLowerCase(Locale.ROOT))) {
            SourceRefMetadata byId = source.getSourceRefId() == null ? null : itemMetadataById.get(source.getSourceRefId());
            return mergeMetadata(byId, metadataByName(cleanedSourceRefName, itemMetadataByName));
        }
        if (NPC_BACKED_SOURCE_REF_TYPES.contains(sourceRefType.toLowerCase(Locale.ROOT))) {
            SourceRefMetadata byId = source.getSourceRefId() == null ? null : npcMetadataById.get(source.getSourceRefId());
            SourceRefMetadata npcMetadata = mergeMetadata(byId, metadataByName(cleanedSourceRefName, npcMetadataByName));
            if (npcMetadata != null) {
                return npcMetadata;
            }
            return null;
        }
        SourceRefMetadata itemMetadata = metadataByName(cleanedSourceRefName, itemMetadataByName);
        return itemMetadata;
    }

    private SourceRefMetadata metadataByName(String cleanedSourceRefName, Map<String, SourceRefMetadata> metadataByName) {
        String key = normalizeLookupKey(cleanedSourceRefName);
        return key == null ? null : metadataByName.get(key);
    }

    private SourceRefMetadata mergeMetadata(SourceRefMetadata primary, SourceRefMetadata fallback) {
        if (primary == null) {
            return fallback;
        }
        if (fallback == null) {
            return primary;
        }
        return new SourceRefMetadata(
            primary.nameZh() == null ? fallback.nameZh() : primary.nameZh(),
            primary.imageUrl() == null ? fallback.imageUrl() : primary.imageUrl(),
            primary.sourceRefType() == null ? fallback.sourceRefType() : primary.sourceRefType()
        );
    }

    private Set<Long> npcBackedSourceRefIds(List<ItemAcquisitionSource> sources) {
        return sources.stream()
            .filter(source -> NPC_BACKED_SOURCE_REF_TYPES.contains(normalizeText(source.getSourceRefType(), "").toLowerCase(Locale.ROOT)))
            .map(ItemAcquisitionSource::getSourceRefId)
            .filter(Objects::nonNull)
            .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private Set<Long> itemBackedSourceRefIds(List<ItemAcquisitionSource> sources) {
        return sources.stream()
            .filter(source -> ITEM_BACKED_SOURCE_REF_TYPES.contains(normalizeText(source.getSourceRefType(), "").toLowerCase(Locale.ROOT)))
            .map(ItemAcquisitionSource::getSourceRefId)
            .filter(Objects::nonNull)
            .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private Set<String> npcBackedSourceNames(List<ItemAcquisitionSource> sources) {
        return sources.stream()
            .filter(source -> NPC_BACKED_SOURCE_REF_TYPES.contains(normalizeText(source.getSourceRefType(), "").toLowerCase(Locale.ROOT)))
            .map(ItemAcquisitionSource::getSourceRefName)
            .map(this::cleanSourceRefName)
            .filter(Objects::nonNull)
            .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private void putLookup(Map<String, SourceRefMetadata> lookup, String rawKey, SourceRefMetadata value) {
        String key = normalizeLookupKey(rawKey);
        if (key != null && !lookup.containsKey(key)) {
            lookup.put(key, value);
        }
    }

    private void mergeMissingSourceMetadata(ItemSourceDTO target, ItemSourceDTO candidate) {
        if (target.getSourceRefId() == null) {
            target.setSourceRefId(candidate.getSourceRefId());
        }
        if (target.getSourceRefNameZh() == null) {
            target.setSourceRefNameZh(candidate.getSourceRefNameZh());
        }
        if (target.getImageUrl() == null) {
            target.setImageUrl(candidate.getImageUrl());
        }
        if (target.getSourceRefImageUrl() == null) {
            target.setSourceRefImageUrl(candidate.getSourceRefImageUrl());
        }
        if (target.getItemImageUrl() == null) {
            target.setItemImageUrl(candidate.getItemImageUrl());
        }
        if (target.getNpcImageUrl() == null) {
            target.setNpcImageUrl(candidate.getNpcImageUrl());
        }
    }

    private String buildDedupeKey(ItemSourceDTO dto) {
        return String.join("|",
            normalizeText(dto.getSourceType(), ""),
            normalizeText(dto.getSourceRefType(), ""),
            normalizeText(dto.getSourceRefName(), ""),
            normalizeText(dto.getBiomeCode(), ""),
            normalizeText(dto.getQuantityText(), formatQuantityKey(dto.getQuantityMin(), dto.getQuantityMax())),
            normalizeText(dto.getChanceText(), formatChanceKey(dto.getChanceValue())),
            normalizeText(dto.getConditions(), "")
        );
    }

    private String formatQuantityKey(Integer quantityMin, Integer quantityMax) {
        if (quantityMin == null && quantityMax == null) {
            return "";
        }
        return String.format(Locale.ROOT, "%s-%s",
            quantityMin == null ? "" : quantityMin,
            quantityMax == null ? "" : quantityMax
        );
    }

    private String formatChanceKey(BigDecimal chanceValue) {
        return chanceValue == null ? "" : chanceValue.stripTrailingZeros().toPlainString();
    }

    private String cleanSourceRefName(String value) {
        String text = normalizeText(value);
        if (text == null) {
            return null;
        }

        String deduped = text.replaceFirst("^(.+?) \\1(?=\\s|\\(|$)", "$1");
        String withoutTrailingFor = deduped.replaceFirst("\\s+for$", "").trim();
        return withoutTrailingFor.isEmpty() ? deduped : withoutTrailingFor;
    }

    private String normalizeLookupKey(String value) {
        String text = normalizeText(value);
        return text == null ? null : text.toLowerCase(Locale.ROOT);
    }

    private String normalizeText(String value) {
        if (value == null) {
            return null;
        }
        String text = value.trim();
        return text.isEmpty() ? null : text;
    }

    private String normalizeText(String value, String fallback) {
        String text = normalizeText(value);
        return text == null ? fallback : text;
    }

    private record SourceRefMetadata(String nameZh, String imageUrl, String sourceRefType) {
        private static SourceRefMetadata fromItem(Item item) {
            return new SourceRefMetadata(
                normalizeTextValue(item == null ? null : item.getNameZh()),
                normalizeTextValue(item == null ? null : item.getImage()),
                SOURCE_REF_TYPE_ITEM
            );
        }

        private static SourceRefMetadata fromNpc(Npc npc) {
            return new SourceRefMetadata(
                normalizeTextValue(npc == null ? null : npc.getNameZh()),
                normalizeTextValue(npc == null ? null : npc.getImageUrl()),
                SOURCE_REF_TYPE_NPC
            );
        }

        private static String normalizeTextValue(String value) {
            if (value == null) {
                return null;
            }
            String text = value.trim();
            return text.isEmpty() ? null : text;
        }
    }
}

package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.terraria.skills.dto.ItemSourceDTO;
import com.terraria.skills.entity.Biome;
import com.terraria.skills.entity.BiomeResource;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.ItemAcquisitionSource;
import com.terraria.skills.entity.ItemBiome;
import com.terraria.skills.entity.Npc;
import com.terraria.skills.entity.NpcLootEntry;
import com.terraria.skills.entity.NpcShopEntry;
import com.terraria.skills.mapper.BiomeMapper;
import com.terraria.skills.mapper.BiomeResourceMapper;
import com.terraria.skills.mapper.ItemAcquisitionSourceMapper;
import com.terraria.skills.mapper.ItemBiomeMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.mapper.NpcLootEntryMapper;
import com.terraria.skills.mapper.NpcMapper;
import com.terraria.skills.mapper.NpcShopEntryMapper;
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
    private final NpcLootEntryMapper npcLootEntryMapper;
    private final NpcShopEntryMapper npcShopEntryMapper;
    private final BiomeResourceMapper biomeResourceMapper;
    private final ItemBiomeMapper itemBiomeMapper;

    @Override
    public List<ItemSourceDTO> getSourcesByItemId(Long itemId) {
        List<ItemAcquisitionSource> sources = itemAcquisitionSourceMapper.selectList(new LambdaQueryWrapper<ItemAcquisitionSource>()
            .eq(ItemAcquisitionSource::getItemId, itemId)
            .eq(ItemAcquisitionSource::getStatus, 1)
            .orderByAsc(ItemAcquisitionSource::getSortOrder, ItemAcquisitionSource::getId));

        List<ItemSourceDTO> projectedSources = loadProjectedSources(itemId);
        if ((sources == null || sources.isEmpty()) && projectedSources.isEmpty()) {
            return Collections.emptyList();
        }

        List<ItemAcquisitionSource> activeSources = sources == null ? Collections.emptyList() : sources;
        List<Long> biomeIds = activeSources.stream()
            .map(ItemAcquisitionSource::getBiomeId)
            .filter(java.util.Objects::nonNull)
            .distinct()
            .toList();

        Map<Long, Biome> biomeById = biomeIds.isEmpty()
            ? Collections.emptyMap()
            : biomeMapper.selectBatchIds(biomeIds).stream().collect(Collectors.toMap(Biome::getId, Function.identity()));

        Set<String> sourceNames = activeSources.stream()
            .map(ItemAcquisitionSource::getSourceRefName)
            .map(this::cleanSourceRefName)
            .filter(Objects::nonNull)
            .collect(Collectors.toCollection(LinkedHashSet::new));
        Set<String> npcSourceNames = npcBackedSourceNames(activeSources);

        Map<Long, SourceRefMetadata> itemMetadataById = loadItemMetadataById(activeSources);
        Map<Long, SourceRefMetadata> npcMetadataById = loadNpcMetadataById(activeSources);
        Map<String, SourceRefMetadata> itemMetadataByName = loadItemMetadataByName(sourceNames);
        Map<String, SourceRefMetadata> npcMetadataByName = loadNpcMetadataByName(npcSourceNames);

        Map<String, ItemSourceDTO> deduped = new LinkedHashMap<>();

        for (ItemAcquisitionSource source : activeSources) {
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
        for (ItemSourceDTO projectedSource : projectedSources) {
            deduped.putIfAbsent(buildDedupeKey(projectedSource), projectedSource);
        }

        return List.copyOf(deduped.values());
    }

    private List<ItemSourceDTO> loadProjectedSources(Long itemId) {
        ProjectionSourceRows rows = loadProjectionSourceRows(itemId);
        Map<Long, Npc> npcById = loadProjectionNpcs(rows.lootEntries(), rows.shopEntries());
        Map<Long, Biome> biomeById = loadProjectionBiomes(rows.biomeResources(), rows.itemBiomes());
        List<ItemSourceDTO> projected = new java.util.ArrayList<>();
        projected.addAll(projectNpcLootSources(itemId, rows.lootEntries(), npcById));
        projected.addAll(projectNpcShopSources(itemId, rows.shopEntries(), npcById));
        projected.addAll(projectBiomeResourceSources(itemId, rows.biomeResources(), biomeById));
        projected.addAll(projectItemBiomeSources(itemId, rows.itemBiomes(), biomeById));
        return projected;
    }

    private ProjectionSourceRows loadProjectionSourceRows(Long itemId) {
        List<NpcLootEntry> entries = npcLootEntryMapper.selectList(new LambdaQueryWrapper<NpcLootEntry>()
            .eq(NpcLootEntry::getItemId, itemId)
            .eq(NpcLootEntry::getStatus, 1)
            .eq(NpcLootEntry::getDeleted, 0)
            .orderByAsc(NpcLootEntry::getSortOrder, NpcLootEntry::getId));
        List<NpcShopEntry> shopEntries = npcShopEntryMapper.selectList(new LambdaQueryWrapper<NpcShopEntry>()
            .eq(NpcShopEntry::getItemId, itemId)
            .eq(NpcShopEntry::getStatus, 1)
            .eq(NpcShopEntry::getDeleted, 0)
            .orderByAsc(NpcShopEntry::getSortOrder, NpcShopEntry::getId));
        List<BiomeResource> resources = biomeResourceMapper.selectList(new LambdaQueryWrapper<BiomeResource>()
            .eq(BiomeResource::getItemId, itemId)
            .orderByAsc(BiomeResource::getSortOrder, BiomeResource::getId));
        List<ItemBiome> relations = itemBiomeMapper.selectList(new LambdaQueryWrapper<ItemBiome>()
            .eq(ItemBiome::getItemId, itemId)
            .orderByAsc(ItemBiome::getSortOrder, ItemBiome::getId));
        return new ProjectionSourceRows(
            entries == null ? Collections.emptyList() : entries,
            shopEntries == null ? Collections.emptyList() : shopEntries,
            resources == null ? Collections.emptyList() : resources,
            relations == null ? Collections.emptyList() : relations
        );
    }

    private List<ItemSourceDTO> projectNpcLootSources(Long itemId, List<NpcLootEntry> entries, Map<Long, Npc> npcById) {
        if (entries == null || entries.isEmpty()) {
            return Collections.emptyList();
        }
        return entries.stream()
            .map(entry -> toNpcLootProjectedSource(itemId, entry, npcById.get(entry.getNpcId())))
            .toList();
    }

    private ItemSourceDTO toNpcLootProjectedSource(Long itemId, NpcLootEntry entry, Npc npc) {
        ItemSourceDTO dto = new ItemSourceDTO();
        dto.setId(entry.getId());
        dto.setItemId(itemId);
        dto.setEvidenceKind("npc_relation");
        dto.setSourceFactKey("npc_loot:" + entry.getId());
        dto.setLootEntryId(entry.getId());
        dto.setDropSourceKind(entry.getDropSourceKind());
        dto.setSourceType("drop");
        dto.setSourceRefType(Boolean.TRUE.equals(isBossNpc(npc)) ? SOURCE_REF_TYPE_BOSS : SOURCE_REF_TYPE_NPC);
        dto.setSourceRefId(entry.getNpcId());
        dto.setSourceRefName(npc == null ? null : npc.getName());
        dto.setSourceRefNameZh(npc == null ? null : npc.getNameZh());
        dto.setNpcDetailPath(entry.getNpcId() == null ? null : "/npcs/" + entry.getNpcId());
        dto.setImageUrl(npc == null ? null : npc.getImageUrl());
        dto.setSourceRefImageUrl(npc == null ? null : npc.getImageUrl());
        dto.setNpcImageUrl(npc == null ? null : npc.getImageUrl());
        dto.setQuantityMin(entry.getQuantityMin());
        dto.setQuantityMax(entry.getQuantityMax());
        dto.setQuantityText(entry.getQuantityText());
        dto.setChanceValue(entry.getChanceValue());
        dto.setChanceText(entry.getChanceText());
        dto.setConditions(entry.getConditions());
        dto.setNotes(entry.getNotes());
        dto.setSortOrder(entry.getSortOrder());
        return dto;
    }

    private List<ItemSourceDTO> projectNpcShopSources(Long itemId, List<NpcShopEntry> entries, Map<Long, Npc> npcById) {
        if (entries == null || entries.isEmpty()) {
            return Collections.emptyList();
        }
        return entries.stream()
            .map(entry -> toNpcShopProjectedSource(itemId, entry, npcById.get(entry.getNpcId())))
            .toList();
    }

    private ItemSourceDTO toNpcShopProjectedSource(Long itemId, NpcShopEntry entry, Npc npc) {
        ItemSourceDTO dto = new ItemSourceDTO();
        dto.setId(entry.getId());
        dto.setItemId(itemId);
        dto.setEvidenceKind("npc_relation");
        dto.setSourceFactKey("npc_shop:" + entry.getId());
        dto.setShopEntryId(entry.getId());
        dto.setSourceType("shop");
        dto.setSourceRefType(SOURCE_REF_TYPE_NPC);
        dto.setSourceRefId(entry.getNpcId());
        dto.setSourceRefName(npc == null ? null : npc.getName());
        dto.setSourceRefNameZh(npc == null ? null : npc.getNameZh());
        dto.setNpcDetailPath(entry.getNpcId() == null ? null : "/npcs/" + entry.getNpcId());
        dto.setImageUrl(npc == null ? null : npc.getImageUrl());
        dto.setSourceRefImageUrl(npc == null ? null : npc.getImageUrl());
        dto.setNpcImageUrl(npc == null ? null : npc.getImageUrl());
        dto.setConditions(entry.getPriceText());
        dto.setNotes(entry.getNotes());
        dto.setSortOrder(entry.getSortOrder());
        return dto;
    }

    private List<ItemSourceDTO> projectBiomeResourceSources(Long itemId, List<BiomeResource> resources, Map<Long, Biome> biomeById) {
        if (resources == null || resources.isEmpty()) {
            return Collections.emptyList();
        }
        return resources.stream()
            .map(resource -> toBiomeResourceProjectedSource(itemId, resource, biomeById.get(resource.getBiomeId())))
            .toList();
    }

    private ItemSourceDTO toBiomeResourceProjectedSource(Long itemId, BiomeResource resource, Biome biome) {
        ItemSourceDTO dto = baseBiomeProjectedSource(itemId, resource.getBiomeId(), biome);
        dto.setId(resource.getId());
        dto.setEvidenceKind("biome_resource");
        dto.setSourceFactKey("biome_resource:" + resource.getId());
        dto.setSourceType("worldgen");
        dto.setSourceRefType("world");
        dto.setSourceRefName(normalizeText(resource.getResourceNameRaw(), biome == null ? null : biome.getNameEn()));
        dto.setConditions(resource.getResourceType());
        dto.setNotes(resource.getNotes());
        dto.setSortOrder(resource.getSortOrder());
        return dto;
    }

    private List<ItemSourceDTO> projectItemBiomeSources(Long itemId, List<ItemBiome> relations, Map<Long, Biome> biomeById) {
        if (relations == null || relations.isEmpty()) {
            return Collections.emptyList();
        }
        return relations.stream()
            .map(relation -> toItemBiomeProjectedSource(itemId, relation, biomeById.get(relation.getBiomeId())))
            .toList();
    }

    private ItemSourceDTO toItemBiomeProjectedSource(Long itemId, ItemBiome relation, Biome biome) {
        ItemSourceDTO dto = baseBiomeProjectedSource(itemId, relation.getBiomeId(), biome);
        dto.setId(relation.getId());
        dto.setEvidenceKind("item_biome");
        dto.setSourceFactKey("item_biome:" + relation.getId());
        dto.setSourceType("worldgen");
        dto.setSourceRefType("world");
        dto.setSourceRefName(biome == null ? null : biome.getNameEn());
        dto.setConditions(relation.getRelationType());
        dto.setNotes(relation.getNotes());
        dto.setSortOrder(relation.getSortOrder());
        return dto;
    }

    private ItemSourceDTO baseBiomeProjectedSource(Long itemId, Long biomeId, Biome biome) {
        ItemSourceDTO dto = new ItemSourceDTO();
        dto.setItemId(itemId);
        dto.setBiomeId(biomeId);
        dto.setBiomeDetailPath(biomeId == null ? null : "/biomes/" + biomeId);
        if (biome != null) {
            dto.setBiomeCode(biome.getCode());
            dto.setBiomeNameEn(biome.getNameEn());
            dto.setBiomeNameZh(biome.getNameZh());
            dto.setImageUrl(biome.getIconUrl());
            dto.setSourceRefImageUrl(biome.getIconUrl());
        }
        return dto;
    }

    private Map<Long, Npc> loadProjectionNpcs(List<NpcLootEntry> lootEntries, List<NpcShopEntry> shopEntries) {
        Set<Long> npcIds = new LinkedHashSet<>();
        if (lootEntries != null) {
            lootEntries.stream().map(NpcLootEntry::getNpcId).filter(Objects::nonNull).forEach(npcIds::add);
        }
        if (shopEntries != null) {
            shopEntries.stream().map(NpcShopEntry::getNpcId).filter(Objects::nonNull).forEach(npcIds::add);
        }
        if (npcIds.isEmpty()) {
            return Collections.emptyMap();
        }
        return npcMapper.selectList(new QueryWrapper<Npc>()
                .eq("status", 1)
                .eq("deleted", 0)
                .in("id", npcIds))
            .stream()
            .collect(Collectors.toMap(Npc::getId, Function.identity(), (left, right) -> left, LinkedHashMap::new));
    }

    private Map<Long, Biome> loadProjectionBiomes(List<BiomeResource> resources, List<ItemBiome> relations) {
        Set<Long> biomeIds = new LinkedHashSet<>();
        if (resources != null) {
            resources.stream().map(BiomeResource::getBiomeId).filter(Objects::nonNull).forEach(biomeIds::add);
        }
        if (relations != null) {
            relations.stream().map(ItemBiome::getBiomeId).filter(Objects::nonNull).forEach(biomeIds::add);
        }
        if (biomeIds.isEmpty()) {
            return Collections.emptyMap();
        }
        return biomeMapper.selectList(new QueryWrapper<Biome>()
                .eq("status", 1)
                .eq("deleted", 0)
                .in("id", biomeIds))
            .stream()
            .collect(Collectors.toMap(Biome::getId, Function.identity(), (left, right) -> left, LinkedHashMap::new));
    }

    private Boolean isBossNpc(Npc npc) {
        return npc != null && Boolean.TRUE.equals(npc.getIsBoss());
    }

    private record ProjectionSourceRows(
        List<NpcLootEntry> lootEntries,
        List<NpcShopEntry> shopEntries,
        List<BiomeResource> biomeResources,
        List<ItemBiome> itemBiomes
    ) {
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
            normalizeText(dto.getEvidenceKind(), ""),
            normalizeText(dto.getSourceFactKey(), ""),
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

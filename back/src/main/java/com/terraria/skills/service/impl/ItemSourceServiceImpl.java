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

        Map<String, String> itemZhByName = loadItemZhByName(sourceNames);
        Map<String, String> npcZhByName = loadNpcZhByName(sourceNames);

        Map<String, ItemSourceDTO> deduped = new LinkedHashMap<>();

        for (ItemAcquisitionSource source : sources) {
            ItemSourceDTO dto = new ItemSourceDTO();
            BeanUtils.copyProperties(source, dto);

            String cleanedSourceRefName = cleanSourceRefName(source.getSourceRefName());
            dto.setSourceRefName(cleanedSourceRefName);
            dto.setSourceRefNameZh(resolveSourceRefNameZh(cleanedSourceRefName, itemZhByName, npcZhByName));

            Biome biome = biomeById.get(source.getBiomeId());
            if (biome != null) {
                dto.setBiomeCode(biome.getCode());
                dto.setBiomeNameEn(biome.getNameEn());
                dto.setBiomeNameZh(biome.getNameZh());
            }

            String dedupeKey = buildDedupeKey(dto);
            deduped.putIfAbsent(dedupeKey, dto);
        }

        return List.copyOf(deduped.values());
    }

    private Map<String, String> loadItemZhByName(Set<String> sourceNames) {
        if (sourceNames.isEmpty()) {
            return Collections.emptyMap();
        }

        List<Item> items = itemMapper.selectList(
            new LambdaQueryWrapper<Item>()
                .eq(Item::getStatus, 1)
                .and(wrapper -> wrapper.in(Item::getName, sourceNames).or().in(Item::getInternalName, sourceNames))
        );

        Map<String, String> lookup = new LinkedHashMap<>();
        for (Item item : items) {
            String nameZh = normalizeText(item.getNameZh());
            if (nameZh == null) {
                continue;
            }
            putLookup(lookup, item.getName(), nameZh);
            putLookup(lookup, item.getInternalName(), nameZh);
        }
        return lookup;
    }

    private Map<String, String> loadNpcZhByName(Set<String> sourceNames) {
        if (sourceNames.isEmpty()) {
            return Collections.emptyMap();
        }

        List<Npc> npcs = npcMapper.selectList(
            new QueryWrapper<Npc>()
                .eq("status", 1)
                .eq("deleted", 0)
                .and(wrapper -> wrapper.in("name", sourceNames).or().in("internal_name", sourceNames))
        );

        Map<String, String> lookup = new LinkedHashMap<>();
        for (Npc npc : npcs) {
            String nameZh = normalizeText(npc.getNameZh());
            if (nameZh == null) {
                continue;
            }
            putLookup(lookup, npc.getName(), nameZh);
            putLookup(lookup, npc.getInternalName(), nameZh);
        }
        return lookup;
    }

    private String resolveSourceRefNameZh(String cleanedSourceRefName, Map<String, String> itemZhByName, Map<String, String> npcZhByName) {
        String key = normalizeLookupKey(cleanedSourceRefName);
        if (key == null) {
            return null;
        }
        String itemZh = itemZhByName.get(key);
        if (itemZh != null) {
            return itemZh;
        }
        return npcZhByName.get(key);
    }

    private void putLookup(Map<String, String> lookup, String rawKey, String value) {
        String key = normalizeLookupKey(rawKey);
        if (key != null && !lookup.containsKey(key)) {
            lookup.put(key, value);
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
}

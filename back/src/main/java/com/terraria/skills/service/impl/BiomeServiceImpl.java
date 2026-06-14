package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.terraria.skills.dto.BiomeDTO;
import com.terraria.skills.dto.BiomeItemRelationDTO;
import com.terraria.skills.dto.BiomeItemSourceDTO;
import com.terraria.skills.dto.BiomeNpcRelationDTO;
import com.terraria.skills.dto.BiomeRelationDTO;
import com.terraria.skills.dto.BiomeResourceDTO;
import com.terraria.skills.entity.Biome;
import com.terraria.skills.entity.BiomeRelation;
import com.terraria.skills.entity.BiomeResource;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.ItemAcquisitionSource;
import com.terraria.skills.entity.ItemBiome;
import com.terraria.skills.entity.Npc;
import com.terraria.skills.entity.NpcBiome;
import com.terraria.skills.mapper.BiomeMapper;
import com.terraria.skills.mapper.BiomeRelationMapper;
import com.terraria.skills.mapper.BiomeResourceMapper;
import com.terraria.skills.mapper.ItemAcquisitionSourceMapper;
import com.terraria.skills.mapper.ItemBiomeMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.mapper.NpcBiomeMapper;
import com.terraria.skills.mapper.NpcMapper;
import com.terraria.skills.service.BiomeService;
import com.terraria.skills.service.ManagedItemImageResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class BiomeServiceImpl implements BiomeService {

    private final BiomeMapper biomeMapper;
    private final BiomeRelationMapper biomeRelationMapper;
    private final BiomeResourceMapper biomeResourceMapper;
    private final ItemMapper itemMapper;
    private final ItemBiomeMapper itemBiomeMapper;
    private final NpcBiomeMapper npcBiomeMapper;
    private final ItemAcquisitionSourceMapper itemAcquisitionSourceMapper;
    private final NpcMapper npcMapper;
    private final ManagedItemImageResolver managedItemImageResolver;

    @Override
    public List<BiomeDTO> getBiomes() {
        return biomeMapper.selectList(new LambdaQueryWrapper<Biome>()
                .eq(Biome::getStatus, 1)
                .orderByAsc(Biome::getId))
            .stream()
            .map(this::toSummaryDto)
            .toList();
    }

    @Override
    public BiomeDTO getBiomeById(Long id) {
        Biome biome = biomeMapper.selectById(id);
        if (biome == null || !Objects.equals(biome.getDeleted(), 0) || !Objects.equals(biome.getStatus(), 1)) {
            return null;
        }

        BiomeDTO dto = toSummaryDto(biome);
        List<BiomeRelation> relations = biomeRelationMapper.selectList(new LambdaQueryWrapper<BiomeRelation>()
            .eq(BiomeRelation::getBiomeId, id)
            .orderByAsc(BiomeRelation::getId));
        List<BiomeResource> resources = biomeResourceMapper.selectList(new LambdaQueryWrapper<BiomeResource>()
            .eq(BiomeResource::getBiomeId, id)
            .orderByAsc(BiomeResource::getSortOrder, BiomeResource::getId));
        List<ItemBiome> itemBiomes = itemBiomeMapper.selectList(new LambdaQueryWrapper<ItemBiome>()
            .eq(ItemBiome::getBiomeId, id)
            .orderByAsc(ItemBiome::getSortOrder, ItemBiome::getId));
        List<NpcBiome> npcBiomes = npcBiomeMapper.selectList(new LambdaQueryWrapper<NpcBiome>()
            .eq(NpcBiome::getBiomeId, id)
            .eq(NpcBiome::getStatus, 1)
            .eq(NpcBiome::getDeleted, 0)
            .orderByAsc(NpcBiome::getSortOrder, NpcBiome::getId))
            .stream()
            .filter(this::isActiveNpcBiome)
            .toList();
        List<ItemAcquisitionSource> itemSources = itemAcquisitionSourceMapper.selectList(new LambdaQueryWrapper<ItemAcquisitionSource>()
            .eq(ItemAcquisitionSource::getBiomeId, id)
            .eq(ItemAcquisitionSource::getSourceRefType, "biome_wikitext")
            .eq(ItemAcquisitionSource::getStatus, 1)
            .eq(ItemAcquisitionSource::getDeleted, 0)
            .and(wrapper -> wrapper.eq(ItemAcquisitionSource::getSourceProvider, "terraria.wiki.gg")
                .or()
                .isNull(ItemAcquisitionSource::getSourceProvider))
            .orderByAsc(ItemAcquisitionSource::getSortOrder, ItemAcquisitionSource::getId))
            .stream()
            .filter(this::isPublicBiomeItemSource)
            .toList();

        List<Long> relatedBiomeIds = relations.stream()
            .map(BiomeRelation::getRelatedBiomeId)
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        Map<Long, Biome> relatedBiomeById = relatedBiomeIds.isEmpty()
            ? Collections.emptyMap()
            : biomeMapper.selectBatchIds(relatedBiomeIds).stream().collect(Collectors.toMap(Biome::getId, Function.identity()));

        Set<Long> itemIdSet = new LinkedHashSet<>();
        resources.stream().map(BiomeResource::getItemId).filter(Objects::nonNull).forEach(itemIdSet::add);
        itemBiomes.stream().map(ItemBiome::getItemId).filter(Objects::nonNull).forEach(itemIdSet::add);
        itemSources.stream().map(ItemAcquisitionSource::getItemId).filter(Objects::nonNull).forEach(itemIdSet::add);
        List<Long> itemIds = List.copyOf(itemIdSet);
        Map<Long, Item> itemById = itemIds.isEmpty()
            ? Collections.emptyMap()
            : itemMapper.selectBatchIds(itemIds).stream().collect(Collectors.toMap(Item::getId, Function.identity()));
        Map<Long, String> managedImagesByItemId = itemById.isEmpty()
            ? Collections.emptyMap()
            : managedItemImageResolver.resolveManagedImages(itemById.values());
        List<Long> npcIds = npcBiomes.stream()
            .map(NpcBiome::getNpcId)
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        Map<Long, Npc> npcById = npcIds.isEmpty()
            ? Collections.emptyMap()
            : npcMapper.selectList(new QueryWrapper<Npc>()
                .in("id", npcIds)
                .eq("status", 1)
                .eq("deleted", 0))
                .stream()
                .collect(Collectors.toMap(Npc::getId, Function.identity()));

        dto.setRelations(relations.stream().map(relation -> {
            BiomeRelationDTO relationDto = new BiomeRelationDTO();
            BeanUtils.copyProperties(relation, relationDto);
            Biome related = relatedBiomeById.get(relation.getRelatedBiomeId());
            if (related != null) {
                relationDto.setRelatedBiomeCode(related.getCode());
                relationDto.setRelatedBiomeNameEn(related.getNameEn());
                relationDto.setRelatedBiomeNameZh(related.getNameZh());
            }
            return relationDto;
        }).toList());

        dto.setResources(resources.stream().map(resource -> {
            BiomeResourceDTO resourceDto = new BiomeResourceDTO();
            BeanUtils.copyProperties(resource, resourceDto);
            Item item = itemById.get(resource.getItemId());
            if (item != null) {
                resourceDto.setItemName(item.getName());
                resourceDto.setItemInternalName(item.getInternalName());
                resourceDto.setItemImage(managedItemImageResolver.resolveManagedImage(item, managedImagesByItemId));
            }
            return resourceDto;
        }).toList());

        dto.setItemBiomes(itemBiomes.stream().map(itemBiome -> {
            BiomeItemRelationDTO itemBiomeDto = new BiomeItemRelationDTO();
            BeanUtils.copyProperties(itemBiome, itemBiomeDto);
            Item item = itemById.get(itemBiome.getItemId());
            itemBiomeDto.setMissingItem(item == null);
            if (item != null) {
                itemBiomeDto.setItemName(item.getName());
                itemBiomeDto.setItemNameZh(item.getNameZh());
                itemBiomeDto.setItemInternalName(item.getInternalName());
                itemBiomeDto.setItemImage(managedItemImageResolver.resolveManagedImage(item, managedImagesByItemId));
            }
            return itemBiomeDto;
        }).toList());

        dto.setNpcBiomes(npcBiomes.stream().map(npcBiome -> {
            BiomeNpcRelationDTO npcBiomeDto = new BiomeNpcRelationDTO();
            BeanUtils.copyProperties(npcBiome, npcBiomeDto);
            Npc npc = npcById.get(npcBiome.getNpcId());
            npcBiomeDto.setMissingNpc(npc == null);
            if (npc != null) {
                npcBiomeDto.setNpcName(npc.getName());
                npcBiomeDto.setNpcNameZh(npc.getNameZh());
                npcBiomeDto.setNpcInternalName(npc.getInternalName());
                npcBiomeDto.setNpcImageUrl(npc.getImageUrl());
            }
            return npcBiomeDto;
        }).toList());

        dto.setItemSources(itemSources.stream().map(itemSource -> {
            BiomeItemSourceDTO itemSourceDto = new BiomeItemSourceDTO();
            BeanUtils.copyProperties(itemSource, itemSourceDto);
            Item item = itemById.get(itemSource.getItemId());
            itemSourceDto.setMissingItem(item == null);
            if (item != null) {
                itemSourceDto.setItemName(item.getName());
                itemSourceDto.setItemNameZh(item.getNameZh());
                itemSourceDto.setItemInternalName(item.getInternalName());
                itemSourceDto.setItemImage(managedItemImageResolver.resolveManagedImage(item, managedImagesByItemId));
            }
            return itemSourceDto;
        }).toList());

        return dto;
    }

    private boolean isActiveNpcBiome(NpcBiome npcBiome) {
        return Objects.equals(npcBiome.getStatus(), 1) && Objects.equals(npcBiome.getDeleted(), 0);
    }

    private boolean isPublicBiomeItemSource(ItemAcquisitionSource itemSource) {
        return Objects.equals(itemSource.getSourceRefType(), "biome_wikitext")
            && Objects.equals(itemSource.getStatus(), 1)
            && Objects.equals(itemSource.getDeleted(), 0)
            && (itemSource.getSourceProvider() == null || Objects.equals(itemSource.getSourceProvider(), "terraria.wiki.gg"));
    }

    private BiomeDTO toSummaryDto(Biome biome) {
        BiomeDTO dto = new BiomeDTO();
        BeanUtils.copyProperties(biome, dto);
        return dto;
    }
}

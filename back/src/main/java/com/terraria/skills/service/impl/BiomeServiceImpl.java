package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.terraria.skills.dto.BiomeDTO;
import com.terraria.skills.dto.BiomeRelationDTO;
import com.terraria.skills.dto.BiomeResourceDTO;
import com.terraria.skills.entity.Biome;
import com.terraria.skills.entity.BiomeRelation;
import com.terraria.skills.entity.BiomeResource;
import com.terraria.skills.entity.Item;
import com.terraria.skills.mapper.BiomeMapper;
import com.terraria.skills.mapper.BiomeRelationMapper;
import com.terraria.skills.mapper.BiomeResourceMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.BiomeService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class BiomeServiceImpl implements BiomeService {

    private final BiomeMapper biomeMapper;
    private final BiomeRelationMapper biomeRelationMapper;
    private final BiomeResourceMapper biomeResourceMapper;
    private final ItemMapper itemMapper;

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

        List<Long> relatedBiomeIds = relations.stream()
            .map(BiomeRelation::getRelatedBiomeId)
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        Map<Long, Biome> relatedBiomeById = relatedBiomeIds.isEmpty()
            ? Collections.emptyMap()
            : biomeMapper.selectBatchIds(relatedBiomeIds).stream().collect(Collectors.toMap(Biome::getId, Function.identity()));

        List<Long> itemIds = resources.stream()
            .map(BiomeResource::getItemId)
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        Map<Long, Item> itemById = itemIds.isEmpty()
            ? Collections.emptyMap()
            : itemMapper.selectBatchIds(itemIds).stream().collect(Collectors.toMap(Item::getId, Function.identity()));

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
                resourceDto.setItemImage(item.getImage());
            }
            return resourceDto;
        }).toList());

        return dto;
    }

    private BiomeDTO toSummaryDto(Biome biome) {
        BiomeDTO dto = new BiomeDTO();
        BeanUtils.copyProperties(biome, dto);
        return dto;
    }
}

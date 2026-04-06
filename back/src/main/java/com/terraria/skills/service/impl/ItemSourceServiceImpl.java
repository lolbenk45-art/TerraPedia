package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.terraria.skills.dto.ItemSourceDTO;
import com.terraria.skills.entity.Biome;
import com.terraria.skills.entity.ItemAcquisitionSource;
import com.terraria.skills.mapper.BiomeMapper;
import com.terraria.skills.mapper.ItemAcquisitionSourceMapper;
import com.terraria.skills.service.ItemSourceService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ItemSourceServiceImpl implements ItemSourceService {

    private final ItemAcquisitionSourceMapper itemAcquisitionSourceMapper;
    private final BiomeMapper biomeMapper;

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

        return sources.stream().map(source -> {
            ItemSourceDTO dto = new ItemSourceDTO();
            BeanUtils.copyProperties(source, dto);
            Biome biome = biomeById.get(source.getBiomeId());
            if (biome != null) {
                dto.setBiomeCode(biome.getCode());
                dto.setBiomeNameEn(biome.getNameEn());
                dto.setBiomeNameZh(biome.getNameZh());
            }
            return dto;
        }).toList();
    }
}

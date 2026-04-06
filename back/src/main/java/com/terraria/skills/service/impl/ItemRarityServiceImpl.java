package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.terraria.skills.dto.ItemRarityDTO;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.ItemRarity;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.mapper.ItemRarityMapper;
import com.terraria.skills.service.ItemRarityService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ItemRarityServiceImpl implements ItemRarityService {

    private final ItemRarityMapper itemRarityMapper;
    private final ItemMapper itemMapper;

    @Override
    public List<ItemRarityDTO> getAll() {
        return itemRarityMapper.selectList(
                new LambdaQueryWrapper<ItemRarity>()
                    .eq(ItemRarity::getDeleted, 0)
                    .orderByAsc(ItemRarity::getSortOrder, ItemRarity::getId)
            ).stream()
            .map(this::toDtoWithCount)
            .toList();
    }

    @Override
    public ItemRarityDTO getById(Long id) {
        ItemRarity entity = itemRarityMapper.selectById(id);
        if (entity == null || Integer.valueOf(1).equals(entity.getDeleted())) {
            return null;
        }
        return toDtoWithCount(entity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ItemRarityDTO create(ItemRarityDTO dto) {
        validate(dto, true);
        if (itemRarityMapper.selectById(dto.getId()) != null) {
            throw new IllegalArgumentException("品质ID已存在");
        }
        ensureUniqueCode(dto.getCode(), null);

        ItemRarity entity = new ItemRarity();
        BeanUtils.copyProperties(dto, entity);
        entity.setDeleted(0);
        entity.setStatus(dto.getStatus() == null ? 1 : dto.getStatus());
        entity.setSortOrder(dto.getSortOrder() == null ? 999 : dto.getSortOrder());
        entity.setCreatedAt(LocalDateTime.now());
        entity.setUpdatedAt(LocalDateTime.now());
        itemRarityMapper.insert(entity);
        return toDtoWithCount(entity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ItemRarityDTO update(Long id, ItemRarityDTO dto) {
        validate(dto, false);
        ItemRarity entity = itemRarityMapper.selectById(id);
        if (entity == null || Integer.valueOf(1).equals(entity.getDeleted())) {
            throw new IllegalArgumentException("品质不存在");
        }
        if (dto.getCode() != null) {
            ensureUniqueCode(dto.getCode(), id);
            entity.setCode(dto.getCode().trim());
        }
        if (dto.getDisplayNameZh() != null) entity.setDisplayNameZh(dto.getDisplayNameZh().trim());
        if (dto.getDisplayNameEn() != null) entity.setDisplayNameEn(dto.getDisplayNameEn().trim());
        if (dto.getSortOrder() != null) entity.setSortOrder(dto.getSortOrder());
        if (dto.getStatus() != null) entity.setStatus(dto.getStatus());
        entity.setUpdatedAt(LocalDateTime.now());
        itemRarityMapper.updateById(entity);
        return toDtoWithCount(entity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id) {
        ItemRarity entity = itemRarityMapper.selectById(id);
        if (entity == null || Integer.valueOf(1).equals(entity.getDeleted())) {
            throw new IllegalArgumentException("品质不存在");
        }
        long itemCount = countItems(id);
        if (itemCount > 0) {
            throw new IllegalArgumentException("该品质仍被物品使用，无法删除");
        }
        itemRarityMapper.deleteById(id);
    }

    private void validate(ItemRarityDTO dto, boolean requireId) {
        if (dto == null) {
            throw new IllegalArgumentException("请求体不能为空");
        }
        if (requireId && dto.getId() == null) {
            throw new IllegalArgumentException("品质ID不能为空");
        }
        if (dto.getCode() == null || dto.getCode().trim().isBlank()) {
            throw new IllegalArgumentException("品质编码不能为空");
        }
        if (dto.getDisplayNameZh() == null || dto.getDisplayNameZh().trim().isBlank()) {
            throw new IllegalArgumentException("中文名称不能为空");
        }
        if (dto.getDisplayNameEn() == null || dto.getDisplayNameEn().trim().isBlank()) {
            throw new IllegalArgumentException("英文名称不能为空");
        }
    }

    private void ensureUniqueCode(String code, Long excludeId) {
        ItemRarity existing = itemRarityMapper.selectOne(
            new LambdaQueryWrapper<ItemRarity>()
                .eq(ItemRarity::getCode, code.trim())
                .eq(ItemRarity::getDeleted, 0)
                .ne(excludeId != null, ItemRarity::getId, excludeId)
                .last("LIMIT 1")
        );
        if (existing != null) {
            throw new IllegalArgumentException("品质编码已存在");
        }
    }

    private long countItems(Long rarityId) {
        return itemMapper.selectCount(
            new LambdaQueryWrapper<Item>()
                .eq(Item::getRarityId, rarityId)
                .eq(Item::getDeleted, 0)
        );
    }

    private ItemRarityDTO toDtoWithCount(ItemRarity entity) {
        ItemRarityDTO dto = new ItemRarityDTO();
        BeanUtils.copyProperties(entity, dto);
        dto.setItemCount(countItems(entity.getId()));
        return dto;
    }
}

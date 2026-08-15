package com.terraria.skills.service;

import com.terraria.skills.dto.ItemRarityDTO;

import java.util.List;

public interface ItemRarityService {

    List<ItemRarityDTO> getAll();

    ItemRarityDTO getById(Long id);

    ItemRarityDTO create(ItemRarityDTO dto);

    ItemRarityDTO update(Long id, ItemRarityDTO dto);

    void delete(Long id);
}

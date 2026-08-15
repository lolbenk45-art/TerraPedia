package com.terraria.skills.service;

import com.terraria.skills.dto.ItemSourceDTO;

import java.util.List;

public interface ItemSourceService {

    List<ItemSourceDTO> getSourcesByItemId(Long itemId);
}

package com.terraria.skills.service;

import com.terraria.skills.dto.ItemImageDTO;

import java.util.List;

public interface ItemImageService {

    List<ItemImageDTO> getImagesByItemId(Long itemId);
}

package com.terraria.skills.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.common.PageQuery;
import com.terraria.skills.dto.PublicItemArmorAttributeDTO;
import com.terraria.skills.dto.PublicItemBuffEffectDTO;
import com.terraria.skills.dto.PublicItemDetailDTO;
import com.terraria.skills.dto.PublicItemEquipmentEffectDTO;
import com.terraria.skills.dto.PublicItemListDTO;
import com.terraria.skills.dto.PublicItemSuggestionDTO;

import java.util.List;

public interface PublicItemService {

    Page<PublicItemListDTO> getPublicItems(PageQuery pageQuery);

    PublicItemDetailDTO getPublicItemById(Long id);

    List<PublicItemSuggestionDTO> searchSuggestions(String keyword, int limit);

    List<PublicItemBuffEffectDTO> getPublicItemBuffEffects(Long id);

    List<PublicItemArmorAttributeDTO> getPublicItemArmorAttributes(Long id);

    List<PublicItemEquipmentEffectDTO> getPublicItemEquipmentEffects(Long id);
}

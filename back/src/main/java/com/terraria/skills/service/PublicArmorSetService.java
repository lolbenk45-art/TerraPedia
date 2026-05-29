package com.terraria.skills.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.PublicArmorSetListDTO;
import com.terraria.skills.dto.PublicArmorSetQuery;

public interface PublicArmorSetService {

    Page<PublicArmorSetListDTO> getPublicArmorSets(PublicArmorSetQuery query);

    PublicArmorSetListDTO getPublicArmorSetById(Long id);
}

package com.terraria.skills.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.PublicBossDetailDTO;
import com.terraria.skills.dto.PublicBossListDTO;
import com.terraria.skills.dto.PublicBossQuery;

public interface PublicBossService {

    Page<PublicBossListDTO> getPublicBosses(PublicBossQuery query);

    PublicBossDetailDTO getPublicBossById(Long id);
}

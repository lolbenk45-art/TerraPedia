package com.terraria.skills.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.PublicProjectileListDTO;
import com.terraria.skills.dto.PublicProjectileQuery;

public interface PublicProjectileService {

    Page<PublicProjectileListDTO> getPublicProjectiles(PublicProjectileQuery query);
}

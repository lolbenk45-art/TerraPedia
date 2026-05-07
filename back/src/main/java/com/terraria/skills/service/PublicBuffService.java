package com.terraria.skills.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.PublicBuffListDTO;
import com.terraria.skills.dto.PublicBuffQuery;

public interface PublicBuffService {

    Page<PublicBuffListDTO> getPublicBuffs(PublicBuffQuery query);
}

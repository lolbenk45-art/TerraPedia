package com.terraria.skills.service;

import com.terraria.skills.dto.BiomeDTO;

import java.util.List;

public interface BiomeService {

    List<BiomeDTO> getBiomes();

    BiomeDTO getBiomeById(Long id);
}

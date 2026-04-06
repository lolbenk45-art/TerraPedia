package com.terraria.skills.service;

import com.terraria.skills.dto.ItemImportRequestDTO;
import com.terraria.skills.dto.ItemImportResultDTO;

public interface ItemImportService {

    ItemImportResultDTO importItems(ItemImportRequestDTO request);
}

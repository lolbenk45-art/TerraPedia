package com.terraria.skills.service;

import com.terraria.skills.dto.AdminWikiImageSyncRequestDTO;
import com.terraria.skills.dto.AdminWikiImageSyncResultDTO;

public interface WikiImageSyncService {

    AdminWikiImageSyncResultDTO syncWikiImages(AdminWikiImageSyncRequestDTO request);
}

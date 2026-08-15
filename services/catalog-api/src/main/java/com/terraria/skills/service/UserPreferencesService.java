package com.terraria.skills.service;

import com.terraria.skills.dto.UserPreferencesDTO;
import com.terraria.skills.dto.UserPreferencesRequestDTO;

public interface UserPreferencesService {

    UserPreferencesDTO getPreferences(Long userId);

    UserPreferencesDTO updatePreferences(Long userId, UserPreferencesRequestDTO request);
}

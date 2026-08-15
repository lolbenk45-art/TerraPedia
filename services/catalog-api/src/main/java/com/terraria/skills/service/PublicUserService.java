package com.terraria.skills.service;

import com.terraria.skills.dto.PublicUserProfileDTO;

public interface PublicUserService {

    PublicUserProfileDTO getPublicProfile(Long userId, int page, int limit);
}

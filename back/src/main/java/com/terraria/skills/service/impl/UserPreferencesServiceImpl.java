package com.terraria.skills.service.impl;

import com.terraria.skills.dto.UserPreferencesDTO;
import com.terraria.skills.dto.UserPreferencesRequestDTO;
import com.terraria.skills.entity.User;
import com.terraria.skills.mapper.UserMapper;
import com.terraria.skills.service.UserPreferencesService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Set;

@Service
@RequiredArgsConstructor
public class UserPreferencesServiceImpl implements UserPreferencesService {

    private static final String DEFAULT_THEME = "dark";
    private static final String DEFAULT_DENSITY = "readable";
    private static final String DEFAULT_FAVORITES_FILTER = "all";
    private static final Set<String> THEMES = Set.of("dark", "morning-paper", "warm-slate");
    private static final Set<String> DENSITIES = Set.of("readable", "compact");
    private static final Set<String> FAVORITES_FILTERS = Set.of("all", "items", "articles");

    private final UserMapper userMapper;

    @Override
    public UserPreferencesDTO getPreferences(Long userId) {
        return toDto(requireActiveUser(userId));
    }

    @Override
    public UserPreferencesDTO updatePreferences(Long userId, UserPreferencesRequestDTO request) {
        User user = requireActiveUser(userId);
        String theme = normalizeChoice(request.getThemePreference(), THEMES, valueOrDefault(user.getThemePreference(), DEFAULT_THEME), "themePreference");
        String density = normalizeChoice(request.getDetailDensity(), DENSITIES, valueOrDefault(user.getDetailDensity(), DEFAULT_DENSITY), "detailDensity");
        String favoritesFilter = normalizeChoice(request.getDefaultFavoritesFilter(), FAVORITES_FILTERS, valueOrDefault(user.getDefaultFavoritesFilter(), DEFAULT_FAVORITES_FILTER), "defaultFavoritesFilter");
        userMapper.updatePreferences(user.getId(), theme, density, favoritesFilter);
        user.setThemePreference(theme);
        user.setDetailDensity(density);
        user.setDefaultFavoritesFilter(favoritesFilter);
        return toDto(user);
    }

    private UserPreferencesDTO toDto(User user) {
        return UserPreferencesDTO.builder()
            .themePreference(valueOrDefault(user.getThemePreference(), DEFAULT_THEME))
            .detailDensity(valueOrDefault(user.getDetailDensity(), DEFAULT_DENSITY))
            .defaultFavoritesFilter(valueOrDefault(user.getDefaultFavoritesFilter(), DEFAULT_FAVORITES_FILTER))
            .build();
    }

    private User requireActiveUser(Long userId) {
        if (userId == null || userId <= 0) {
            throw new IllegalArgumentException("Invalid user id");
        }
        User user = userMapper.selectById(userId);
        if (user == null || user.getDeleted() != null && user.getDeleted() == 1) {
            throw new IllegalArgumentException("User not found");
        }
        if (!Integer.valueOf(1).equals(user.getStatus())) {
            throw new IllegalArgumentException("Account is disabled");
        }
        return user;
    }

    private String normalizeChoice(String value, Set<String> allowed, String fallback, String label) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        String normalized = value.trim();
        if (!allowed.contains(normalized)) {
            throw new IllegalArgumentException("Unsupported " + label);
        }
        return normalized;
    }

    private String valueOrDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}

package com.terraria.skills.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UserPreferencesRequestDTO {
    @Size(max = 40, message = "themePreference must be within 40 characters")
    private String themePreference;

    @Size(max = 40, message = "detailDensity must be within 40 characters")
    private String detailDensity;

    @Size(max = 40, message = "defaultFavoritesFilter must be within 40 characters")
    private String defaultFavoritesFilter;
}

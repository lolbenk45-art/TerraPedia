package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.auth.UserAuthenticationInterceptor;
import com.terraria.skills.auth.UserTokenClaims;
import com.terraria.skills.dto.UserPreferencesDTO;
import com.terraria.skills.dto.UserPreferencesRequestDTO;
import com.terraria.skills.handler.GlobalExceptionHandler;
import com.terraria.skills.service.UserPreferencesService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class UserPreferencesControllerTest {

    private final UserPreferencesService userPreferencesService = mock(UserPreferencesService.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new UserPreferencesController(userPreferencesService))
            .setControllerAdvice(new GlobalExceptionHandler())
            .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
            .build();
    }

    @Test
    void shouldGetPreferencesForCurrentClaimsUserOnly() throws Exception {
        when(userPreferencesService.getPreferences(42L)).thenReturn(preferences());

        mockMvc.perform(get("/user/preferences")
                .param("userId", "43")
                .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, claims(42L)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.themePreference").value("warm-slate"));

        verify(userPreferencesService).getPreferences(42L);
    }

    @Test
    void shouldPatchPreferencesForCurrentClaimsUserOnly() throws Exception {
        when(userPreferencesService.updatePreferences(eq(42L), any(UserPreferencesRequestDTO.class))).thenReturn(preferences());

        mockMvc.perform(patch("/user/preferences")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "themePreference": "warm-slate",
                      "detailDensity": "compact",
                      "defaultFavoritesFilter": "articles"
                    }
                    """)
                .param("userId", "43")
                .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, claims(42L)))
            .andExpect(status().isOk());

        ArgumentCaptor<Long> userIdCaptor = ArgumentCaptor.forClass(Long.class);
        verify(userPreferencesService).updatePreferences(userIdCaptor.capture(), any(UserPreferencesRequestDTO.class));
        assertEquals(42L, userIdCaptor.getValue());
    }

    private static UserPreferencesDTO preferences() {
        return UserPreferencesDTO.builder()
            .themePreference("warm-slate")
            .detailDensity("compact")
            .defaultFavoritesFilter("articles")
            .build();
    }

    private static UserTokenClaims claims(Long userId) {
        return UserTokenClaims.builder()
            .userId(userId)
            .email("user@example.com")
            .build();
    }
}

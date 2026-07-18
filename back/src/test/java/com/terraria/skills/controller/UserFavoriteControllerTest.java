package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.auth.UserAuthenticationInterceptor;
import com.terraria.skills.auth.UserTokenClaims;
import com.terraria.skills.dto.UserFavoriteStatusDTO;
import com.terraria.skills.security.ClientIpResolver;
import com.terraria.skills.service.UserFavoriteService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class UserFavoriteControllerTest {

    private final UserFavoriteService userFavoriteService = mock(UserFavoriteService.class);
    private final ClientIpResolver clientIpResolver = mock(ClientIpResolver.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        when(clientIpResolver.resolve(org.mockito.ArgumentMatchers.any())).thenReturn("203.0.113.9");
        mockMvc = MockMvcBuilders.standaloneSetup(new UserFavoriteController(userFavoriteService, clientIpResolver))
            .setMessageConverters(new org.springframework.http.converter.json.MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldFavoriteItemForCurrentClaimsUserOnly() throws Exception {
        UserFavoriteStatusDTO status = UserFavoriteStatusDTO.builder()
            .targetType("ITEM")
            .targetId(77L)
            .favorited(true)
            .build();
        when(userFavoriteService.favoriteItem(eq(42L), eq(77L), anyString())).thenReturn(status);

        mockMvc.perform(put("/user/favorites/items/77")
                .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, UserTokenClaims.builder()
                    .userId(42L)
                    .email("user@example.com")
                    .build()))
            .andExpect(status().isOk());

        ArgumentCaptor<Long> userIdCaptor = ArgumentCaptor.forClass(Long.class);
        verify(userFavoriteService).favoriteItem(userIdCaptor.capture(), eq(77L), anyString());
        assertEquals(42L, userIdCaptor.getValue());
    }
}

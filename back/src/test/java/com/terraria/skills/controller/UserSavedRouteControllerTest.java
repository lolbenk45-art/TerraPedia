package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.auth.UserAuthenticationInterceptor;
import com.terraria.skills.auth.UserTokenClaims;
import com.terraria.skills.dto.UserSavedRouteDTO;
import com.terraria.skills.dto.UserSavedRouteRequestDTO;
import com.terraria.skills.handler.GlobalExceptionHandler;
import com.terraria.skills.security.ClientIpResolver;
import com.terraria.skills.service.UserSavedRouteService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class UserSavedRouteControllerTest {

    private final UserSavedRouteService userSavedRouteService = mock(UserSavedRouteService.class);
    private final ClientIpResolver clientIpResolver = mock(ClientIpResolver.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        when(clientIpResolver.resolve(org.mockito.ArgumentMatchers.any())).thenReturn("203.0.113.9");
        mockMvc = MockMvcBuilders.standaloneSetup(new UserSavedRouteController(userSavedRouteService, clientIpResolver))
            .setControllerAdvice(new GlobalExceptionHandler())
            .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
            .build();
    }

    @Test
    void shouldSaveRouteForCurrentClaimsUserOnly() throws Exception {
        when(userSavedRouteService.saveRoute(eq(42L), any(UserSavedRouteRequestDTO.class), eq("203.0.113.9")))
            .thenReturn(route(7L, 88L, "真永夜刃"));

        mockMvc.perform(post("/user/saved-routes")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "targetType": "CRAFTING_ITEM",
                      "targetId": 88,
                      "title": "真永夜刃",
                      "routeMode": "crafting",
                      "maxDepth": 5,
                      "url": "/crafting?itemId=88&maxDepth=5",
                      "snapshotJson": "{}"
                    }
                    """)
                .param("userId", "43")
                .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, claims(42L)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.targetId").value(88));

        ArgumentCaptor<Long> userIdCaptor = ArgumentCaptor.forClass(Long.class);
        verify(userSavedRouteService).saveRoute(userIdCaptor.capture(), any(UserSavedRouteRequestDTO.class), eq("203.0.113.9"));
        verify(clientIpResolver).resolve(org.mockito.ArgumentMatchers.any());
        assertEquals(42L, userIdCaptor.getValue());
    }

    @Test
    void shouldListRoutesWithPaginationForCurrentClaimsUserOnly() throws Exception {
        Page<UserSavedRouteDTO> page = new Page<>(1, 20);
        page.setTotal(1);
        page.setRecords(List.of(route(7L, 88L, "真永夜刃")));
        when(userSavedRouteService.getRoutes(42L, 1, 20)).thenReturn(page);

        mockMvc.perform(get("/user/saved-routes")
                .param("userId", "43")
                .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, claims(42L)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.pagination.total").value(1))
            .andExpect(jsonPath("$.data[0].title").value("真永夜刃"));

        verify(userSavedRouteService).getRoutes(42L, 1, 20);
    }

    @Test
    void shouldDeleteOnlyCurrentUsersRoute() throws Exception {
        when(userSavedRouteService.removeRoute(eq(42L), eq(7L), anyString()))
            .thenReturn(route(7L, 88L, "真永夜刃"));

        mockMvc.perform(delete("/user/saved-routes/7")
                .param("userId", "43")
                .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, claims(42L)))
            .andExpect(status().isOk());

        verify(userSavedRouteService).removeRoute(eq(42L), eq(7L), anyString());
    }

    private static UserSavedRouteDTO route(Long id, Long targetId, String title) {
        return UserSavedRouteDTO.builder()
            .id(id)
            .targetType("CRAFTING_ITEM")
            .targetId(targetId)
            .title(title)
            .routeMode("crafting")
            .maxDepth(5)
            .url("/crafting?itemId=" + targetId + "&maxDepth=5")
            .build();
    }

    private static UserTokenClaims claims(Long userId) {
        return UserTokenClaims.builder()
            .userId(userId)
            .email("user@example.com")
            .build();
    }
}

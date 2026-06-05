package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.terraria.skills.dto.PublicUserArticleDTO;
import com.terraria.skills.dto.PublicUserProfileDTO;
import com.terraria.skills.service.PublicUserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PublicUserControllerTest {

    private final PublicUserService publicUserService = mock(PublicUserService.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        ObjectMapper objectMapper = new ObjectMapper()
            .findAndRegisterModules()
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        mockMvc = MockMvcBuilders.standaloneSetup(new PublicUserController(publicUserService))
            .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
            .build();
    }

    @Test
    void shouldExposePublicUserProfileWithoutPrivateAccountFields() throws Exception {
        PublicUserArticleDTO article = PublicUserArticleDTO.builder()
            .id(7L)
            .title("Boss route notes")
            .slug("boss-route-notes")
            .summary("Published route article")
            .authorId(42L)
            .authorDisplayName("Guide Writer")
            .authorAvatarUrl("/api/files/objects/avatars/42/avatar.png")
            .viewCount(18L)
            .favoriteCount(5L)
            .publishedAt(LocalDateTime.of(2026, 6, 1, 12, 0))
            .build();

        PublicUserProfileDTO profile = PublicUserProfileDTO.builder()
            .id(42L)
            .displayName("Guide Writer")
            .avatarUrl("http://127.0.0.1:9000/avatars/42/avatar.png")
            .joinedAt(LocalDateTime.of(2026, 5, 10, 9, 30))
            .publishedArticleCount(3L)
            .publishedArticles(List.of(article))
            .build();

        when(publicUserService.getPublicProfile(42L, 1, 6)).thenReturn(profile);

        mockMvc.perform(get("/users/42").param("page", "1").param("limit", "6"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.id").value(42))
            .andExpect(jsonPath("$.data.displayName").value("Guide Writer"))
            .andExpect(jsonPath("$.data.avatarUrl").value("http://127.0.0.1:9000/avatars/42/avatar.png"))
            .andExpect(jsonPath("$.data.joinedAt").value("2026-05-10T09:30:00"))
            .andExpect(jsonPath("$.data.publishedArticleCount").value(3))
            .andExpect(jsonPath("$.data.publishedArticles[0].id").value(7))
            .andExpect(jsonPath("$.data.publishedArticles[0].slug").value("boss-route-notes"))
            .andExpect(jsonPath("$.data.publishedArticles[0].authorAvatarUrl").value("/api/files/objects/avatars/42/avatar.png"))
            .andExpect(jsonPath("$.data.publishedArticles[0].viewCount").value(18))
            .andExpect(jsonPath("$.data.publishedArticles[0].favoriteCount").value(5))
            .andExpect(jsonPath("$.data.publishedArticles[0].reviewStatus").doesNotExist())
            .andExpect(jsonPath("$.data.publishedArticles[0].reviewComment").doesNotExist())
            .andExpect(jsonPath("$.data.publishedArticles[0].contentHtml").doesNotExist())
            .andExpect(jsonPath("$.data.email").doesNotExist())
            .andExpect(jsonPath("$.data.passwordHash").doesNotExist())
            .andExpect(jsonPath("$.data.roles").doesNotExist())
            .andExpect(jsonPath("$.data.token").doesNotExist())
            .andExpect(jsonPath("$.data.deleted").doesNotExist())
            .andExpect(jsonPath("$.data.avatarObjectKey").doesNotExist());
    }

    @Test
    void shouldRejectInvalidPublicUserId() throws Exception {
        mockMvc.perform(get("/users/0"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.message").value("Invalid user id"));
    }
}

package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.entity.Projectile;
import com.terraria.skills.mapper.ProjectileMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AdminProjectileControllerTest {

    @Mock
    private ProjectileMapper projectileMapper;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        ObjectMapper objectMapper = new ObjectMapper();
        AdminProjectileController controller = new AdminProjectileController(projectileMapper, objectMapper);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
            .build();
    }

    @Test
    void shouldPreferWikiImageUrlColumnOverRawJsonImageName() throws Exception {
        Projectile projectile = new Projectile();
        projectile.setId(1L);
        projectile.setSourceId(1);
        projectile.setInternalName("WoodenArrowFriendly");
        projectile.setName("Wooden Arrow (friendly)");
        projectile.setImageUrl("https://terraria.wiki.gg/images/Wooden%20Arrow.png");
        projectile.setRawJson("{\"image\":\"Wooden Arrow.png\"}");
        projectile.setStatus(1);

        when(projectileMapper.selectById(1L)).thenReturn(projectile);

        mockMvc.perform(get("/admin/projectiles/1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.imageUrl").value("https://terraria.wiki.gg/images/Wooden%20Arrow.png"));
    }
}

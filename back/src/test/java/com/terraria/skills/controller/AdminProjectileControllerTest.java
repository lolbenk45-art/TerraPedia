package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.entity.Projectile;
import com.terraria.skills.mapper.ProjectileMapper;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AdminProjectileControllerTest {

    private static final ManagedImageUrlPolicy MANAGED_IMAGE_URL_POLICY = new ManagedImageUrlPolicy() {
        @Override
        public boolean isManagedImageUrl(String value) {
            return value != null && value.startsWith("http://localhost:9000/terrapedia-images/");
        }

        @Override
        public List<String> trustedManagedImageUrlPrefixes() {
            return List.of("http://localhost:9000/terrapedia-images/");
        }
    };

    @Mock
    private ProjectileMapper projectileMapper;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        ObjectMapper objectMapper = new ObjectMapper();
        AdminProjectileController controller = new AdminProjectileController(projectileMapper, objectMapper, MANAGED_IMAGE_URL_POLICY);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
            .build();
    }

    @Test
    void shouldReturnProjectileSourceJsonAndParsedSourcesInListPayload() throws Exception {
        Projectile projectile = new Projectile();
        projectile.setId(1L);
        projectile.setSourceId(1);
        projectile.setInternalName("WoodenArrowFriendly");
        projectile.setName("Wooden Arrow (friendly)");
        projectile.setSourceItemsJson("[{\"internalName\":\"WoodenArrow\",\"itemId\":40}]");
        projectile.setSourceNpcsJson("[{\"internalName\":\"Zombie\",\"npcId\":3}]");
        projectile.setStatus(1);

        Page<Projectile> page = new Page<>(1, 20);
        page.setTotal(1);
        page.setRecords(List.of(projectile));

        when(projectileMapper.selectPage(any(Page.class), any())).thenReturn(page);

        mockMvc.perform(get("/admin/projectiles").param("page", "1").param("limit", "20"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].sourceItemsJson").value("[{\"internalName\":\"WoodenArrow\",\"itemId\":40}]"))
            .andExpect(jsonPath("$.data[0].sourceNpcsJson").value("[{\"internalName\":\"Zombie\",\"npcId\":3}]"))
            .andExpect(jsonPath("$.data[0].sourceItems[0].internalName").value("WoodenArrow"))
            .andExpect(jsonPath("$.data[0].sourceItems[0].itemId").value(40))
            .andExpect(jsonPath("$.data[0].sourceNpcs[0].internalName").value("Zombie"))
            .andExpect(jsonPath("$.data[0].sourceNpcs[0].npcId").value(3));
    }

    @Test
    void shouldSuppressWikiImageUrlColumnInDisplayPayload() throws Exception {
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
            .andExpect(jsonPath("$.data.imageUrl").doesNotExist());
    }

    @Test
    void shouldPreserveManagedProjectileImageUrlInDisplayPayload() throws Exception {
        String managedImageUrl = "http://localhost:9000/terrapedia-images/items/wiki/projectiles/wooden-arrow.png";
        Projectile projectile = new Projectile();
        projectile.setId(1L);
        projectile.setSourceId(1);
        projectile.setInternalName("WoodenArrowFriendly");
        projectile.setName("Wooden Arrow (friendly)");
        projectile.setImageUrl(managedImageUrl);
        projectile.setRawJson("{\"imageUrl\":\"https://terraria.wiki.gg/images/Wooden%20Arrow.png\"}");
        projectile.setStatus(1);

        when(projectileMapper.selectById(1L)).thenReturn(projectile);

        mockMvc.perform(get("/admin/projectiles/1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.imageUrl").value(managedImageUrl));
    }

    @Test
    void shouldFilterRawJsonProjectileImageUrlInDisplayPayload() throws Exception {
        String managedImageUrl = "http://localhost:9000/terrapedia-images/items/wiki/projectiles/wooden-arrow.png";
        Projectile projectile = new Projectile();
        projectile.setId(1L);
        projectile.setSourceId(1);
        projectile.setInternalName("WoodenArrowFriendly");
        projectile.setName("Wooden Arrow (friendly)");
        projectile.setRawJson("{\"imageUrl\":\"" + managedImageUrl + "\"}");
        projectile.setStatus(1);

        when(projectileMapper.selectById(1L)).thenReturn(projectile);

        mockMvc.perform(get("/admin/projectiles/1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.imageUrl").value(managedImageUrl));
    }

    @Test
    void shouldReturnProjectileSourceJsonAndParsedSources() throws Exception {
        Projectile projectile = new Projectile();
        projectile.setId(1L);
        projectile.setSourceId(1);
        projectile.setInternalName("WoodenArrowFriendly");
        projectile.setName("Wooden Arrow (friendly)");
        projectile.setSourceItemsJson("[{\"internalName\":\"WoodenArrow\",\"itemId\":40}]");
        projectile.setSourceNpcsJson("[{\"internalName\":\"Zombie\",\"npcId\":3}]");
        projectile.setStatus(1);

        when(projectileMapper.selectById(1L)).thenReturn(projectile);

        mockMvc.perform(get("/admin/projectiles/1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.sourceItemsJson").value("[{\"internalName\":\"WoodenArrow\",\"itemId\":40}]"))
            .andExpect(jsonPath("$.data.sourceNpcsJson").value("[{\"internalName\":\"Zombie\",\"npcId\":3}]"))
            .andExpect(jsonPath("$.data.sourceItems[0].internalName").value("WoodenArrow"))
            .andExpect(jsonPath("$.data.sourceNpcs[0].internalName").value("Zombie"));
    }

    @Test
    void shouldReturnEmptySourceArraysForInvalidProjectileSourceJson() throws Exception {
        Projectile projectile = new Projectile();
        projectile.setId(1L);
        projectile.setSourceId(1);
        projectile.setInternalName("WoodenArrowFriendly");
        projectile.setSourceItemsJson("{\"internalName\":\"WoodenArrow\"}");
        projectile.setSourceNpcsJson("not-json");
        projectile.setStatus(1);

        when(projectileMapper.selectById(1L)).thenReturn(projectile);

        mockMvc.perform(get("/admin/projectiles/1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.sourceItems").isArray())
            .andExpect(jsonPath("$.data.sourceItems").isEmpty())
            .andExpect(jsonPath("$.data.sourceNpcs").isArray())
            .andExpect(jsonPath("$.data.sourceNpcs").isEmpty());
    }

    @Test
    void shouldResolveProjectileNamePlaceholderFromReferencedProjectile() throws Exception {
        Projectile projectile = new Projectile();
        projectile.setId(1108L);
        projectile.setSourceId(1108);
        projectile.setInternalName("ObsidianFire2");
        projectile.setName("Obsidian Fire");
        projectile.setNameZh("{$ProjectileName.ObsidianFire}");
        projectile.setRawJson("{\"localized\":{\"zh\":{\"name\":\"{$ProjectileName.ObsidianFire}\"}}}");
        projectile.setStatus(1);

        Projectile baseProjectile = new Projectile();
        baseProjectile.setId(1107L);
        baseProjectile.setSourceId(1107);
        baseProjectile.setInternalName("ObsidianFire");
        baseProjectile.setName("Obsidian Fire");
        baseProjectile.setNameZh("黑曜石之火");
        baseProjectile.setStatus(1);

        when(projectileMapper.selectById(1108L)).thenReturn(projectile);
        when(projectileMapper.selectOne(any())).thenReturn(baseProjectile);

        mockMvc.perform(get("/admin/projectiles/1108"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.nameZh").value("黑曜石之火"));
    }
}

package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.ItemImageDTO;
import com.terraria.skills.dto.ItemSourceDTO;
import com.terraria.skills.service.ItemImageService;
import com.terraria.skills.service.ItemSourceService;
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

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class PublicItemRelationControllerTest {

    private static final ManagedImageUrlPolicy MANAGED_IMAGE_URL_POLICY = new ManagedImageUrlPolicy() {
        @Override
        public boolean isManagedImageUrl(String value) {
            return value != null && value.startsWith("http://localhost:9000/terrapedia-images/items/");
        }

        @Override
        public List<String> trustedManagedImageUrlPrefixes() {
            return List.of("http://localhost:9000/terrapedia-images/items/");
        }
    };

    @Mock
    private ItemImageService itemImageService;

    @Mock
    private ItemSourceService itemSourceService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders
            .standaloneSetup(new PublicItemRelationController(itemImageService, itemSourceService, MANAGED_IMAGE_URL_POLICY))
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldReturnOnlyManagedPublicImages() throws Exception {
        ItemImageDTO managed = new ItemImageDTO();
        managed.setId(1L);
        managed.setItemId(77L);
        managed.setRole("icon");
        managed.setProvider("wiki");
        managed.setSourceFileTitle("Night Edge.png");
        managed.setSourcePage("https://terraria.wiki.gg/wiki/Night_Edge");
        managed.setOriginalUrl("https://terraria.wiki.gg/images/Night_Edge.png");
        managed.setCachedUrl("http://localhost:9000/terrapedia-images/items/night-edge.png");
        managed.setImageUrl("http://localhost:9000/terrapedia-images/items/night-edge.png");
        managed.setIsPrimary(true);

        ItemImageDTO wikiOnly = new ItemImageDTO();
        wikiOnly.setId(2L);
        wikiOnly.setItemId(77L);
        wikiOnly.setImageUrl("https://terraria.wiki.gg/images/Leak.png");

        ItemImageDTO fakeManagedPath = new ItemImageDTO();
        fakeManagedPath.setId(3L);
        fakeManagedPath.setItemId(77L);
        fakeManagedPath.setImageUrl("https://example.com/terrapedia-images/items/fake.png");
        fakeManagedPath.setCachedUrl("https://example.com/terrapedia-images/items/fake.png");

        when(itemImageService.getImagesByItemId(77L)).thenReturn(List.of(managed, wikiOnly, fakeManagedPath));

        mockMvc.perform(get("/public/items/77/images"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.length()").value(1))
            .andExpect(jsonPath("$.data[0].id").value(1))
            .andExpect(jsonPath("$.data[0].imageUrl").value("http://localhost:9000/terrapedia-images/items/night-edge.png"))
            .andExpect(jsonPath("$.data[0].provider").doesNotExist())
            .andExpect(jsonPath("$.data[0].sourceFileTitle").doesNotExist())
            .andExpect(jsonPath("$.data[0].sourcePage").doesNotExist())
            .andExpect(jsonPath("$.data[0].originalUrl").doesNotExist())
            .andExpect(jsonPath("$.data[0].cachedUrl").doesNotExist());

        verify(itemImageService).getImagesByItemId(77L);
    }

    @Test
    void shouldReturnPublicSourcesWithoutProvenanceFields() throws Exception {
        ItemSourceDTO source = new ItemSourceDTO();
        source.setId(3L);
        source.setItemId(88L);
        source.setSourceType("drop");
        source.setSourceRefName("Guide");
        source.setConditions("night only https://terraria.wiki.gg/wiki/Night");
        source.setNotes("see https://static.wikia.nocookie.net/terraria_gamepedia/images/Guide.png");
        source.setSourceProvider("terraria.wiki.gg");
        source.setSourcePage("https://terraria.wiki.gg/wiki/Guide");

        when(itemSourceService.getSourcesByItemId(88L)).thenReturn(List.of(source));

        mockMvc.perform(get("/public/items/88/sources"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].id").value(3))
            .andExpect(jsonPath("$.data[0].sourceType").value("drop"))
            .andExpect(jsonPath("$.data[0].sourceRefName").value("Guide"))
            .andExpect(jsonPath("$.data[0].conditions").doesNotExist())
            .andExpect(jsonPath("$.data[0].notes").doesNotExist())
            .andExpect(jsonPath("$.data[0].sourceProvider").doesNotExist())
            .andExpect(jsonPath("$.data[0].sourcePage").doesNotExist())
            .andExpect(jsonPath("$.data[0].sourceRevisionTimestamp").doesNotExist());

        verify(itemSourceService).getSourcesByItemId(88L);
    }
}

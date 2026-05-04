package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.terraria.skills.dto.ItemAggregateDTO;
import com.terraria.skills.dto.ItemDTO;
import com.terraria.skills.dto.ItemImageDTO;
import com.terraria.skills.dto.ItemSourceDTO;
import com.terraria.skills.dto.RecipeDTO;
import com.terraria.skills.service.impl.PublicItemAggregateService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class PublicItemAggregateControllerTest {

    @Mock
    private PublicItemAggregateService publicItemAggregateService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        PublicItemAggregateController publicItemAggregateController = new PublicItemAggregateController(publicItemAggregateService);
        ObjectMapper objectMapper = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

        mockMvc = MockMvcBuilders.standaloneSetup(publicItemAggregateController)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
            .build();
    }

    @Test
    void shouldReturnAggregatedPayloadWhenAllModulesRequested() throws Exception {
        ItemDTO item = new ItemDTO();
        item.setId(1L);
        item.setName("Iron Pickaxe");
        item.setInternalName("IronPickaxe");
        item.setCategoryName("Pickaxe");

        ItemImageDTO image = new ItemImageDTO();
        image.setId(11L);
        image.setItemId(1L);
        image.setCachedUrl("https://cdn.example.com/items/1.png");

        ItemSourceDTO source = new ItemSourceDTO();
        source.setId(21L);
        source.setItemId(1L);
        source.setSourceType("mining");
        source.setSourceRefName("Iron vein");

        RecipeDTO recipe = new RecipeDTO();
        recipe.setId(31L);
        recipe.setResultItemId(1L);
        recipe.setResultQuantity(1);

        ItemAggregateDTO aggregate = new ItemAggregateDTO();
        aggregate.setItem(item);
        aggregate.setImages(List.of(image));
        aggregate.setSources(List.of(source));
        aggregate.setRecipes(List.of(recipe));
        aggregate.getModuleStatus().put("images", "ok");
        aggregate.getModuleStatus().put("sources", "ok");
        aggregate.getModuleStatus().put("recipes", "ok");
        aggregate.setAggregatedAt(java.time.LocalDateTime.of(2026, 4, 26, 12, 0));

        when(publicItemAggregateService.getItemAggregate(1L, "images,sources,recipes")).thenReturn(aggregate);

        mockMvc.perform(get("/public/items/1/aggregate")
                .param("include", "images,sources,recipes")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.item.id").value(1))
            .andExpect(jsonPath("$.data.item.name").value("Iron Pickaxe"))
            .andExpect(jsonPath("$.data.images.length()").value(1))
            .andExpect(jsonPath("$.data.sources.length()").value(1))
            .andExpect(jsonPath("$.data.recipes.length()").value(1))
            .andExpect(jsonPath("$.data.moduleStatus.images").value("ok"))
            .andExpect(jsonPath("$.data.moduleStatus.sources").value("ok"))
            .andExpect(jsonPath("$.data.moduleStatus.recipes").value("ok"))
            .andExpect(jsonPath("$.data.aggregatedAt").exists());

        verify(publicItemAggregateService).getItemAggregate(1L, "images,sources,recipes");
    }

    @Test
    void shouldSkipUnrequestedModulesWhenIncludeFiltersThem() throws Exception {
        ItemDTO item = new ItemDTO();
        item.setId(1L);
        item.setName("Iron Pickaxe");

        ItemImageDTO image = new ItemImageDTO();
        image.setId(11L);
        image.setItemId(1L);
        image.setCachedUrl("https://cdn.example.com/items/1.png");

        ItemAggregateDTO aggregate = new ItemAggregateDTO();
        aggregate.setItem(item);
        aggregate.setImages(List.of(image));
        aggregate.getModuleStatus().put("images", "ok");
        aggregate.getModuleStatus().put("sources", "skipped");
        aggregate.getModuleStatus().put("recipes", "skipped");

        when(publicItemAggregateService.getItemAggregate(1L, "images")).thenReturn(aggregate);

        mockMvc.perform(get("/public/items/1/aggregate")
                .param("include", "images")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.images.length()").value(1))
            .andExpect(jsonPath("$.data.sources.length()").value(0))
            .andExpect(jsonPath("$.data.recipes.length()").value(0))
            .andExpect(jsonPath("$.data.moduleStatus.images").value("ok"))
            .andExpect(jsonPath("$.data.moduleStatus.sources").value("skipped"))
            .andExpect(jsonPath("$.data.moduleStatus.recipes").value("skipped"));

        verify(publicItemAggregateService).getItemAggregate(1L, "images");
    }

    @Test
    void shouldReturn404WhenItemDoesNotExist() throws Exception {
        when(publicItemAggregateService.getItemAggregate(99L, "images,sources,recipes")).thenReturn(null);

        mockMvc.perform(get("/public/items/99/aggregate")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.statusCode").value(404))
            .andExpect(jsonPath("$.message").value("Item not found"));

        verify(publicItemAggregateService).getItemAggregate(99L, "images,sources,recipes");
    }

    @Test
    void shouldHideRawSourceNpcsJsonOnAggregateItem() throws Exception {
        String sourceNpcsJson = "[{\"npcId\":22,\"internalName\":\"Guide\",\"npcImageUrl\":\"https://terraria.wiki.gg/images/Guide.png\"}]";
        ItemDTO item = new ItemDTO();
        item.setId(1L);
        item.setName("Guide Voodoo Doll");
        item.setSourceNpcsJson(sourceNpcsJson);
        item.setSourceNpcs(List.of(Map.of(
            "npcId", 22,
            "internalName", "Guide",
            "sourcePage", "https://terraria.wiki.gg/wiki/Guide"
        )));

        ItemAggregateDTO aggregate = new ItemAggregateDTO();
        aggregate.setItem(item);

        when(publicItemAggregateService.getItemAggregate(1L, "images,sources,recipes")).thenReturn(aggregate);

        mockMvc.perform(get("/public/items/1/aggregate")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.item.sourceNpcsJson").doesNotExist())
            .andExpect(jsonPath("$.data.item.sourceNpcs[0].npcId").value(22))
            .andExpect(jsonPath("$.data.item.sourceNpcs[0].internalName").value("Guide"))
            .andExpect(jsonPath("$.data.item.sourceNpcs[0].npcImageUrl").doesNotExist());

        verify(publicItemAggregateService).getItemAggregate(1L, "images,sources,recipes");
    }
}

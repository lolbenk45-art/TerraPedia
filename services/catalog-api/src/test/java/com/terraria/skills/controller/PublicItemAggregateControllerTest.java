package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PublicItemAggregateControllerTest {

    @Test
    void shouldReturnGoneForDeprecatedAggregateEndpoint() throws Exception {
        MockMvc mockMvc = MockMvcBuilders
            .standaloneSetup(new PublicItemAggregateController())
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();

        mockMvc.perform(get("/public/items/1/aggregate")
                .param("include", "images,sources,recipes")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isGone())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.data").doesNotExist())
            .andExpect(jsonPath("$.statusCode").value(410))
            .andExpect(jsonPath("$.message").value("Public item aggregate is deprecated. Use split public item detail, images, sources, and recipe-tree endpoints."));
    }
}

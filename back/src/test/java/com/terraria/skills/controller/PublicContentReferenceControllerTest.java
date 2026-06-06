package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.PublicContentReferenceDTO;
import com.terraria.skills.dto.PublicContentReferenceResolveItemDTO;
import com.terraria.skills.service.PublicContentReferenceService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class PublicContentReferenceControllerTest {

    @Mock
    private PublicContentReferenceService publicContentReferenceService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new PublicContentReferenceController(publicContentReferenceService))
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldSearchContentReferencesWithTypesAndQuery() throws Exception {
        PublicContentReferenceDTO item = row("item", "77", "泰拉刃", "/items/77", true);
        PublicContentReferenceDTO npc = row("npc", "1", "向导", "/npcs/1", true);
        when(publicContentReferenceService.search(any(), any(), anyInt())).thenReturn(List.of(item, npc));

        mockMvc.perform(get("/public/content-references")
                .param("types", "item,npc")
                .param("q", " 泰 ")
                .param("limit", "20"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].type").value("item"))
            .andExpect(jsonPath("$.data[0].id").value("77"))
            .andExpect(jsonPath("$.data[0].label").value("泰拉刃"))
            .andExpect(jsonPath("$.data[0].detailPath").value("/items/77"))
            .andExpect(jsonPath("$.data[0].available").value(true))
            .andExpect(jsonPath("$.data[1].type").value("npc"))
            .andExpect(jsonPath("$.data[1].id").value("1"));

        ArgumentCaptor<Set<String>> typeCaptor = ArgumentCaptor.forClass(Set.class);
        ArgumentCaptor<String> queryCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Integer> limitCaptor = ArgumentCaptor.forClass(Integer.class);
        verify(publicContentReferenceService).search(typeCaptor.capture(), queryCaptor.capture(), limitCaptor.capture());
        assertEquals(Set.of("item", "npc"), typeCaptor.getValue());
        assertEquals("泰", queryCaptor.getValue());
        assertEquals(20, limitCaptor.getValue());
    }

    @Test
    void shouldPassBlankSearchToServiceAsEmptyQuery() throws Exception {
        when(publicContentReferenceService.search(any(), any(), anyInt())).thenReturn(List.of());

        mockMvc.perform(get("/public/content-references")
                .param("types", "item,npc")
                .param("q", "   "))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data").isArray())
            .andExpect(jsonPath("$.data.length()").value(0));

        ArgumentCaptor<String> queryCaptor = ArgumentCaptor.forClass(String.class);
        verify(publicContentReferenceService).search(any(), queryCaptor.capture(), anyInt());
        assertEquals("", queryCaptor.getValue());
    }

    @Test
    void shouldResolveReferencesFromRequestBody() throws Exception {
        when(publicContentReferenceService.resolve(any())).thenReturn(List.of(
            row("npc", "1", "向导", "/npcs/1", true),
            row("item", "77", "泰拉刃", "/items/77", true)
        ));

        mockMvc.perform(post("/public/content-references/resolve")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "refs": [
                        { "type": "npc", "id": "1" },
                        { "type": "item", "id": "77" }
                      ]
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].type").value("npc"))
            .andExpect(jsonPath("$.data[0].id").value("1"))
            .andExpect(jsonPath("$.data[1].type").value("item"))
            .andExpect(jsonPath("$.data[1].id").value("77"));

        ArgumentCaptor<List<PublicContentReferenceResolveItemDTO>> refsCaptor = ArgumentCaptor.forClass(List.class);
        verify(publicContentReferenceService).resolve(refsCaptor.capture());
        assertEquals(2, refsCaptor.getValue().size());
        assertEquals("npc", refsCaptor.getValue().get(0).getType());
        assertEquals("1", refsCaptor.getValue().get(0).getId());
    }

    @Test
    void shouldResolveNullBodyAsEmptyList() throws Exception {
        when(publicContentReferenceService.resolve(any())).thenReturn(List.of());

        mockMvc.perform(post("/public/content-references/resolve")
                .contentType(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.length()").value(0));

        ArgumentCaptor<List<PublicContentReferenceResolveItemDTO>> refsCaptor = ArgumentCaptor.forClass(List.class);
        verify(publicContentReferenceService).resolve(refsCaptor.capture());
        assertEquals(List.of(), refsCaptor.getValue());
    }

    private static PublicContentReferenceDTO row(String type, String id, String label, String detailPath, boolean available) {
        PublicContentReferenceDTO dto = new PublicContentReferenceDTO();
        dto.setType(type);
        dto.setId(id);
        dto.setLabel(label);
        dto.setDetailPath(detailPath);
        dto.setAvailable(available);
        return dto;
    }
}

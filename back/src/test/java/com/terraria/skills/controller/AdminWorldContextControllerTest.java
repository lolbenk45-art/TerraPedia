package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.entity.WorldContext;
import com.terraria.skills.mapper.WorldContextMapper;
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

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AdminWorldContextControllerTest {

    @Mock
    private WorldContextMapper worldContextMapper;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        AdminWorldContextController controller = new AdminWorldContextController(worldContextMapper);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper().findAndRegisterModules()))
            .build();
    }

    @Test
    void shouldExposeTraceabilityFieldsInListPayloadAndFilterByContextType() throws Exception {
        WorldContext context = worldContext();
        Page<WorldContext> page = new Page<>(1, 20);
        page.setTotal(1);
        page.setRecords(List.of(context));
        when(worldContextMapper.selectPage(any(Page.class), any())).thenReturn(page);

        mockMvc.perform(get("/admin/world-contexts")
                .param("contextType", "event")
                .param("page", "1")
                .param("limit", "20"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].code").value("BLOOD_MOON"))
            .andExpect(jsonPath("$.data[0].sourceProvider").value("wiki_gg"))
            .andExpect(jsonPath("$.data[0].sourcePage").value("Events"))
            .andExpect(jsonPath("$.data[0].sourceRevisionTimestamp").exists())
            .andExpect(jsonPath("$.data[0].lastSyncedAt").exists())
            .andExpect(jsonPath("$.data[0].rawJson").value("{\"source\":\"Events\"}"));
    }

    @Test
    void shouldPersistTraceabilityFieldsWhenCreatingWorldContext() throws Exception {
        when(worldContextMapper.selectCount(any())).thenReturn(0L);
        when(worldContextMapper.selectById(any())).thenAnswer(invocation -> {
            WorldContext inserted = worldContext();
            inserted.setId(invocation.getArgument(0));
            return inserted;
        });

        mockMvc.perform(post("/admin/world-contexts")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "code": "BLOOD_MOON",
                      "nameEn": "Blood Moon",
                      "nameZh": "血月",
                      "contextType": "event",
                      "sourceProvider": "wiki_gg",
                      "sourcePage": "Events",
                      "sourceRevisionTimestamp": "2026-05-20T01:02:03",
                      "lastSyncedAt": "2026-05-22T04:05:06",
                      "rawJson": "{\\"source\\":\\"Events\\"}"
                    }
                    """))
            .andExpect(status().isCreated());

        ArgumentCaptor<WorldContext> captor = ArgumentCaptor.forClass(WorldContext.class);
        verify(worldContextMapper).insert(captor.capture());
        WorldContext saved = captor.getValue();
        assertEquals("EVENT", saved.getContextType());
        assertEquals("wiki_gg", saved.getSourceProvider());
        assertEquals("Events", saved.getSourcePage());
        assertEquals(LocalDateTime.of(2026, 5, 20, 1, 2, 3), saved.getSourceRevisionTimestamp());
        assertEquals(LocalDateTime.of(2026, 5, 22, 4, 5, 6), saved.getLastSyncedAt());
        assertEquals("{\"source\":\"Events\"}", saved.getRawJson());
    }

    @Test
    void shouldPersistTraceabilityFieldsWhenUpdatingWorldContext() throws Exception {
        WorldContext existing = worldContext();
        when(worldContextMapper.selectById(13L)).thenReturn(existing, existing);
        when(worldContextMapper.selectCount(any())).thenReturn(0L);

        mockMvc.perform(put("/admin/world-contexts/13")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "sourceProvider": "wiki_gg",
                      "sourcePage": "Moon phase",
                      "sourceRevisionTimestamp": "2026-05-21T01:02:03",
                      "lastSyncedAt": "2026-05-22T05:06:07",
                      "rawJson": "{\\"source\\":\\"Moon phase\\"}"
                    }
                    """))
            .andExpect(status().isOk());

        ArgumentCaptor<WorldContext> captor = ArgumentCaptor.forClass(WorldContext.class);
        verify(worldContextMapper).updateById(captor.capture());
        WorldContext saved = captor.getValue();
        assertEquals("wiki_gg", saved.getSourceProvider());
        assertEquals("Moon phase", saved.getSourcePage());
        assertEquals(LocalDateTime.of(2026, 5, 21, 1, 2, 3), saved.getSourceRevisionTimestamp());
        assertEquals(LocalDateTime.of(2026, 5, 22, 5, 6, 7), saved.getLastSyncedAt());
        assertEquals("{\"source\":\"Moon phase\"}", saved.getRawJson());
    }

    private WorldContext worldContext() {
        WorldContext context = new WorldContext();
        context.setId(13L);
        context.setCode("BLOOD_MOON");
        context.setNameEn("Blood Moon");
        context.setNameZh("血月");
        context.setContextType("EVENT");
        context.setDescription("Event context.");
        context.setSortOrder(220);
        context.setStatus(1);
        context.setDeleted(0);
        context.setSourceProvider("wiki_gg");
        context.setSourcePage("Events");
        context.setSourceRevisionTimestamp(LocalDateTime.of(2026, 5, 20, 1, 2, 3));
        context.setLastSyncedAt(LocalDateTime.of(2026, 5, 22, 4, 5, 6));
        context.setRawJson("{\"source\":\"Events\"}");
        return context;
    }
}

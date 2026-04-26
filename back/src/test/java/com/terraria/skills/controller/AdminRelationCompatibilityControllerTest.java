package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.terraria.skills.dto.RelationCompatibilityDomainStatusDTO;
import com.terraria.skills.dto.RelationCompatibilityStatusDTO;
import com.terraria.skills.service.RelationCompatibilityService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AdminRelationCompatibilityControllerTest {

    @Mock
    private RelationCompatibilityService relationCompatibilityService;

    @InjectMocks
    private AdminRelationCompatibilityController adminRelationCompatibilityController;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        ObjectMapper objectMapper = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

        mockMvc = MockMvcBuilders.standaloneSetup(adminRelationCompatibilityController)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
            .build();
    }

    @Test
    void shouldReturnRelationCompatibilityStatus() throws Exception {
        RelationCompatibilityDomainStatusDTO items = new RelationCompatibilityDomainStatusDTO();
        items.setDomain("items");
        items.setStatus("switchable");
        items.setLocalRows(6146);
        items.setProjectionRows(6146);
        items.setSharedRows(6146);

        Map<String, RelationCompatibilityDomainStatusDTO> domains = new LinkedHashMap<>();
        domains.put("items", items);

        RelationCompatibilityStatusDTO status = new RelationCompatibilityStatusDTO();
        status.setGeneratedAt(Instant.parse("2026-04-26T00:00:00Z"));
        status.setSwitchable(true);
        status.setSwitchableDomains(List.of("items"));
        status.setBlockedDomains(List.of());
        status.setDomains(domains);

        when(relationCompatibilityService.getStatus()).thenReturn(status);

        mockMvc.perform(get("/admin/relation/compatibility"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.switchable").value(true))
            .andExpect(jsonPath("$.data.switchableDomains[0]").value("items"))
            .andExpect(jsonPath("$.data.domains.items.localRows").value(6146));

        verify(relationCompatibilityService).getStatus();
    }
}

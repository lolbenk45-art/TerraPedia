package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.SupportCategoryOptionDTO;
import com.terraria.skills.dto.SupportDomainCatalogDTO;
import com.terraria.skills.dto.SupportDomainOptionDTO;
import com.terraria.skills.service.SupportDomainService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
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
class AdminSupportDomainControllerTest {

    @Mock
    private SupportDomainService supportDomainService;

    @InjectMocks
    private AdminSupportDomainController adminSupportDomainController;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(adminSupportDomainController)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldReturnSupportDomainCatalog() throws Exception {
        SupportDomainCatalogDTO catalog = new SupportDomainCatalogDTO();
        catalog.setGamePeriods(List.of(
            option(1L, "pre_hardmode", "前期", "Pre-Hardmode", null, 1, 1)
        ));
        catalog.setWorldContexts(List.of(
            option(9L, "BLOOD_MOON", "血月", "Blood Moon", "EVENT", 10, 1)
        ));
        catalog.setItemCategories(List.of(
            categoryOption(10L, null, "WEAPON", "Weapon", "Weapon", 1, 1),
            categoryOption(11L, 10L, "WEAPON_MELEE_SWORD", "Sword", "Weapon / Sword", 2, 1)
        ));

        when(supportDomainService.getAdminCatalog()).thenReturn(catalog);

        mockMvc.perform(get("/admin/support-domains/catalog"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.gamePeriods[0].code").value("pre_hardmode"))
            .andExpect(jsonPath("$.data.gamePeriods[0].label").value("前期"))
            .andExpect(jsonPath("$.data.worldContexts[0].contextType").value("EVENT"))
            .andExpect(jsonPath("$.data.itemCategories[1].pathLabel").value("Weapon / Sword"));

        verify(supportDomainService).getAdminCatalog();
    }

    private SupportDomainOptionDTO option(
        Long id,
        String code,
        String labelZh,
        String labelEn,
        String contextType,
        Integer sortOrder,
        Integer status
    ) {
        SupportDomainOptionDTO dto = new SupportDomainOptionDTO();
        dto.setId(id);
        dto.setCode(code);
        dto.setLabel(labelZh);
        dto.setLabelZh(labelZh);
        dto.setLabelEn(labelEn);
        dto.setContextType(contextType);
        dto.setSortOrder(sortOrder);
        dto.setStatus(status);
        return dto;
    }

    private SupportCategoryOptionDTO categoryOption(
        Long id,
        Long parentId,
        String code,
        String label,
        String pathLabel,
        Integer level,
        Integer status
    ) {
        SupportCategoryOptionDTO dto = new SupportCategoryOptionDTO();
        dto.setId(id);
        dto.setParentId(parentId);
        dto.setCode(code);
        dto.setLabel(label);
        dto.setPathLabel(pathLabel);
        dto.setLevel(level);
        dto.setStatus(status);
        return dto;
    }
}

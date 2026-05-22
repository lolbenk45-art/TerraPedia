package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.entity.ConditionTerm;
import com.terraria.skills.mapper.ConditionTermMapper;
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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AdminConditionTermControllerTest {

    @Mock
    private ConditionTermMapper conditionTermMapper;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        AdminConditionTermController controller = new AdminConditionTermController(conditionTermMapper);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper().findAndRegisterModules()))
            .build();
    }

    @Test
    void shouldListConditionTermsByTermType() throws Exception {
        Page<ConditionTerm> page = new Page<>(1, 20);
        page.setTotal(1);
        page.setRecords(List.of(conditionTerm()));
        when(conditionTermMapper.selectPage(any(Page.class), any())).thenReturn(page);

        mockMvc.perform(get("/admin/condition-terms")
                .param("termType", "moon_phase_range"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].code").value("MOON_PHASE_1_4"))
            .andExpect(jsonPath("$.data[0].termType").value("MOON_PHASE_RANGE"))
            .andExpect(jsonPath("$.data[0].sourceProvider").value("terrapedia_local"));
    }

    @Test
    void shouldCreateConditionTermWithNormalizedType() throws Exception {
        when(conditionTermMapper.selectCount(any())).thenReturn(0L);
        when(conditionTermMapper.selectById(any())).thenReturn(conditionTerm());

        mockMvc.perform(post("/admin/condition-terms")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "code": "moon_phase_1_4",
                      "nameEn": "Moon Phase 1-4",
                      "nameZh": "月相 1–4",
                      "termType": "moon_phase_range",
                      "sourceProvider": "terrapedia_local",
                      "sourcePage": "town_npc_shop_conditions"
                    }
                    """))
            .andExpect(status().isCreated());

        ArgumentCaptor<ConditionTerm> captor = ArgumentCaptor.forClass(ConditionTerm.class);
        verify(conditionTermMapper).insert(captor.capture());
        assertEquals("MOON_PHASE_1_4", captor.getValue().getCode());
        assertEquals("MOON_PHASE_RANGE", captor.getValue().getTermType());
    }

    private ConditionTerm conditionTerm() {
        ConditionTerm conditionTerm = new ConditionTerm();
        conditionTerm.setId(30L);
        conditionTerm.setCode("MOON_PHASE_1_4");
        conditionTerm.setNameEn("Moon Phase 1-4");
        conditionTerm.setNameZh("月相 1–4");
        conditionTerm.setTermType("MOON_PHASE_RANGE");
        conditionTerm.setDescription("Local condition term.");
        conditionTerm.setSourceProvider("terrapedia_local");
        conditionTerm.setSourcePage("town_npc_shop_conditions");
        conditionTerm.setSortOrder(30);
        conditionTerm.setStatus(1);
        conditionTerm.setDeleted(0);
        return conditionTerm;
    }
}

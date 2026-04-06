package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.entity.Category;
import com.terraria.skills.entity.Npc;
import com.terraria.skills.mapper.CategoryMapper;
import com.terraria.skills.mapper.NpcMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AdminNpcControllerTest {

    @Mock
    private NpcMapper npcMapper;

    @Mock
    private CategoryMapper categoryMapper;

    @Mock
    private ObjectMapper objectMapper;

    @InjectMocks
    private AdminNpcController adminNpcController;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(adminNpcController)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldPreferNpcChineseNameInListPayload() throws Exception {
        Npc npc = new Npc();
        npc.setId(1L);
        npc.setGameId(-65L);
        npc.setInternalName("BigHornetStingy");
        npc.setName("Hornet");
        npc.setNameZh("黄蜂");
        npc.setSubName("Hornet");
        npc.setSubNameZh("大毒刺黄蜂");
        npc.setCategoryId(69L);
        npc.setStatus(1);

        Category category = new Category();
        category.setId(69L);
        category.setCode("CATEGORY_NPC_ENEMY");
        category.setName("敌方NPC");

        Page<Npc> page = new Page<>(1, 20);
        page.setTotal(1);
        page.setRecords(List.of(npc));

        when(npcMapper.selectPage(any(Page.class), any())).thenReturn(page);
        when(categoryMapper.selectById(eq(69L))).thenReturn(category);

        mockMvc.perform(get("/admin/npcs").param("page", "1").param("limit", "20"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].name").value("Hornet"))
            .andExpect(jsonPath("$.data[0].nameZh").value("黄蜂"))
            .andExpect(jsonPath("$.data[0].subNameZh").value("大毒刺黄蜂"))
            .andExpect(jsonPath("$.data[0].categoryName").value("敌方NPC"))
            .andExpect(jsonPath("$.data[0].categoryCode").value("CATEGORY_NPC_ENEMY"));

        ArgumentCaptor<Page<Npc>> pageCaptor = ArgumentCaptor.forClass(Page.class);
        verify(npcMapper).selectPage(pageCaptor.capture(), any());
        assertTrue(pageCaptor.getValue().getSize() == 20);
    }

    @Test
    void shouldAcceptNpcCategoryFilter() throws Exception {
        Page<Npc> page = new Page<>(1, 20);
        page.setTotal(0);
        page.setRecords(List.of());

        when(npcMapper.selectPage(any(Page.class), any())).thenReturn(page);

        mockMvc.perform(get("/admin/npcs").param("categoryId", "69"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));
    }
}

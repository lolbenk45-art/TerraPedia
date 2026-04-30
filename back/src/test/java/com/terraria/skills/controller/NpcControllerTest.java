package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.NpcListItemDTO;
import com.terraria.skills.dto.PublicNpcQuery;
import com.terraria.skills.service.PublicNpcService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class NpcControllerTest {

    private FakePublicNpcService publicNpcService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        publicNpcService = new FakePublicNpcService();
        mockMvc = MockMvcBuilders.standaloneSetup(new NpcController(publicNpcService))
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldReturnPaginatedPublicNpcsAndForwardFilters() throws Exception {
        NpcListItemDTO townNpc = new NpcListItemDTO();
        townNpc.setId(2L);
        townNpc.setGameId(22L);
        townNpc.setInternalName("Guide");
        townNpc.setName("Guide");
        townNpc.setNameZh("向导");
        townNpc.setSubName("Helpful");
        townNpc.setSubNameZh("乐于助人");
        townNpc.setCategoryId(3L);
        townNpc.setCategoryName("Town NPC");
        townNpc.setIsBoss(false);
        townNpc.setIsFriendly(true);
        townNpc.setIsTownNpc(true);
        townNpc.setImageUrl("https://cdn.example.com/npcs/guide.png");

        NpcListItemDTO nonTownNpc = new NpcListItemDTO();
        nonTownNpc.setId(9L);
        nonTownNpc.setGameId(90L);
        nonTownNpc.setInternalName("Merchant");
        nonTownNpc.setName("Merchant");
        nonTownNpc.setNameZh("商人");
        nonTownNpc.setCategoryId(3L);
        nonTownNpc.setCategoryName("Town NPC");
        nonTownNpc.setIsBoss(false);
        nonTownNpc.setIsFriendly(true);
        nonTownNpc.setIsTownNpc(false);

        Page<NpcListItemDTO> page = new Page<>(2, 5);
        page.setTotal(7);
        page.setRecords(List.of(townNpc, nonTownNpc));

        publicNpcService.pageToReturn = page;

        mockMvc.perform(get("/npcs")
                .param("page", "2")
                .param("limit", "5")
                .param("search", "guide")
                .param("categoryId", "3")
                .param("isTownNpc", "true"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.pagination.page").value(2))
            .andExpect(jsonPath("$.pagination.limit").value(5))
            .andExpect(jsonPath("$.pagination.total").value(7))
            .andExpect(jsonPath("$.data.length()").value(2))
            .andExpect(jsonPath("$.data[0].id").value(2))
            .andExpect(jsonPath("$.data[0].name").value("Guide"))
            .andExpect(jsonPath("$.data[0].categoryName").value("Town NPC"))
            .andExpect(jsonPath("$.data[0].isBoss").value(false))
            .andExpect(jsonPath("$.data[0].isTownNpc").value(true))
            .andExpect(jsonPath("$.data[0].imageUrl").value("https://cdn.example.com/npcs/guide.png"))
            .andExpect(jsonPath("$.data[1].id").value(9))
            .andExpect(jsonPath("$.data[1].isBoss").value(false));

        assertEquals(2, publicNpcService.lastQuery.getPage());
        assertEquals(5, publicNpcService.lastQuery.getLimit());
        assertEquals("guide", publicNpcService.lastQuery.getSearch());
        assertEquals(3L, publicNpcService.lastQuery.getCategoryId());
        assertEquals(true, publicNpcService.lastQuery.getIsTownNpc());
    }

    @Test
    void shouldUseDefaultPaginationWhenParamsAreMissing() throws Exception {
        Page<NpcListItemDTO> page = new Page<>(1, 20);
        page.setTotal(0);
        page.setRecords(List.of());

        publicNpcService.pageToReturn = page;

        mockMvc.perform(get("/npcs"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.pagination.page").value(1))
            .andExpect(jsonPath("$.pagination.limit").value(20))
            .andExpect(jsonPath("$.data.length()").value(0));

        assertEquals(1, publicNpcService.lastQuery.getPage());
        assertEquals(20, publicNpcService.lastQuery.getLimit());
    }

    @Test
    void shouldPreserveProjectionJsonStringsInPublicListPayload() throws Exception {
        String lootItemsJson = "[{\"itemId\":8,\"internalName\":\"Torch\"}]";
        String shopItemsJson = "[{\"itemId\":9,\"internalName\":\"Rope\"}]";
        String sourceItemsJson = "[{\"itemId\":930,\"internalName\":\"FlareGun\"}]";

        NpcListItemDTO npc = new NpcListItemDTO();
        npc.setId(7L);
        npc.setGameId(22L);
        npc.setInternalName("Guide");
        npc.setName("Guide");
        ReflectionTestUtils.setField(npc, "lootItemsJson", lootItemsJson);
        ReflectionTestUtils.setField(npc, "shopItemsJson", shopItemsJson);
        ReflectionTestUtils.setField(npc, "sourceItemsJson", sourceItemsJson);

        Page<NpcListItemDTO> page = new Page<>(1, 20);
        page.setTotal(1);
        page.setRecords(List.of(npc));
        publicNpcService.pageToReturn = page;

        mockMvc.perform(get("/npcs"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].lootItemsJson").value(lootItemsJson))
            .andExpect(jsonPath("$.data[0].shopItemsJson").value(shopItemsJson))
            .andExpect(jsonPath("$.data[0].sourceItemsJson").value(sourceItemsJson));
    }

    private static class FakePublicNpcService implements PublicNpcService {
        private Page<NpcListItemDTO> pageToReturn = new Page<>(1, 20);
        private PublicNpcQuery lastQuery;

        @Override
        public Page<NpcListItemDTO> getNpcs(PublicNpcQuery query) {
            this.lastQuery = query;
            return pageToReturn;
        }

        @Override
        public com.terraria.skills.dto.NpcDetailDTO getNpcById(Long id) {
            throw new UnsupportedOperationException();
        }

        @Override
        public List<com.terraria.skills.dto.NpcLootEntryDTO> getNpcLoot(Long npcId, Long gameId, String npcName) {
            throw new UnsupportedOperationException();
        }

        @Override
        public List<com.terraria.skills.dto.NpcShopEntryDTO> getNpcShopEntries(Long npcId) {
            throw new UnsupportedOperationException();
        }

        @Override
        public List<com.terraria.skills.dto.NpcBuffRelationDTO> getNpcBuffRelations(Long npcId) {
            throw new UnsupportedOperationException();
        }
    }
}

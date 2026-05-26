package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.terraria.skills.dto.NpcBuffRelationDTO;
import com.terraria.skills.dto.NpcDetailDTO;
import com.terraria.skills.dto.NpcLivingPreferenceDTO;
import com.terraria.skills.dto.NpcLootEntryDTO;
import com.terraria.skills.dto.NpcShopEntryDTO;
import com.terraria.skills.dto.NpcWikiAssetsDTO;
import com.terraria.skills.service.PublicNpcService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PublicNpcAggregateControllerTest {

    private FakePublicNpcService publicNpcService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        publicNpcService = new FakePublicNpcService();
        ObjectMapper objectMapper = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

        mockMvc = MockMvcBuilders.standaloneSetup(new PublicNpcAggregateController(publicNpcService))
            .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
            .build();
    }

    @Test
    void shouldReturnAggregateWithRequestedModulesAndEmptyModuleStatus() throws Exception {
        NpcDetailDTO npc = new NpcDetailDTO();
        npc.setId(1L);
        npc.setGameId(22L);
        npc.setInternalName("Guide");
        npc.setName("Guide");
        npc.setNameZh("向导");
        npc.setCategoryId(3L);
        npc.setCategoryName("Town NPC");
        npc.setIsBoss(false);
        npc.setIsFriendly(true);
        npc.setIsTownNpc(true);
        npc.setImageUrl("https://cdn.example.com/npcs/guide.png");
        npc.setLifeMax(250);
        npc.setDamage(10);
        npc.setDefense(30);
        npc.setKnockBackResist(0.5);
        npc.setNpcType(22);
        npc.setLootEntryCount(1);
        npc.setShopEntryCount(0);
        npc.setBuffRelationCount(1);

        NpcLootEntryDTO lootEntry = new NpcLootEntryDTO();
        lootEntry.setId(11L);
        lootEntry.setItemId(101L);
        lootEntry.setItemName("Fallen Star");
        lootEntry.setLootSourceMode("direct");
        lootEntry.setTrustedStructured(true);

        NpcBuffRelationDTO buffRelation = new NpcBuffRelationDTO();
        buffRelation.setId(31L);
        buffRelation.setBuffId(401L);
        buffRelation.setBuffNameZh("再生");

        publicNpcService.npcToReturn = npc;
        publicNpcService.lootToReturn = List.of(lootEntry);
        publicNpcService.shopEntriesToReturn = List.of();
        publicNpcService.buffRelationsToReturn = List.of(buffRelation);

        mockMvc.perform(get("/public/npcs/1/aggregate")
                .param("include", "loot,shop,buffs")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.npc.id").value(1))
            .andExpect(jsonPath("$.data.npc.imageUrl").value("https://cdn.example.com/npcs/guide.png"))
            .andExpect(jsonPath("$.data.npc.lifeMax").value(250))
            .andExpect(jsonPath("$.data.npc.damage").value(10))
            .andExpect(jsonPath("$.data.npc.defense").value(30))
            .andExpect(jsonPath("$.data.npc.knockBackResist").value(0.5))
            .andExpect(jsonPath("$.data.npc.npcType").value(22))
            .andExpect(jsonPath("$.data.npc.lootEntryCount").value(1))
            .andExpect(jsonPath("$.data.npc.shopEntryCount").value(0))
            .andExpect(jsonPath("$.data.npc.buffRelationCount").value(1))
            .andExpect(jsonPath("$.data.npc.rawJson").doesNotExist())
            .andExpect(jsonPath("$.data.loot.length()").value(1))
            .andExpect(jsonPath("$.data.loot[0].lootSourceMode").value("direct"))
            .andExpect(jsonPath("$.data.loot[0].trustedStructured").value(true))
            .andExpect(jsonPath("$.data.shopEntries.length()").value(0))
            .andExpect(jsonPath("$.data.buffRelations.length()").value(1))
            .andExpect(jsonPath("$.data.moduleStatus.loot").value("ok"))
            .andExpect(jsonPath("$.data.moduleStatus.shop").value("empty"))
            .andExpect(jsonPath("$.data.moduleStatus.buffs").value("ok"))
            .andExpect(jsonPath("$.data.aggregatedAt").exists());
        assertEquals(1, publicNpcService.getNpcByIdCalls);
        assertEquals(1, publicNpcService.getNpcLootCalls);
        assertEquals(1, publicNpcService.getNpcShopEntriesCalls);
        assertEquals(1, publicNpcService.getNpcBuffRelationsCalls);
    }

    @Test
    void shouldSkipUnrequestedModulesAndKeepEmptyArrays() throws Exception {
        NpcDetailDTO npc = new NpcDetailDTO();
        npc.setId(2L);
        npc.setGameId(18L);
        npc.setInternalName("Merchant");
        npc.setName("Merchant");

        NpcShopEntryDTO shopEntry = new NpcShopEntryDTO();
        shopEntry.setId(21L);
        shopEntry.setItemId(301L);
        shopEntry.setItemName("Torch");

        publicNpcService.npcToReturn = npc;
        publicNpcService.shopEntriesToReturn = List.of(shopEntry);

        mockMvc.perform(get("/public/npcs/2/aggregate")
                .param("include", "shop")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.loot.length()").value(0))
            .andExpect(jsonPath("$.data.shopEntries.length()").value(1))
            .andExpect(jsonPath("$.data.buffRelations.length()").value(0))
            .andExpect(jsonPath("$.data.moduleStatus.loot").value("skipped"))
            .andExpect(jsonPath("$.data.moduleStatus.shop").value("ok"))
            .andExpect(jsonPath("$.data.moduleStatus.buffs").value("skipped"));
        assertEquals(1, publicNpcService.getNpcByIdCalls);
        assertEquals(0, publicNpcService.getNpcLootCalls);
        assertEquals(1, publicNpcService.getNpcShopEntriesCalls);
        assertEquals(0, publicNpcService.getNpcBuffRelationsCalls);
    }

    @Test
    void shouldQueryAggregateModulesWithResolvedRepresentativeNpcId() throws Exception {
        NpcDetailDTO npc = new NpcDetailDTO();
        npc.setId(454L);
        npc.setGameId(454L);
        npc.setInternalName("CultistDragonHead");
        npc.setName("Phantasm Dragon");

        publicNpcService.npcToReturn = npc;

        mockMvc.perform(get("/public/npcs/455/aggregate")
                .param("include", "loot,shop,buffs")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.npc.id").value(454))
            .andExpect(jsonPath("$.data.npc.internalName").value("CultistDragonHead"));

        assertEquals(455L, publicNpcService.lastGetNpcById);
        assertEquals(454L, publicNpcService.lastLootNpcId);
        assertEquals(454L, publicNpcService.lastShopNpcId);
        assertEquals(454L, publicNpcService.lastBuffNpcId);
    }

    @Test
    void shouldExposeBehaviorNotesOnAggregateNpcBase() throws Exception {
        NpcDetailDTO npc = new NpcDetailDTO();
        npc.setId(7L);
        npc.setGameId(22L);
        npc.setInternalName("Guide");
        npc.setName("Guide");
        npc.setNameZh("向导");
        npc.setBehaviorNotes("Offers advice to new players.");

        publicNpcService.npcToReturn = npc;

        mockMvc.perform(get("/public/npcs/7/aggregate")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.npc.behaviorNotes").value("Offers advice to new players."));
    }

    @Test
    void shouldExposeWikiAssetsAndLivingPreferencesOnAggregateNpcBase() throws Exception {
        NpcDetailDTO npc = new NpcDetailDTO();
        npc.setId(17L);
        npc.setGameId(17L);
        npc.setInternalName("Merchant");
        npc.setName("Merchant");
        npc.setNameZh("商人");

        NpcWikiAssetsDTO wikiAssets = new NpcWikiAssetsDTO();
        wikiAssets.setSpriteImage("http://localhost:9000/terrapedia-images/npcs/merchant.png");
        wikiAssets.setMapIconImage("http://localhost:9000/terrapedia-images/npcs/merchant-map.png");
        wikiAssets.setDialogPortraitImage("http://localhost:9000/terrapedia-images/npcs/merchant-dialog-portrait.png");
        npc.setWikiAssets(wikiAssets);

        NpcLivingPreferenceDTO forestPreference = new NpcLivingPreferenceDTO();
        forestPreference.setTargetType("biome");
        forestPreference.setPreference("like");
        forestPreference.setTargetName("Forest");
        forestPreference.setTargetNameZh("森林");

        NpcLivingPreferenceDTO anglerPreference = new NpcLivingPreferenceDTO();
        anglerPreference.setTargetType("npc");
        anglerPreference.setPreference("hate");
        anglerPreference.setTargetId(369L);
        anglerPreference.setTargetName("Angler");
        anglerPreference.setTargetNameZh("渔夫");

        npc.setLivingPreferences(List.of(forestPreference, anglerPreference));
        publicNpcService.npcToReturn = npc;

        mockMvc.perform(get("/public/npcs/17/aggregate")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.npc.wikiAssets.dialogPortraitImage").value("http://localhost:9000/terrapedia-images/npcs/merchant-dialog-portrait.png"))
            .andExpect(jsonPath("$.data.npc.livingPreferences[0].targetType").value("biome"))
            .andExpect(jsonPath("$.data.npc.livingPreferences[0].preference").value("like"))
            .andExpect(jsonPath("$.data.npc.livingPreferences[1].targetNameZh").value("渔夫"));
    }

    @Test
    void shouldReturn404WhenNpcDoesNotExist() throws Exception {
        publicNpcService.npcToReturn = null;

        mockMvc.perform(get("/public/npcs/99/aggregate")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.statusCode").value(404))
            .andExpect(jsonPath("$.message").value("Npc not found"));
        assertEquals(1, publicNpcService.getNpcByIdCalls);
        assertEquals(0, publicNpcService.getNpcLootCalls);
        assertEquals(0, publicNpcService.getNpcShopEntriesCalls);
        assertEquals(0, publicNpcService.getNpcBuffRelationsCalls);
    }

    @Test
    void shouldPreserveProjectionJsonStringsOnAggregateNpcBase() throws Exception {
        String lootItemsJson = "[{\"itemId\":8,\"internalName\":\"Torch\"}]";
        String shopItemsJson = "[{\"itemId\":9,\"internalName\":\"Rope\"}]";
        String sourceItemsJson = "[{\"itemId\":930,\"internalName\":\"FlareGun\"}]";

        NpcDetailDTO npc = new NpcDetailDTO();
        npc.setId(7L);
        npc.setGameId(22L);
        npc.setInternalName("Guide");
        npc.setName("Guide");
        ReflectionTestUtils.setField(npc, "lootItemsJson", lootItemsJson);
        ReflectionTestUtils.setField(npc, "shopItemsJson", shopItemsJson);
        ReflectionTestUtils.setField(npc, "sourceItemsJson", sourceItemsJson);

        publicNpcService.npcToReturn = npc;

        mockMvc.perform(get("/public/npcs/7/aggregate")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.npc.lootItemsJson").value(lootItemsJson))
            .andExpect(jsonPath("$.data.npc.shopItemsJson").value(shopItemsJson))
            .andExpect(jsonPath("$.data.npc.sourceItemsJson").value(sourceItemsJson));
    }

    private static class FakePublicNpcService implements PublicNpcService {
        private NpcDetailDTO npcToReturn;
        private List<NpcLootEntryDTO> lootToReturn = List.of();
        private List<NpcShopEntryDTO> shopEntriesToReturn = List.of();
        private List<NpcBuffRelationDTO> buffRelationsToReturn = List.of();
        private int getNpcByIdCalls;
        private int getNpcLootCalls;
        private int getNpcShopEntriesCalls;
        private int getNpcBuffRelationsCalls;
        private Long lastGetNpcById;
        private Long lastLootNpcId;
        private Long lastShopNpcId;
        private Long lastBuffNpcId;

        @Override
        public com.baomidou.mybatisplus.extension.plugins.pagination.Page<com.terraria.skills.dto.NpcListItemDTO> getNpcs(
            com.terraria.skills.dto.PublicNpcQuery query
        ) {
            throw new UnsupportedOperationException();
        }

        @Override
        public NpcDetailDTO getNpcById(Long id) {
            getNpcByIdCalls += 1;
            lastGetNpcById = id;
            return npcToReturn;
        }

        @Override
        public List<NpcLootEntryDTO> getNpcLoot(Long npcId, Long gameId, String npcName) {
            getNpcLootCalls += 1;
            lastLootNpcId = npcId;
            return lootToReturn;
        }

        @Override
        public List<NpcShopEntryDTO> getNpcShopEntries(Long npcId) {
            getNpcShopEntriesCalls += 1;
            lastShopNpcId = npcId;
            return shopEntriesToReturn;
        }

        @Override
        public List<NpcBuffRelationDTO> getNpcBuffRelations(Long npcId) {
            getNpcBuffRelationsCalls += 1;
            lastBuffNpcId = npcId;
            return buffRelationsToReturn;
        }
    }
}

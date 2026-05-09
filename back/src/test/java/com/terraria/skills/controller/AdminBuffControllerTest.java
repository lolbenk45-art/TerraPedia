package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.entity.Buff;
import com.terraria.skills.mapper.BuffMapper;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;
import java.util.LinkedHashMap;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AdminBuffControllerTest {

    private static final ManagedImageUrlPolicy MANAGED_IMAGE_URL_POLICY = new ManagedImageUrlPolicy() {
        @Override
        public boolean isManagedImageUrl(String value) {
            return value != null && value.startsWith("http://localhost:9000/terrapedia-images/");
        }

        @Override
        public List<String> trustedManagedImageUrlPrefixes() {
            return List.of("http://localhost:9000/terrapedia-images/");
        }
    };

    @Mock
    private BuffMapper buffMapper;

    @Mock
    private JdbcTemplate jdbcTemplate;

    @InjectMocks
    private AdminBuffController adminBuffController;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        adminBuffController = new AdminBuffController(buffMapper, new ObjectMapper(), jdbcTemplate, MANAGED_IMAGE_URL_POLICY);
        mockMvc = MockMvcBuilders.standaloneSetup(adminBuffController)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldReturnManagedBuffImageUrlWhenCachedImageExists() throws Exception {
        String managedImageUrl = "http://localhost:9000/terrapedia-images/items/wiki/buffs/ab/sharpened.png";
        Buff buff = new Buff();
        buff.setId(159L);
        buff.setSourceId(159);
        buff.setInternalName("Sharpened");
        buff.setEnglishName("Sharpened");
        buff.setNameZh("锋利");
        buff.setImage("https://terraria.wiki.gg/images/Sharpened.png");
        invokeSetter(buff, "setImageOriginalUrl", "https://terraria.wiki.gg/images/Sharpened.png");
        invokeSetter(buff, "setImageCachedUrl", managedImageUrl);

        when(buffMapper.selectById(159L)).thenReturn(buff);

        mockMvc.perform(get("/admin/buffs/159"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.image").value(managedImageUrl))
            .andExpect(jsonPath("$.data.imagePath").value(managedImageUrl))
            .andExpect(jsonPath("$.data.imageOriginalUrl").value(managedImageUrl))
            .andExpect(jsonPath("$.data.imageUrl").value(managedImageUrl))
            .andExpect(jsonPath("$.data.imageCachedUrl").value(managedImageUrl));
    }

    @Test
    void shouldSuppressNonManagedNpcSpriteImagesInImmuneNpcSamples() throws Exception {
        Buff buff = new Buff();
        buff.setId(30L);
        buff.setInternalName("Poisoned");
        buff.setEnglishName("Poisoned");
        buff.setImmuneNpcCount(1);
        buff.setImmuneNpcSampleJson("[{\"internalName\":\"TestHornetStingy\",\"name\":\"Hornet\",\"npcId\":-650001}]");

        when(buffMapper.selectById(30L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(
            contains("FROM npcs"),
            eq("TestHornetStingy")
        )).thenReturn(List.of(Map.of(
            "npcDbId", 9001L,
            "npcId", -650001,
            "internalName", "TestHornetStingy",
            "name", "Hornet",
            "nameZh", "Hornet ZH",
            "subNameZh", "Large Stingy Hornet",
            "rawJson", "{\"imageUrl\":\"https://cdn.example.com/npcs/Stingy_Hornet.png\"}"
        )));

        mockMvc.perform(get("/admin/buffs/30"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.immuneNpcSampleJson").value("[{\"internalName\":\"TestHornetStingy\",\"name\":\"Hornet\",\"npcId\":-650001}]"))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].npcId").value(-650001))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].npcDbId").value(9001))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].nameZh").value("Hornet ZH"))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].subNameZh").value("Large Stingy Hornet"))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].image").value(nullValue()))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].imageUrl").value(nullValue()));
    }

    @Test
    void shouldFallbackToItemsImageWhenNpcSpriteMissing() throws Exception {
        Buff buff = new Buff();
        buff.setId(31L);
        buff.setInternalName("CustomDebuff");
        buff.setEnglishName("Custom Debuff");
        buff.setImmuneNpcCount(1);
        buff.setImmuneNpcSampleJson("[{\"npcId\":1001,\"name\":\"Fallback NPC\"}]");

        when(buffMapper.selectById(31L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(
            contains("FROM npcs"),
            eq(1001)
        )).thenReturn(List.of(Map.of(
            "npcDbId", 1001L,
            "npcId", 1001,
            "internalName", "FallbackNpc",
            "name", "Fallback NPC",
            "nameZh", "Fallback NPC ZH",
            "subNameZh", "Fallback Variant",
            "bannerItemId", 88L,
            "rawJson", "{}"
        )));
        lenient().when(jdbcTemplate.queryForList(
            contains("LOWER(TRIM(name)) IN"),
            any(Object[].class)
        )).thenReturn(List.of());
        when(jdbcTemplate.queryForList(
            contains("FROM items"),
            eq(88L)
        )).thenReturn(List.of(Map.of(
            "id", 88L,
            "image", "http://localhost:9000/terrapedia-images/items/fallback-banner.png"
        )));

        mockMvc.perform(get("/admin/buffs/31"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].npcId").value(1001))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].image").value("http://localhost:9000/terrapedia-images/items/fallback-banner.png"))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].imageUrl").value("http://localhost:9000/terrapedia-images/items/fallback-banner.png"));
    }

    @Test
    void shouldMoveUnresolvedImmuneNpcSamplesOutOfResolvedCards() throws Exception {
        Buff buff = new Buff();
        buff.setId(32L);
        buff.setInternalName("NoImageDebuff");
        buff.setEnglishName("No Image Debuff");
        buff.setImmuneNpcCount(1);
        buff.setImmuneNpcSampleJson("[{\"npcId\":1002,\"name\":\"Unknown NPC\"}]");

        when(buffMapper.selectById(32L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(
            contains("LOWER(TRIM(name)) IN"),
            any(Object[].class)
        )).thenReturn(List.of());
        when(jdbcTemplate.queryForList(
            contains("FROM npcs"),
            eq(1002)
        )).thenReturn(List.of());

        mockMvc.perform(get("/admin/buffs/32"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.immuneNpcSampleJson").value("[{\"npcId\":1002,\"name\":\"Unknown NPC\"}]"))
            .andExpect(jsonPath("$.data.immuneNpcSamples", hasSize(0)))
            .andExpect(jsonPath("$.data.unresolvedImmuneNpcSamples", hasSize(1)))
            .andExpect(jsonPath("$.data.unresolvedImmuneNpcSamples[0].name").value("Unknown NPC"))
            .andExpect(jsonPath("$.data.unresolvedImmuneNpcSamples[0].resolutionStatus").value("unresolved"));
    }

    @Test
    void shouldResolveImmuneNpcAliasByDisplayName() throws Exception {
        Buff buff = new Buff();
        buff.setId(39L);
        buff.setInternalName("CursedInferno");
        buff.setEnglishName("Cursed Inferno");
        buff.setImmuneNpcCount(1);
        buff.setImmuneNpcSampleJson("[{\"internalName\":\"PirateSCurse\",\"name\":\"Pirate's Curse\"}]");

        when(buffMapper.selectById(39L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(
            contains("WHERE deleted = 0 AND internal_name IN"),
            eq("PirateSCurse")
        )).thenReturn(List.of());
        when(jdbcTemplate.queryForList(
            contains("WHERE deleted = 0 AND game_id IN"),
            eq(-1)
        )).thenReturn(List.of());
        when(jdbcTemplate.queryForList(
            contains("LOWER(TRIM(name)) IN"),
            any(Object[].class)
        )).thenReturn(List.of(Map.of(
            "npcDbId", 662L,
            "npcId", 662,
            "internalName", "PirateGhost",
            "name", "Pirate's Curse",
            "nameZh", "Pirate Curse ZH",
            "subNameZh", "Pirate Curse Variant",
            "rawJson", "{}"
        )));

        mockMvc.perform(get("/admin/buffs/39"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.immuneNpcSampleJson").value("[{\"internalName\":\"PirateSCurse\",\"name\":\"Pirate's Curse\"}]"))
            .andExpect(jsonPath("$.data.immuneNpcSamples", hasSize(1)))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].npcDbId").value(662))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].npcId").value(662))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].internalName").value("PirateGhost"))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].name").value("Pirate's Curse"))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].nameZh").value("Pirate Curse ZH"))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].resolutionStatus").value("alias_resolved"));
    }

    @Test
    void shouldResolveCorruptMimicAliasToCanonicalNpc() throws Exception {
        Buff buff = new Buff();
        buff.setId(40L);
        buff.setInternalName("OnFire");
        buff.setEnglishName("On Fire!");
        buff.setImmuneNpcCount(1);
        buff.setImmuneNpcSampleJson("[{\"internalName\":\"CorruptMimic\",\"name\":\"Corrupt Mimic\"}]");

        when(buffMapper.selectById(40L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(
            contains("WHERE deleted = 0 AND internal_name IN"),
            eq("CorruptMimic")
        )).thenReturn(List.of());
        when(jdbcTemplate.queryForList(
            contains("WHERE deleted = 0 AND game_id IN"),
            eq(-1)
        )).thenReturn(List.of());
        when(jdbcTemplate.queryForList(
            contains("LOWER(TRIM(name)) IN"),
            any(Object[].class)
        )).thenReturn(List.of(Map.of(
            "npcDbId", 473L,
            "npcId", 473,
            "internalName", "BigMimicCorruption",
            "name", "Corrupt Mimic",
            "nameZh", "Corrupt Mimic ZH",
            "subNameZh", "Corrupt Mimic Variant",
            "rawJson", "{}"
        )));

        mockMvc.perform(get("/admin/buffs/40"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.immuneNpcSamples", hasSize(1)))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].npcDbId").value(473))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].npcId").value(473))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].internalName").value("BigMimicCorruption"))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].resolutionStatus").value("alias_resolved"))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].nameZh").value("Corrupt Mimic ZH"));
    }

    @Test
    void shouldResolveAmbiguousImmuneNpcAliasToDeterministicRepresentative() throws Exception {
        Buff buff = new Buff();
        buff.setId(41L);
        buff.setInternalName("Poisoned");
        buff.setEnglishName("Poisoned");
        buff.setImmuneNpcCount(1);
        buff.setImmuneNpcSampleJson("[{\"internalName\":\"PhantasmDragon\",\"name\":\"Phantasm Dragon\"}]");

        when(buffMapper.selectById(41L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(
            contains("WHERE deleted = 0 AND internal_name IN"),
            eq("PhantasmDragon")
        )).thenReturn(List.of());
        when(jdbcTemplate.queryForList(
            contains("WHERE deleted = 0 AND game_id IN"),
            eq(-1)
        )).thenReturn(List.of());
        when(jdbcTemplate.queryForList(
            contains("LOWER(TRIM(name)) IN"),
            any(Object[].class)
        )).thenReturn(List.of(
            npcAliasRow(454L, 454, "CultistDragonHead", "Phantasm Dragon"),
            npcAliasRow(455L, 455, "CultistDragonBody1", "Phantasm Dragon"),
            npcAliasRow(459L, 459, "CultistDragonTail", "Phantasm Dragon")
        ));

        mockMvc.perform(get("/admin/buffs/41"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.immuneNpcSamples", hasSize(1)))
            .andExpect(jsonPath("$.data.unresolvedImmuneNpcSamples", hasSize(0)))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].internalName").value("CultistDragonHead"))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].npcDbId").value(454))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].npcId").value(454))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].resolutionStatus").value("alias_ambiguous_representative"))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].matchCount").value(3))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].matchedNpcIds", hasSize(3)))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].matchedNpcDbIds", hasSize(3)))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].matchedInternalNames", hasSize(3)))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].matchedNpcIds[0]").value(454))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].matchedNpcIds[1]").value(455))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].matchedNpcIds[2]").value(459))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].matchedInternalNames[0]").value("CultistDragonHead"));
    }

    @Test
    void shouldKeepResolvedOrderAndSeparateUnresolvedImmuneNpcSamples() throws Exception {
        Buff buff = new Buff();
        buff.setId(42L);
        buff.setInternalName("Poisoned");
        buff.setEnglishName("Poisoned");
        buff.setImmuneNpcCount(3);
        buff.setImmuneNpcSampleJson("""
            [
              {"internalName":"PirateSCurse","name":"Pirate's Curse"},
              {"internalName":"UnknownAlias","name":"Unknown NPC"},
              {"npcId":1001,"name":"Fallback NPC"}
            ]
            """);

        when(buffMapper.selectById(42L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(
            contains("WHERE deleted = 0 AND internal_name IN"),
            any(Object[].class)
        )).thenReturn(List.of());
        when(jdbcTemplate.queryForList(
            contains("WHERE deleted = 0 AND game_id IN"),
            any(Object[].class)
        )).thenReturn(List.of(Map.of(
            "npcDbId", 1001L,
            "npcId", 1001,
            "internalName", "FallbackNpc",
            "name", "Fallback NPC",
            "nameZh", "Fallback NPC ZH",
            "subNameZh", "Fallback Variant",
            "bannerItemId", 88L,
            "rawJson", "{}"
        )));
        when(jdbcTemplate.queryForList(
            contains("LOWER(TRIM(name)) IN"),
            any(Object[].class)
        )).thenReturn(List.of(Map.of(
            "npcDbId", 662L,
            "npcId", 662,
            "internalName", "PirateGhost",
            "name", "Pirate's Curse",
            "nameZh", "Pirate Curse ZH",
            "subNameZh", "Pirate Curse Variant",
            "rawJson", "{}"
        )));
        when(jdbcTemplate.queryForList(
            contains("FROM items"),
            eq(88L)
        )).thenReturn(List.of(Map.of(
            "id", 88L,
            "image", "http://localhost:9000/terrapedia-images/items/fallback-banner.png"
        )));

        mockMvc.perform(get("/admin/buffs/42"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.immuneNpcSamples", hasSize(2)))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].internalName").value("PirateGhost"))
            .andExpect(jsonPath("$.data.immuneNpcSamples[1].internalName").value("FallbackNpc"))
            .andExpect(jsonPath("$.data.unresolvedImmuneNpcSamples", hasSize(1)))
            .andExpect(jsonPath("$.data.unresolvedImmuneNpcSamples[0].internalName").value("UnknownAlias"));
    }

    @Test
    void shouldResolveImmuneNpcSourceIdThroughGameId() throws Exception {
        Buff buff = new Buff();
        buff.setId(43L);
        buff.setInternalName("SourceIdDebuff");
        buff.setEnglishName("SourceId Debuff");
        buff.setImmuneNpcCount(1);
        buff.setImmuneNpcSampleJson("[{\"sourceId\":480,\"name\":\"Medusa\"}]");

        when(buffMapper.selectById(43L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(
            contains("WHERE deleted = 0 AND game_id IN"),
            eq(480)
        )).thenReturn(List.of(Map.of(
            "npcDbId", 9001L,
            "npcId", 480,
            "internalName", "Medusa",
            "name", "Medusa",
            "nameZh", "Medusa ZH",
            "subNameZh", "Medusa Variant",
            "rawJson", "{}"
        )));

        mockMvc.perform(get("/admin/buffs/43"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.immuneNpcSamples", hasSize(1)))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].internalName").value("Medusa"))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].npcDbId").value(9001))
            .andExpect(jsonPath("$.data.immuneNpcSamples[0].npcId").value(480))
            .andExpect(jsonPath("$.data.unresolvedImmuneNpcSamples", hasSize(0)));
    }

    @Test
    void shouldTreatDuplicateExactGameIdMatchesAsDataIntegrityBlocker() throws Exception {
        Buff buff = new Buff();
        buff.setId(44L);
        buff.setInternalName("DuplicateGameIdDebuff");
        buff.setEnglishName("Duplicate GameId Debuff");
        buff.setImmuneNpcCount(1);
        buff.setImmuneNpcSampleJson("[{\"sourceId\":480,\"name\":\"Medusa\"}]");

        when(buffMapper.selectById(44L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(
            contains("WHERE deleted = 0 AND game_id IN"),
            eq(480)
        )).thenReturn(List.of(
            npcAliasRow(9001L, 480, "Medusa", "Medusa"),
            npcAliasRow(9002L, 480, "MedusaClone", "Medusa")
        ));

        mockMvc.perform(get("/admin/buffs/44"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.immuneNpcSamples", hasSize(0)))
            .andExpect(jsonPath("$.data.unresolvedImmuneNpcSamples", hasSize(1)))
            .andExpect(jsonPath("$.data.unresolvedImmuneNpcSamples[0].resolutionStatus").value("duplicate_exact_game_id"))
            .andExpect(jsonPath("$.data.unresolvedImmuneNpcSamples[0].matchCount").value(2))
            .andExpect(jsonPath("$.data.unresolvedImmuneNpcSamples[0].matchedNpcIds[0]").value(480))
            .andExpect(jsonPath("$.data.unresolvedImmuneNpcSamples[0].matchedNpcIds[1]").value(480))
            .andExpect(jsonPath("$.data.unresolvedImmuneNpcSamples[0].matchedInternalNames[0]").value("Medusa"))
            .andExpect(jsonPath("$.data.unresolvedImmuneNpcSamples[0].matchedInternalNames[1]").value("MedusaClone"));
    }

    @Test
    void shouldTreatDuplicateExactInternalNameMatchesAsDataIntegrityBlocker() throws Exception {
        Buff buff = new Buff();
        buff.setId(45L);
        buff.setInternalName("DuplicateInternalNameDebuff");
        buff.setEnglishName("Duplicate InternalName Debuff");
        buff.setImmuneNpcCount(1);
        buff.setImmuneNpcSampleJson("[{\"internalName\":\"Medusa\",\"name\":\"Medusa\"}]");

        when(buffMapper.selectById(45L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(
            contains("WHERE deleted = 0 AND internal_name IN"),
            eq("Medusa")
        )).thenReturn(List.of(
            npcAliasRow(9001L, 480, "Medusa", "Medusa"),
            npcAliasRow(9002L, 481, "Medusa", "Medusa")
        ));

        mockMvc.perform(get("/admin/buffs/45"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.immuneNpcSamples", hasSize(0)))
            .andExpect(jsonPath("$.data.unresolvedImmuneNpcSamples", hasSize(1)))
            .andExpect(jsonPath("$.data.unresolvedImmuneNpcSamples[0].resolutionStatus").value("duplicate_exact_internal_name"))
            .andExpect(jsonPath("$.data.unresolvedImmuneNpcSamples[0].matchCount").value(2))
            .andExpect(jsonPath("$.data.unresolvedImmuneNpcSamples[0].matchedNpcDbIds[0]").value(9001))
            .andExpect(jsonPath("$.data.unresolvedImmuneNpcSamples[0].matchedNpcDbIds[1]").value(9002));
    }

    @Test
    void shouldReturnNpcsThatInflictBuffFromNpcBuffRelations() throws Exception {
        Buff buff = new Buff();
        buff.setId(156L);
        buff.setSourceId(156);
        buff.setInternalName("Stoned");
        buff.setEnglishName("Stoned");
        buff.setBuffType("debuff");

        when(buffMapper.selectById(156L)).thenReturn(buff);
        when(jdbcTemplate.queryForObject(
            contains("FROM npc_buff_relations"),
            eq(Integer.class),
            eq(156L)
        )).thenReturn(1);
        Map<String, Object> medusaRelation = new java.util.LinkedHashMap<>();
        medusaRelation.put("relationId", 204L);
        medusaRelation.put("npcDbId", 9001L);
        medusaRelation.put("npcId", 480);
        medusaRelation.put("internalName", "Medusa");
        medusaRelation.put("name", "Medusa");
        medusaRelation.put("nameZh", "美杜莎");
        medusaRelation.put("subNameZh", "美杜莎");
        medusaRelation.put("relationType", "inflicts");
        medusaRelation.put("durationTicks", 240);
        medusaRelation.put("durationText", "1-4 seconds");
        medusaRelation.put("notes", "[auto:wiki-crawler-npc-infobox] page=Medusa");
        medusaRelation.put("sortOrder", 0);
        medusaRelation.put("bannerItemId", 164);
        medusaRelation.put("rawJson", "{\"imageUrl\":\"https://cdn.example.com/npcs/Medusa.png\"}");
        when(jdbcTemplate.queryForList(
            contains("FROM npc_buff_relations nbr"),
            eq(156L)
        )).thenReturn(List.of(medusaRelation));

        mockMvc.perform(get("/admin/buffs/156"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.inflictingNpcCount").value(1))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].npcId").value(480))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].internalName").value("Medusa"))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].nameZh").value("美杜莎"))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].relationType").value("inflicts"))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].durationText").value("1-4 seconds"))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].image").value(nullValue()))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].imageUrl").value(nullValue()));
    }

    @Test
    void shouldFormatInflictingNpcWikiDurationTemplateFromNotes() throws Exception {
        Buff buff = new Buff();
        buff.setId(157L);
        buff.setSourceId(157);
        buff.setInternalName("Stoned");
        buff.setEnglishName("Stoned");
        buff.setBuffType("debuff");

        when(buffMapper.selectById(157L)).thenReturn(buff);
        when(jdbcTemplate.queryForObject(
            contains("FROM npc_buff_relations"),
            eq(Integer.class),
            eq(157L)
        )).thenReturn(1);
        Map<String, Object> medusaRelation = new java.util.LinkedHashMap<>();
        medusaRelation.put("relationId", 205L);
        medusaRelation.put("npcDbId", 9001L);
        medusaRelation.put("npcId", 480);
        medusaRelation.put("internalName", "Medusa");
        medusaRelation.put("name", "Medusa");
        medusaRelation.put("relationType", "inflicts");
        medusaRelation.put("notes", "[auto:wiki-crawler-npc-infobox] page=Medusa; duration={{duration|rawseconds=1–4}}");
        medusaRelation.put("sortOrder", 0);
        medusaRelation.put("rawJson", "{}");
        when(jdbcTemplate.queryForList(
            contains("FROM npc_buff_relations nbr"),
            eq(157L)
        )).thenReturn(List.of(medusaRelation));

        mockMvc.perform(get("/admin/buffs/157"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].durationText").value("1-4 秒"))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].rawDurationText").value("{{duration|rawseconds=1–4}}"));
    }
    @Test
    void shouldSuppressWikiImageForInflictingBuffSamples() throws Exception {
        Buff buff = new Buff();
        buff.setId(158L);
        buff.setSourceId(158);
        buff.setInternalName("Poisoned");
        buff.setEnglishName("Poisoned");
        buff.setBuffType("debuff");

        when(buffMapper.selectById(158L)).thenReturn(buff);
        when(jdbcTemplate.queryForObject(
            contains("FROM npc_buff_relations"),
            eq(Integer.class),
            eq(158L)
        )).thenReturn(1);
        Map<String, Object> queenBeeRelation = new java.util.LinkedHashMap<>();
        queenBeeRelation.put("relationId", 206L);
        queenBeeRelation.put("npcDbId", 9002L);
        queenBeeRelation.put("npcId", 222);
        queenBeeRelation.put("internalName", "QueenBee");
        queenBeeRelation.put("name", "Queen Bee");
        queenBeeRelation.put("relationType", "inflicts");
        queenBeeRelation.put("imageUrl", "https://terraria.wiki.gg/images/Queen%20Bee.gif");
        queenBeeRelation.put("notes", "[auto:wiki-crawler-npc-infobox] page=Queen Bee");
        queenBeeRelation.put("sortOrder", 0);
        queenBeeRelation.put("rawJson", "{}");
        when(jdbcTemplate.queryForList(
            contains("FROM npc_buff_relations nbr"),
            eq(158L)
        )).thenReturn(List.of(queenBeeRelation));

        mockMvc.perform(get("/admin/buffs/158"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].image").value(nullValue()))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].imageUrl").value(nullValue()));
    }

    @Test
    void shouldFormatComplexWikiDurationTemplateWithoutTemplateNoise() throws Exception {
        Buff buff = new Buff();
        buff.setId(159L);
        buff.setSourceId(159);
        buff.setInternalName("Poisoned");
        buff.setEnglishName("Poisoned");
        buff.setBuffType("debuff");

        when(buffMapper.selectById(159L)).thenReturn(buff);
        when(jdbcTemplate.queryForObject(
            contains("FROM npc_buff_relations"),
            eq(Integer.class),
            eq(159L)
        )).thenReturn(1);
        Map<String, Object> queenBeeRelation = new java.util.LinkedHashMap<>();
        queenBeeRelation.put("relationId", 207L);
        queenBeeRelation.put("npcDbId", 9002L);
        queenBeeRelation.put("npcId", 222);
        queenBeeRelation.put("internalName", "QueenBee");
        queenBeeRelation.put("name", "Queen Bee");
        queenBeeRelation.put("relationType", "inflicts");
        queenBeeRelation.put(
            "notes",
            "[auto:wiki-crawler-npc-infobox] page=Queen Bee; duration=<!-- -->{{modes|{{duration|10}}|{{duration|rawseconds=2-20}}|{{duration|rawseconds=2.5-25}}}} {{note|small=y|paren=y|{{gameText|ProjectileName.QueenBeeStinger}}}}<br/><!-- -->{{modes|wrap=no|expertonly=y<!-- -->|expert={{expert|{{duration|rawseconds=2-8}}}} {{note|small=y|paren=y|contact}}<!-- -->|master={{master|{{duration|rawseconds=2.5-10}}}} {{note|small=y|paren=y|contact}}<!-- -->}}"
        );
        queenBeeRelation.put("sortOrder", 0);
        queenBeeRelation.put("rawJson", "{}");
        when(jdbcTemplate.queryForList(
            contains("FROM npc_buff_relations nbr"),
            eq(159L)
        )).thenReturn(List.of(queenBeeRelation));

        mockMvc.perform(get("/admin/buffs/159"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].durationText").value(containsString("10")))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].durationText").value(containsString("2-20")))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].durationText").value(containsString("2.5-25")))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].durationText").value(containsString("2-8")))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].durationText").value(containsString("2.5-10")))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].durationText").value(not(containsString("{{"))))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].durationText").value(not(containsString("<!--"))))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].durationText").value(not(containsString("note"))))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].durationText").value(not(containsString("wrap=no"))))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].durationText").value(not(containsString("gameText"))))
            .andExpect(jsonPath("$.data.inflictingNpcSamples[0].durationText").value(not(containsString("ProjectileName"))));
    }

    @Test
    void shouldFallbackSourceItemsFromBuffSourcePageWhenDatabaseLinksAreEmpty() throws Exception {
        Buff buff = new Buff();
        buff.setId(160L);
        buff.setSourceId(159);
        buff.setInternalName("Sharpened");
        buff.setEnglishName("Sharpened");
        buff.setNameZh("锋利");
        buff.setBuffType("buff");
        buff.setSourceItemCount(0);
        buff.setSourceItemsJson("[]");

        when(buffMapper.selectById(160L)).thenReturn(buff);
        when(jdbcTemplate.queryForList(
            contains("FROM buff_source_items bsi"),
            eq(160L)
        )).thenReturn(List.of());
        when(jdbcTemplate.queryForList(
            contains("FROM items"),
            eq("Sharpening Station")
        )).thenReturn(List.of(Map.of(
            "id", 3198L,
            "sourceItemId", 3198,
            "name", "Sharpening Station",
            "nameZh", "利器站",
            "internalName", "SharpeningStation",
            "image", "https://terraria.wiki.gg/images/Sharpening%20Station.png"
        )));

        mockMvc.perform(get("/admin/buffs/160"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.sourceItemCount").value(1))
            .andExpect(jsonPath("$.data.linkedSourceItems[0].internalName").value("SharpeningStation"))
            .andExpect(jsonPath("$.data.linkedSourceItems[0].nameZh").value("利器站"))
            .andExpect(jsonPath("$.data.linkedSourceItems[0].sourcePage").value("Sharpening Station"))
            .andExpect(jsonPath("$.data.linkedSourceItems[0].image").value(nullValue()));
    }

    @Test
    void shouldUseLinkedSourceItemCountForListSearchWhenStoredCountIsZero() throws Exception {
        Buff buff = new Buff();
        buff.setId(161L);
        buff.setSourceId(159);
        buff.setInternalName("Sharpened");
        buff.setEnglishName("Sharpened");
        buff.setNameZh("锋利");
        buff.setBuffType("buff");
        buff.setSourceItemCount(0);
        buff.setSourceItemsJson("[]");

        Page<Buff> page = new Page<>(1, 20);
        page.setRecords(List.of(buff));
        page.setTotal(1);
        when(buffMapper.selectPage(any(Page.class), any())).thenReturn(page);
        when(jdbcTemplate.queryForList(
            contains("FROM buff_source_items bsi"),
            eq(161L)
        )).thenReturn(List.of());
        when(jdbcTemplate.queryForList(
            contains("FROM items"),
            eq("Sharpening Station")
        )).thenReturn(List.of(Map.of(
            "id", 3198L,
            "sourceItemId", 3198,
            "name", "Sharpening Station",
            "nameZh", "利器站",
            "internalName", "SharpeningStation",
            "image", "https://terraria.wiki.gg/images/Sharpening%20Station.png"
        )));

        mockMvc.perform(get("/admin/buffs").param("search", "锋利"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].internalName").value("Sharpened"))
            .andExpect(jsonPath("$.data[0].sourceItemCount").value(1));
    }

    private void invokeSetter(Object target, String setterName, String value) {
        try {
            target.getClass().getMethod(setterName, String.class).invoke(target, value);
        } catch (ReflectiveOperationException ignored) {
            // The red phase intentionally runs before the production field exists.
        }
    }

    private Map<String, Object> npcAliasRow(Long npcDbId, int npcId, String internalName, String name) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("npcDbId", npcDbId);
        row.put("npcId", npcId);
        row.put("internalName", internalName);
        row.put("name", name);
        row.put("nameZh", name + " ZH");
        row.put("subNameZh", name + " Variant");
        row.put("rawJson", "{}");
        return row;
    }
}

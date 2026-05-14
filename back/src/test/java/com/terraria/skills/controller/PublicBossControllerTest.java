package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.entity.BossGroup;
import com.terraria.skills.entity.Npc;
import com.terraria.skills.mapper.BossGroupMapper;
import com.terraria.skills.mapper.NpcMapper;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import com.terraria.skills.service.impl.PublicBossServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class PublicBossControllerTest {

    private static final String MANAGED_BOSS_IMAGE_URL = "http://localhost:9000/terrapedia-images/bosses/king-slime.png";
    private static final String CDN_MANAGED_BOSS_IMAGE_URL = "https://cdn.example.com/terrapedia-images/bosses/king-slime.png";
    private static final String MANAGED_MEMBER_IMAGE_URL = "http://localhost:9000/terrapedia-images/npcs/retinazer.png";
    private static final String MANAGED_LOOT_IMAGE_URL = "http://localhost:9000/terrapedia-images/items/slime-gun.png";
    private static final String WIKI_IMAGE_URL = "https://terraria.wiki.gg/images/King_Slime.png";
    private static final ManagedImageUrlPolicy MANAGED_IMAGE_URL_POLICY = new ManagedImageUrlPolicy() {
        @Override
        public boolean isManagedImageUrl(String value) {
            return value != null && (
                value.startsWith("http://localhost:9000/terrapedia-images/")
                    || value.startsWith("https://cdn.example.com/terrapedia-images/")
            );
        }

        @Override
        public List<String> trustedManagedImageUrlPrefixes() {
            return List.of(
                "http://localhost:9000/terrapedia-images/items/",
                "http://localhost:9000/terrapedia-images/npcs/",
                "http://localhost:9000/terrapedia-images/bosses/",
                "https://cdn.example.com/terrapedia-images/bosses/",
                "https://cdn.example.com/terrapedia-images/npcs/"
            );
        }
    };

    @Mock
    private BossGroupMapper bossGroupMapper;

    @Mock
    private NpcMapper npcMapper;

    @Mock
    private JdbcTemplate jdbcTemplate;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        PublicBossServiceImpl publicBossService = new PublicBossServiceImpl(
            bossGroupMapper,
            npcMapper,
            jdbcTemplate,
            new ObjectMapper(),
            MANAGED_IMAGE_URL_POLICY
        );
        PublicBossController controller = new PublicBossController(publicBossService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldExposePublicBossListWithManagedImagesAndSummaryFields() throws Exception {
        BossGroup kingSlime = bossGroup(34L, "KING_SLIME", "King Slime", "史莱姆王", "PRE_HARDMODE", 1);
        kingSlime.setImageUrl(WIKI_IMAGE_URL);
        kingSlime.setNotes("Slime rain leader");

        Page<BossGroup> page = new Page<>(1, 12);
        page.setTotal(1);
        page.setRecords(List.of(kingSlime));

        when(bossGroupMapper.selectPage(any(Page.class), any())).thenReturn(page);
        when(npcMapper.selectList(any())).thenReturn(List.of(
            npc(201L, 50L, "KingSlime", "King Slime", "史莱姆王", "primary")
        ));
        when(jdbcTemplate.queryForList(
            contains("FROM npc_loot_entries"),
            eq(201L)
        )).thenReturn(List.of(
            lootEntry(2608L, "SlimeGun", "Slime Gun", "史莱姆枪", "direct_boss", WIKI_IMAGE_URL),
            lootEntry(3088L, "RoyalGel", "Royal Gel", "皇家凝胶", "treasure_bag", MANAGED_LOOT_IMAGE_URL)
        ));

        mockMvc.perform(get("/public/bosses")
                .param("page", "1")
                .param("limit", "12")
                .param("search", "slime")
                .param("bossType", "PRE_HARDMODE"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.pagination.total").value(1))
            .andExpect(jsonPath("$.pagination.page").value(1))
            .andExpect(jsonPath("$.pagination.limit").value(12))
            .andExpect(jsonPath("$.data[0].id").value(34))
            .andExpect(jsonPath("$.data[0].code").value("KING_SLIME"))
            .andExpect(jsonPath("$.data[0].name").value("史莱姆王"))
            .andExpect(jsonPath("$.data[0].nameEn").value("King Slime"))
            .andExpect(jsonPath("$.data[0].bossType").value("PRE_HARDMODE"))
            .andExpect(jsonPath("$.data[0].imageUrl", nullValue()))
            .andExpect(jsonPath("$.data[0].memberCount").value(1))
            .andExpect(jsonPath("$.data[0].memberNames", hasItem("史莱姆王")))
            .andExpect(jsonPath("$.data[0].memberSourceMode").value("assigned"))
            .andExpect(jsonPath("$.data[0].lootEntryCount").value(2))
            .andExpect(jsonPath("$.data[0].uniqueLootItemCount").value(2))
            .andExpect(jsonPath("$.data[0].summonMethod").value(containsString("Slime Crown")))
            .andExpect(jsonPath("$.data[0].notes").value("Slime rain leader"))
            .andExpect(jsonPath("$.data[0].status").doesNotExist())
            .andExpect(jsonPath("$.data[0].sourcePage").doesNotExist())
            .andExpect(jsonPath("$.data[0].sourceRevisionTimestamp").doesNotExist())
            .andExpect(jsonPath("$.data[0].createdAt").doesNotExist())
            .andExpect(jsonPath("$.data[0].updatedAt").doesNotExist());

        ArgumentCaptor<String> queryCaptor = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).queryForList(queryCaptor.capture(), eq(201L));
        assertTrue(queryCaptor.getValue().contains("FROM npc_loot_entries nle"));
        assertTrue(queryCaptor.getValue().contains("item_images ii"));
        assertTrue(queryCaptor.getValue().contains("ii.cached_url"));
        assertTrue(queryCaptor.getValue().contains("AS itemImage"));
        assertFalse(queryCaptor.getValue().contains("i.image AS itemImage"));
    }

    @Test
    void shouldExposePublicBossDetailWithReferenceMembersAndManagedImagesOnly() throws Exception {
        String originalUserDir = System.getProperty("user.dir");
        Path tempRoot = Files.createTempDirectory("public-boss-controller-test");
        try {
            Path generatedDir = tempRoot.resolve("data").resolve("generated");
            Files.createDirectories(generatedDir);
            Files.writeString(
                generatedDir.resolve("npc-standardized-map.json"),
                """
                {
                  "records": {
                    "125": {"imageUrl": "http://localhost:9000/terrapedia-images/npcs/retinazer.png"},
                    "126": {"imageUrl": "https://terraria.wiki.gg/images/Spazmatism.png"}
                  }
                }
                """,
                StandardCharsets.UTF_8
            );
            System.setProperty("user.dir", tempRoot.toString());

            BossGroup mechdusa = bossGroup(66L, "MECHDUSA", "Mechdusa", "机械美杜莎", "SPECIAL_SEED", 33);
            mechdusa.setImageUrl(MANAGED_BOSS_IMAGE_URL);
            mechdusa.setNotes("Special-seed composite boss");

            when(bossGroupMapper.selectById(eq(66L))).thenReturn(mechdusa);
            when(bossGroupMapper.selectList(any())).thenReturn(List.of(
                bossGroup(10L, "THE_TWINS", "The Twins", "双子魔眼", "HARDMODE", 10)
            ));
            when(npcMapper.selectList(any())).thenReturn(
                List.of(),
                List.of(
                    npc(101L, 125L, "Retinazer", "Retinazer", "激光眼", "primary"),
                    npc(102L, 126L, "Spazmatism", "Spazmatism", "魔焰眼", "part")
                )
            );

            mockMvc.perform(get("/public/bosses/66"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.id").value(66))
                .andExpect(jsonPath("$.data.code").value("MECHDUSA"))
                .andExpect(jsonPath("$.data.imageUrl").value(MANAGED_BOSS_IMAGE_URL))
                .andExpect(jsonPath("$.data.memberSourceMode").value("reference"))
                .andExpect(jsonPath("$.data.memberCount").value(2))
                .andExpect(jsonPath("$.data.members.length()").value(0))
                .andExpect(jsonPath("$.data.referenceMembers.length()").value(2))
                .andExpect(jsonPath("$.data.referenceMembers[0].sourceBossCode").value("THE_TWINS"))
                .andExpect(jsonPath("$.data.referenceMembers[0].imageUrl").value(MANAGED_MEMBER_IMAGE_URL))
                .andExpect(jsonPath("$.data.referenceMembers[1].imageUrl", nullValue()))
                .andExpect(jsonPath("$.data.lootEntries.length()").value(0))
                .andExpect(jsonPath("$.data.directLootCount").value(0))
                .andExpect(jsonPath("$.data.treasureBagLootCount").value(0))
                .andExpect(jsonPath("$.data.uniqueLootItemCount").value(0))
                .andExpect(jsonPath("$.data.summonMethod").value(containsString("Ocram's Razor")))
                .andExpect(jsonPath("$.data.notes").value("Special-seed composite boss"))
                .andExpect(jsonPath("$.data.status").doesNotExist())
                .andExpect(jsonPath("$.data.sourcePage").doesNotExist())
                .andExpect(jsonPath("$.data.sourceRevisionTimestamp").doesNotExist())
                .andExpect(jsonPath("$.data.createdAt").doesNotExist())
                .andExpect(jsonPath("$.data.updatedAt").doesNotExist());
        } finally {
            System.setProperty("user.dir", originalUserDir);
        }
    }

    @Test
    void shouldReturn404WhenBossDoesNotExist() throws Exception {
        when(bossGroupMapper.selectById(eq(404L))).thenReturn(null);

        mockMvc.perform(get("/public/bosses/404"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.statusCode").value(404))
            .andExpect(jsonPath("$.message").value("Boss not found"));
    }

    @Test
    void shouldAllowConfiguredCdnBossImages() throws Exception {
        BossGroup boss = bossGroup(88L, "KING_SLIME", "King Slime", "鍙茶幈濮嗙帇", "PRE_HARDMODE", 1);
        boss.setImageUrl(CDN_MANAGED_BOSS_IMAGE_URL);

        when(bossGroupMapper.selectById(eq(88L))).thenReturn(boss);
        when(npcMapper.selectList(any())).thenReturn(List.of());

        mockMvc.perform(get("/public/bosses/88"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.imageUrl").value(CDN_MANAGED_BOSS_IMAGE_URL));
    }

    private BossGroup bossGroup(Long id, String code, String nameEn, String nameZh, String bossType, int progressionOrder) {
        BossGroup bossGroup = new BossGroup();
        bossGroup.setId(id);
        bossGroup.setCode(code);
        bossGroup.setNameEn(nameEn);
        bossGroup.setNameZh(nameZh);
        bossGroup.setBossType(bossType);
        bossGroup.setProgressionOrder(progressionOrder);
        bossGroup.setStatus(1);
        return bossGroup;
    }

    private Npc npc(Long id, Long gameId, String internalName, String name, String nameZh, String bossRole) {
        Npc npc = new Npc();
        npc.setId(id);
        npc.setGameId(gameId);
        npc.setInternalName(internalName);
        npc.setName(name);
        npc.setNameZh(nameZh);
        npc.setBossRole(bossRole);
        npc.setIsBoss(true);
        npc.setStatus(1);
        return npc;
    }

    private Map<String, Object> lootEntry(Long itemId, String itemInternalName, String itemName, String itemNameZh, String dropSourceKind, String itemImage) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("id", itemId + 1000);
        entry.put("itemId", itemId);
        entry.put("itemInternalName", itemInternalName);
        entry.put("itemName", itemName);
        entry.put("itemNameZh", itemNameZh);
        entry.put("dropSourceKind", dropSourceKind);
        entry.put("chanceValue", BigDecimal.valueOf(0.125));
        entry.put("chanceText", "12.5%");
        entry.put("itemImage", itemImage);
        return entry;
    }
}

package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.entity.BossGroup;
import com.terraria.skills.entity.Npc;
import com.terraria.skills.mapper.BossGroupMapper;
import com.terraria.skills.mapper.NpcMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.anyOf;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AdminBossControllerTest {

    @Mock
    private BossGroupMapper bossGroupMapper;

    @Mock
    private NpcMapper npcMapper;

    @Mock
    private JdbcTemplate jdbcTemplate;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        AdminBossController controller = new AdminBossController(bossGroupMapper, npcMapper, new ObjectMapper(), jdbcTemplate);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldExposeReferenceMemberModeForCompositeBossInList() throws Exception {
        BossGroup mechdusa = bossGroup(66L, "MECHDUSA", "Mechdusa", "机械美杜莎", "SPECIAL_SEED", 33);
        Page<BossGroup> page = new Page<>(1, 100);
        page.setTotal(1);
        page.setRecords(List.of(mechdusa));

        when(bossGroupMapper.selectPage(any(Page.class), any())).thenReturn(page);
        when(bossGroupMapper.selectList(any())).thenReturn(List.of(
            bossGroup(10L, "THE_TWINS", "The Twins", "双子魔眼", "HARDMODE", 10),
            bossGroup(11L, "THE_DESTROYER", "The Destroyer", "毁灭者", "HARDMODE", 11),
            bossGroup(12L, "SKELETRON_PRIME", "Skeletron Prime", "机械骷髅王", "HARDMODE", 12)
        ));
        when(npcMapper.selectList(any())).thenReturn(
            List.of(),
            List.of(
                npc(101L, 125L, "Retinazer", "Retinazer", "激光眼", "primary"),
                npc(102L, 126L, "Spazmatism", "Spazmatism", "魔焰眼", "part")
            ),
            List.of(npc(103L, 134L, "TheDestroyer", "The Destroyer", "毁灭者", "primary")),
            List.of(
                npc(104L, 127L, "SkeletronPrime", "Skeletron Prime", "机械骷髅王", "primary"),
                npc(105L, 128L, "PrimeCannon", "Prime Cannon", "机械炮", "part"),
                npc(106L, 129L, "PrimeSaw", "Prime Saw", "机械锯", "part"),
                npc(107L, 130L, "PrimeVice", "Prime Vice", "机械钳", "part"),
                npc(108L, 131L, "PrimeLaser", "Prime Laser", "机械激光", "part")
            )
        );

        mockMvc.perform(get("/admin/bosses").param("page", "1").param("limit", "100"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].code").value("MECHDUSA"))
            .andExpect(jsonPath("$.data[0].memberSourceMode").value("reference"))
            .andExpect(jsonPath("$.data[0].memberCount").value(8))
            .andExpect(jsonPath("$.data[0].memberNames", hasItem("激光眼")));
    }

    @Test
    void shouldReturnReferenceMembersWithImagesForMechdusaDetail() throws Exception {
        BossGroup mechdusa = bossGroup(66L, "MECHDUSA", "Mechdusa", "机械美杜莎", "SPECIAL_SEED", 33);

        when(bossGroupMapper.selectById(eq(66L))).thenReturn(mechdusa);
        when(bossGroupMapper.selectList(any())).thenReturn(List.of(
            bossGroup(10L, "THE_TWINS", "The Twins", "双子魔眼", "HARDMODE", 10),
            bossGroup(11L, "THE_DESTROYER", "The Destroyer", "毁灭者", "HARDMODE", 11),
            bossGroup(12L, "SKELETRON_PRIME", "Skeletron Prime", "机械骷髅王", "HARDMODE", 12)
        ));
        when(npcMapper.selectList(any())).thenReturn(
            List.of(),
            List.of(
                npc(101L, 125L, "Retinazer", "Retinazer", "激光眼", "primary"),
                npc(102L, 126L, "Spazmatism", "Spazmatism", "魔焰眼", "part")
            ),
            List.of(npc(103L, 134L, "TheDestroyer", "The Destroyer", "毁灭者", "primary")),
            List.of(
                npc(104L, 127L, "SkeletronPrime", "Skeletron Prime", "机械骷髅王", "primary"),
                npc(105L, 128L, "PrimeCannon", "Prime Cannon", "机械炮", "part"),
                npc(106L, 129L, "PrimeSaw", "Prime Saw", "机械锯", "part"),
                npc(107L, 130L, "PrimeVice", "Prime Vice", "机械钳", "part"),
                npc(108L, 131L, "PrimeLaser", "Prime Laser", "机械激光", "part")
            ),
            List.of(),
            List.of(
                npc(101L, 125L, "Retinazer", "Retinazer", "激光眼", "primary"),
                npc(102L, 126L, "Spazmatism", "Spazmatism", "魔焰眼", "part")
            ),
            List.of(npc(103L, 134L, "TheDestroyer", "The Destroyer", "毁灭者", "primary")),
            List.of(
                npc(104L, 127L, "SkeletronPrime", "Skeletron Prime", "机械骷髅王", "primary"),
                npc(105L, 128L, "PrimeCannon", "Prime Cannon", "机械炮", "part"),
                npc(106L, 129L, "PrimeSaw", "Prime Saw", "机械锯", "part"),
                npc(107L, 130L, "PrimeVice", "Prime Vice", "机械钳", "part"),
                npc(108L, 131L, "PrimeLaser", "Prime Laser", "机械激光", "part")
            )
        );

        mockMvc.perform(get("/admin/bosses/66"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.memberSourceMode").value("reference"))
            .andExpect(jsonPath("$.data.memberCount").value(8))
            .andExpect(jsonPath("$.data.referenceMembers[*].sourceBossCode", hasItem("THE_TWINS")))
            .andExpect(jsonPath(
                "$.data.referenceMembers[?(@.internalName == 'Retinazer')].imageUrl",
                hasItem(anyOf(containsString("Retinazer"), containsString("terrapedia-images")))
            ));
    }

    @Test
    void shouldExposeLootStatsForDirectBossInList() throws Exception {
        BossGroup kingSlime = bossGroup(34L, "KING_SLIME", "King Slime", "史莱姆王", "PRE_HARDMODE", 1);
        Page<BossGroup> page = new Page<>(1, 100);
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
            lootEntry(2608L, "SlimeGun", "Slime Gun", "史莱姆枪", "direct_boss"),
            lootEntry(3088L, "RoyalGel", "Royal Gel", "皇家凝胶", "treasure_bag"),
            lootEntry(2608L, "SlimeGun", "Slime Gun", "史莱姆枪", "treasure_bag")
        ));

        mockMvc.perform(get("/admin/bosses").param("page", "1").param("limit", "100"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].code").value("KING_SLIME"))
            .andExpect(jsonPath("$.data[0].summonMethod", containsString("Slime Crown")))
            .andExpect(jsonPath("$.data[0].lootEntryCount").value(3))
            .andExpect(jsonPath("$.data[0].uniqueLootItemCount").value(2))
            .andExpect(jsonPath("$.data[0].lootOwnerNpcId").value(201))
            .andExpect(jsonPath("$.data[0].lootOwnerNpcName").value("史莱姆王"));
    }

    @Test
    void shouldReturnLootEntriesAndOwnerForBossDetail() throws Exception {
        BossGroup moonLord = bossGroup(51L, "MOON_LORD", "Moon Lord", "月亮领主", "HARDMODE", 18);

        when(bossGroupMapper.selectById(eq(51L))).thenReturn(moonLord);
        when(npcMapper.selectList(any())).thenReturn(List.of(
            npc(464L, 398L, "MoonLordCore", "Moon Lord's Core", "月亮领主心脏", "primary"),
            npc(463L, 397L, "MoonLordHand", "Moon Lord's Hand", "月亮领主手", "part")
        ));
        when(jdbcTemplate.queryForList(
            contains("FROM npc_loot_entries"),
            eq(464L)
        )).thenReturn(List.of(
            lootEntry(3383L, "Terrarian", "Terrarian", "泰拉悠悠球", "direct_boss"),
            lootEntry(3381L, "PortalGun", "Portal Gun", "传送枪", "direct_boss"),
            lootEntry(3381L, "PortalGun", "Portal Gun", "传送枪", "treasure_bag")
        ));

        mockMvc.perform(get("/admin/bosses/51"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.summonMethod", containsString("Celestial Sigil")))
            .andExpect(jsonPath("$.data.lootOwnerNpc.id").value(464))
            .andExpect(jsonPath("$.data.lootOwnerNpc.internalName").value("MoonLordCore"))
            .andExpect(jsonPath("$.data.lootEntries[0].dropSourceKind").value("direct_boss"))
            .andExpect(jsonPath("$.data.directLootCount").value(2))
            .andExpect(jsonPath("$.data.treasureBagLootCount").value(1))
            .andExpect(jsonPath("$.data.uniqueLootItemCount").value(2));
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

    private Map<String, Object> lootEntry(Long itemId, String itemInternalName, String itemName, String itemNameZh, String dropSourceKind) {
        return Map.of(
            "itemId", itemId,
            "itemInternalName", itemInternalName,
            "itemName", itemName,
            "itemNameZh", itemNameZh,
            "dropSourceKind", dropSourceKind
        );
    }
}

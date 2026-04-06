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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.hamcrest.Matchers.hasItem;
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

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        AdminBossController controller = new AdminBossController(bossGroupMapper, npcMapper, new ObjectMapper());
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
            .andExpect(jsonPath("$.data.referenceMembers[?(@.internalName == 'Retinazer')].imageUrl", hasItem("https://terraria.wiki.gg/images/Retinazer.png?51913f")));
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
}

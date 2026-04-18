package com.terraria.skills.service;

import com.terraria.skills.dto.TownNpcOverviewDTO;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class TownNpcMaintenanceDomainMapperTest {

    @Test
    void shouldProjectWikiAssetsAndBaseStatsIntoStableMaintenanceContracts() {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", 1L);
        row.put("gameId", 22L);
        row.put("name", "Guide");
        row.put("nameZh", "向导");
        row.put("isTownNpc", true);
        row.put("baseStats", Map.of(
            "lifeMax", 250,
            "damage", 10,
            "defense", 30,
            "knockBackResist", 0
        ));
        row.put("wikiDetails", Map.of(
            "spriteImage", "/sprite.png",
            "mapIconImage", "/icon.png",
            "dialogPortraitImage", "/portrait.png"
        ));

        TownNpcOverviewDTO overview = TownNpcMaintenanceDomainMapper.toOverview(
            true,
            "wiki-town-npc-maintenance.latest.json",
            "reports/wiki-town-npc-maintenance.latest.json",
            "2026-04-18T10:00:00Z",
            Map.of(),
            "2026-04-18T09:55:00Z",
            "wiki",
            false,
            null,
            null,
            null,
            Map.of(),
            Map.of("gold", "/gold.png"),
            List.of(row),
            Map.of("totalTownNpcs", 1)
        );

        assertEquals(1, overview.getRecords().size());
        assertEquals("Guide", overview.getRecords().get(0).getName());
        assertEquals("/sprite.png", overview.getRecords().get(0).getWikiAssets().getSpriteImage());
        assertEquals(250, overview.getRecords().get(0).getBaseStats().getLifeMax());
        assertNotNull(overview.getRecords().get(0).getWikiDetails());
    }
}

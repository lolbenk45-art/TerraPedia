package com.terraria.skills.dto;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class CrawlerAutomationOverviewDTOTest {

    @Test
    void normalizesMyBatisNullProjectionColumnsAtTheDtoBoundary() {
        CrawlerAutomationOverviewDTO.DomainSummary summary =
            new CrawlerAutomationOverviewDTO.DomainSummary(
                "buffs",
                "L2",
                "ACTIVE",
                "run-1",
                "COMMITTED",
                "2026-10-11T19:05:00",
                (Object) null,
                (Object) null
            );

        assertEquals("buffs", summary.domainId());
        assertEquals("2026-10-11T19:05:00", summary.lastRunCompletedAt());
        assertEquals(java.util.List.of(), summary.activeAlerts());
        assertEquals(java.util.List.of(), summary.disabledReasons());
    }
}

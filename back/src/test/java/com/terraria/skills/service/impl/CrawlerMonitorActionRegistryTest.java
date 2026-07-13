package com.terraria.skills.service.impl;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CrawlerMonitorActionRegistryTest {

    @Test
    void shouldExposeTheExistingApprovedActionsWithoutChangingCommands() {
        CrawlerMonitorActionRegistry registry = CrawlerMonitorActionRegistry.defaults();

        assertEquals(List.of(
            "wiki-items-refresh",
            "wiki-npcs-refresh",
            "wiki-projectiles-refresh",
            "buff-page-immunity-refresh",
            "domain-source-armor-sets",
            "recipe-reference-sync",
            "biome-sync",
            "domain-source-bosses",
            "domain-source-town-npc-maintenance",
            "domain-source-shimmer",
            "npc-loot-backfill",
            "boss-loot-backfill"
        ), registry.all().stream().map(CrawlerMonitorActionDefinition::actionId).toList());

        CrawlerMonitorActionDefinition townNpc = registry.require(
            "town_npc_maintenance",
            "domain-source-town-npc-maintenance"
        );
        assertTrue(townNpc.resumeSupported());
        assertEquals(
            "data/generated/resume/domain-source-town-npc-maintenance.resume.json",
            townNpc.resumeStatePath()
        );
        assertEquals(
            List.of(
                "node",
                "scripts/data/fetch/fetch-wiki-town-npc-maintenance.mjs",
                "--progress-path=data/generated/domain-source-town-npc-maintenance-progress.latest.json"
            ),
            townNpc.command()
        );
        assertEquals(List.of("town_npc_maintenance"), townNpc.coveredDomains());

        CrawlerMonitorActionDefinition npcLoot = registry.require("npc_loot", "npc-loot-backfill");
        assertTrue(npcLoot.backendRefresh());
        assertFalse(npcLoot.wikiDomain());
    }

    @Test
    void shouldRenderAttemptScopedProgressWithoutChangingTheStoredV1Template() {
        CrawlerMonitorActionDefinition bosses = CrawlerMonitorActionRegistry.defaults()
            .require("bosses", "domain-source-bosses");

        assertEquals(
            List.of(
                "node",
                "scripts/data/fetch/fetch-wiki-bosses.mjs",
                "--progress-path=reports/crawler-monitor/v2/2026-07-11/attempt-1/progress.json"
            ),
            bosses.renderCommand(
                "reports/crawler-monitor/v2/2026-07-11/attempt-1/report.json",
                "reports/crawler-monitor/v2/2026-07-11/attempt-1/progress.json"
            )
        );
        assertEquals(
            "data/generated/domain-source-bosses-progress.latest.json",
            bosses.progressPath()
        );
    }

    @Test
    void directActionMustAllowNullReportPathWhenItsCommandHasNoReportPlaceholder() {
        CrawlerMonitorActionDefinition bosses = CrawlerMonitorActionRegistry.defaults()
            .require("bosses", "domain-source-bosses");

        assertEquals(
            List.of(
                "node",
                "scripts/data/fetch/fetch-wiki-bosses.mjs",
                "--progress-path=reports/crawler-monitor/v2/attempt-1/progress.json"
            ),
            bosses.renderCommand(null, "reports/crawler-monitor/v2/attempt-1/progress.json")
        );
    }

    @Test
    void backendActionMustRejectMissingReportPathWhenItsCommandNeedsThePlaceholder() {
        CrawlerMonitorActionDefinition items = CrawlerMonitorActionRegistry.defaults()
            .require("items", "wiki-items-refresh");

        assertThrows(
            IllegalArgumentException.class,
            () -> items.renderCommand(null, "reports/crawler-monitor/v2/attempt-1/progress.json")
        );
        assertThrows(
            IllegalArgumentException.class,
            () -> items.renderCommand(" ", "reports/crawler-monitor/v2/attempt-1/progress.json")
        );
    }

    @Test
    void shouldExposeFixtureOnlyOutsideTheApprovedProductionActionSet() {
        CrawlerMonitorActionRegistry registry = CrawlerMonitorActionRegistry.defaults();

        assertFalse(registry.all().stream()
            .map(CrawlerMonitorActionDefinition::actionId)
            .anyMatch("crawler-queue-v2-fixture"::equals));
        assertThrows(
            IllegalArgumentException.class,
            () -> registry.require("crawler_queue_v2_fixture", "crawler-queue-v2-fixture")
        );

        CrawlerMonitorActionDefinition fixture = CrawlerMonitorActionRegistry.fixture();

        assertEquals("crawler_queue_v2_fixture", fixture.domain());
        assertEquals("crawler-queue-v2-fixture", fixture.actionId());
        assertEquals(
            List.of(
                "node",
                "scripts/data/monitor/crawler-queue-v2-fixture.mjs",
                "--progress-path=<progressPath>",
                "--heartbeats=20",
                "--interval-ms=250"
            ),
            fixture.command()
        );
    }
}

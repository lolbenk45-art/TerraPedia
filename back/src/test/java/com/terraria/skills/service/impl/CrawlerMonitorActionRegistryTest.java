package com.terraria.skills.service.impl;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CrawlerMonitorActionRegistryTest {

    @Test
    void autoDispatchDomainsIncludeOnlyTheGovernedPreviewSet() {
        assertEquals(
            Set.of("items", "npcs", "projectiles", "armor_sets", "buffs"),
            CrawlerMonitorActionRegistry.AUTO_DISPATCH_DOMAINS
        );
        assertFalse(CrawlerMonitorActionRegistry.AUTO_DISPATCH_DOMAINS.contains("audio"));
        assertFalse(CrawlerMonitorActionRegistry.AUTO_DISPATCH_DOMAINS.contains("bosses"));
        assertFalse(CrawlerMonitorActionRegistry.AUTO_DISPATCH_DOMAINS.contains("boss_loot"));
    }

    @Test
    void exposesTwentyFiveOperationsWithBackendOwnedSemanticsAndExtensibleResumeCapability() {
        CrawlerMonitorActionRegistry registry = CrawlerMonitorActionRegistry.defaults();

        assertEquals(27, registry.all().size());
        assertEquals(List.of("check", "force", "verify", "sample"), registry.operations("items").stream()
            .map(CrawlerMonitorActionDefinition::operationId)
            .toList());
        assertEquals("check", registry.requireDefaultOperation("items").operationId());
        assertEquals(
            "destructive",
            registry.requireOperation("items", "force").confirmationLevel()
        );
        assertEquals(
            "write",
            registry.requireOperation("npc_loot", "apply").databaseAccess()
        );
        assertTrue(registry.requireOperation("bosses", "fresh").resumeSupported());
        assertFalse(registry.requireOperation("armor_sets", "fresh").resumeSupported());
        assertTrue(registry.requireOperation("buffs", "fresh").command()
            .contains("--manifest-path=data/generated/wiki-source-manifest.latest.json"));
        assertTrue(registry.requireOperation("armor_sets", "fresh").command()
            .contains("--manifest-path=data/generated/wiki-source-manifest.latest.json"));
        assertEquals(
            List.of("buffs", "bosses", "town_npc_maintenance"),
            registry.all().stream()
                .filter(CrawlerMonitorActionDefinition::resumeSupported)
                .map(CrawlerMonitorActionDefinition::domain)
                .toList()
        );
    }

    @Test
    void resolvesOnlyUnambiguousStartsAndEnforcesDestructiveConfirmation() {
        CrawlerMonitorActionRegistry registry = CrawlerMonitorActionRegistry.defaults();

        assertThrows(
            IllegalArgumentException.class,
            () -> registry.resolveStartOperation("items", null, false)
        );
        assertEquals(
            "fresh",
            registry.resolveStartOperation("bosses", null, false).operationId()
        );
        assertThrows(
            IllegalArgumentException.class,
            () -> registry.resolveStartOperation("items", "force", false)
        );
        assertEquals(
            "wiki-items-force-refresh",
            registry.resolveStartOperation("items", "force", true).actionId()
        );
    }

    @Test
    void shouldExposeTheApprovedOperationActionsAndKeepHistoricalIdsResolvable() {
        CrawlerMonitorActionRegistry registry = CrawlerMonitorActionRegistry.defaults();

        assertEquals(List.of(
            "wiki-items-refresh",
            "wiki-items-force-refresh",
            "item-image-source-verification",
            "crawler-queue-v2-items-fixture",
            "wiki-npcs-refresh",
            "wiki-npcs-force-refresh",
            "wiki-projectiles-refresh",
            "wiki-projectiles-force-refresh",
            "buff-page-immunity-refresh",
            "domain-source-armor-sets",
            "recipe-reference-sync",
            "recipe-reference-apply",
            "biome-preview",
            "biome-sync",
            "domain-source-bosses",
            "domain-source-town-npc-maintenance",
            "domain-source-shimmer",
            "wiki-audio-assets-refresh",
            "wiki-audio-assets-import",
            "npc-loot-backfill",
            "npc-loot-apply",
            "boss-loot-backfill",
            "boss-loot-apply",
            "item-group-canonical-preview",
            "item-group-canonical-apply",
            "npc-crawler-facts-preview",
            "npc-crawler-facts-apply"
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

        CrawlerMonitorActionDefinition itemImageVerification = registry.require(
            "items", "item-image-source-verification"
        );
        assertTrue(itemImageVerification.backendRefresh());
        assertTrue(itemImageVerification.wikiDomain());
        assertTrue(itemImageVerification.networkAccess());
        assertFalse(itemImageVerification.resumeSupported());
        assertFalse(itemImageVerification.defaultOperation());
        assertEquals("verify", itemImageVerification.operationId());
        assertEquals("none", itemImageVerification.databaseAccess());
        assertEquals("fresh", itemImageVerification.restartBehavior());
        assertEquals(9L, itemImageVerification.estimatedRequests());

        CrawlerMonitorActionDefinition itemsSample = registry.requireOperation("items", "sample");
        assertEquals("crawler-queue-v2-items-fixture", itemsSample.actionId());
        assertEquals("模拟物品爬取（真实样本）", itemsSample.labelZh());
        assertFalse(itemsSample.defaultOperation());
        assertFalse(itemsSample.networkAccess());
        assertEquals("none", itemsSample.databaseAccess());
        assertEquals(0L, itemsSample.estimatedRequests());
        assertEquals(3L, itemsSample.estimatedRecords());

        CrawlerMonitorActionDefinition itemGroupPreview = registry.require(
            "item_groups", "item-group-canonical-preview"
        );
        assertTrue(itemGroupPreview.backendRefresh());
        assertEquals("read", itemGroupPreview.databaseAccess());
        assertEquals("preview", itemGroupPreview.operationId());
        assertEquals("summary", itemGroupPreview.confirmationLevel());

        CrawlerMonitorActionDefinition itemGroupApply = registry.require(
            "item_groups", "item-group-canonical-apply"
        );
        assertTrue(itemGroupApply.backendRefresh());
        assertEquals("write", itemGroupApply.databaseAccess());
        assertEquals("apply", itemGroupApply.operationId());
        assertEquals("destructive", itemGroupApply.confirmationLevel());

        CrawlerMonitorActionDefinition npcFactApply = registry.require(
            "npc_crawler_facts", "npc-crawler-facts-apply"
        );
        assertTrue(npcFactApply.backendRefresh());
        assertEquals("write", npcFactApply.databaseAccess());
        assertEquals("apply", npcFactApply.operationId());
    }

    @Test
    void allFifteenRegisteredDomainsRenderAnAttemptScopedLaunchCommand() {
        CrawlerMonitorActionRegistry registry = CrawlerMonitorActionRegistry.defaults();
        String base = "reports/crawler-monitor/v2/2026-07-14/attempt-test/";
        String progressPath = base + "progress.json";

        assertEquals(List.of(
            "items",
            "npcs",
            "projectiles",
            "buffs",
            "armor_sets",
            "recipes",
            "biomes",
            "bosses",
            "town_npc_maintenance",
            "shimmer",
            "audio",
            "npc_loot",
            "boss_loot",
            "item_groups",
            "npc_crawler_facts"
        ), registry.all().stream().map(CrawlerMonitorActionDefinition::domain).distinct().toList());

        for (CrawlerMonitorActionDefinition action : registry.all()) {
            String reportPath = action.backendRefresh() ? base + "report.json" : null;
            List<String> command = action.renderCommand(
                reportPath,
                progressPath,
                action.defaultResumeMode()
            );

            assertFalse(command.isEmpty(), action.actionId());
            assertTrue(command.stream().noneMatch(token -> token.contains("<reportPath>")), action.actionId());
            assertTrue(command.stream().noneMatch(token -> token.contains("<progressPath>")), action.actionId());
            assertTrue(command.stream().noneMatch(token ->
                token.startsWith("--progress-path=")
                    && !token.equals("--progress-path=" + progressPath)
            ), action.actionId());
            if (action.backendRefresh()) {
                assertTrue(command.contains("--output=" + reportPath), action.actionId());
            }
        }
    }

    @Test
    void shouldRenderAttemptScopedProgressWithoutChangingTheStoredV1Template() {
        CrawlerMonitorActionDefinition bosses = CrawlerMonitorActionRegistry.defaults()
            .require("bosses", "domain-source-bosses");

        assertEquals(
            List.of(
                "node",
                "scripts/data/automation/prepare-supplementary-domain-l1-preview.mjs",
                "--domain=bosses",
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
    void resumableActionMustRenderTheEffectiveResumeContract() {
        CrawlerMonitorActionDefinition bosses = CrawlerMonitorActionRegistry.defaults()
            .require("bosses", "domain-source-bosses");

        assertEquals(
            List.of(
                "node",
                "scripts/data/automation/prepare-supplementary-domain-l1-preview.mjs",
                "--domain=bosses",
                "--progress-path=reports/crawler-monitor/v2/attempt-1/progress.json",
                "--resume-mode=auto",
                "--resume-state=data/generated/resume/domain-source-bosses.resume.json"
            ),
            bosses.renderCommand(null, "reports/crawler-monitor/v2/attempt-1/progress.json", "auto")
        );
    }

    @Test
    void nonResumableActionMustRejectResumeModesOtherThanFresh() {
        CrawlerMonitorActionDefinition shimmer = CrawlerMonitorActionRegistry.defaults()
            .require("shimmer", "domain-source-shimmer");

        assertThrows(
            IllegalArgumentException.class,
            () -> shimmer.renderCommand(null, "reports/crawler-monitor/v2/attempt-1/progress.json", "auto")
        );
    }

    @Test
    void supplementaryOperationsUseTheGovernedL1PreviewPipeline() {
        CrawlerMonitorActionDefinition shimmer = CrawlerMonitorActionRegistry.defaults()
            .require("shimmer", "domain-source-shimmer");
        CrawlerMonitorActionDefinition audio = CrawlerMonitorActionRegistry.defaults()
            .require("audio", "wiki-audio-assets-refresh");

        assertEquals(
            List.of(
                "node",
                "scripts/data/automation/prepare-supplementary-domain-l1-preview.mjs",
                "--domain=shimmer",
                "--progress-path=reports/crawler-monitor/v2/attempt-1/progress.json"
            ),
            shimmer.renderCommand(null, "reports/crawler-monitor/v2/attempt-1/progress.json", "fresh")
        );
        assertNull(shimmer.estimatedRequests());
        assertFalse(audio.backendRefresh());
        assertEquals("data/generated/wiki-audio-assets-progress.latest.json", audio.progressPath());
        assertEquals(
            List.of(
                "node",
                "scripts/data/automation/prepare-supplementary-domain-l1-preview.mjs",
                "--domain=audio",
                "--progress-path=reports/crawler-monitor/v2/attempt-1/progress.json"
            ),
            audio.renderCommand(null, "reports/crawler-monitor/v2/attempt-1/progress.json", "fresh")
        );
    }

    @Test
    void directActionMustAllowNullReportPathWhenItsCommandHasNoReportPlaceholder() {
        CrawlerMonitorActionDefinition bosses = CrawlerMonitorActionRegistry.defaults()
            .require("bosses", "domain-source-bosses");

        assertEquals(
            List.of(
                "node",
                "scripts/data/automation/prepare-supplementary-domain-l1-preview.mjs",
                "--domain=bosses",
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
    void shouldKeepOnlyTheHeartbeatFixtureOutsideTheApprovedProductionActionSet() {
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

        CrawlerMonitorActionDefinition itemsSample = registry.require(
            "items",
            "crawler-queue-v2-items-fixture"
        );
        assertEquals(
            List.of(
                "node",
                "scripts/data/monitor/crawler-queue-v2-items-fixture.mjs",
                "--items-input=data/standardized/items.standardized.json",
                "--progress-path=<progressPath>",
                "--output-path=<progressPath>.items-sample.json"
            ),
            itemsSample.command()
        );
    }
}

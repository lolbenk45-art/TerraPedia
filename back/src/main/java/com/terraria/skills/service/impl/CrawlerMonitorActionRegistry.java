package com.terraria.skills.service.impl;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;

@Component
public class CrawlerMonitorActionRegistry {

    private static final String TOWN_NPC_RESUME =
        "data/generated/resume/domain-source-town-npc-maintenance.resume.json";
    private static final String BUFF_RESUME =
        "data/generated/resume/buff-page-immunity-refresh.resume.json";
    private static final String BOSS_RESUME =
        "data/generated/resume/domain-source-bosses.resume.json";

    private final List<CrawlerMonitorActionDefinition> actions;

    public CrawlerMonitorActionRegistry() {
        this(defaultActions());
    }

    CrawlerMonitorActionRegistry(List<CrawlerMonitorActionDefinition> actions) {
        this.actions = List.copyOf(actions);
    }

    public static CrawlerMonitorActionRegistry defaults() {
        return new CrawlerMonitorActionRegistry(defaultActions());
    }

    public List<CrawlerMonitorActionDefinition> all() {
        return actions;
    }

    public CrawlerMonitorActionDefinition require(String domain, String actionId) {
        String normalizedDomain = normalize(domain);
        String normalizedAction = normalize(actionId);
        return actions.stream()
            .filter(action -> normalize(action.domain()).equals(normalizedDomain))
            .filter(action -> normalize(action.actionId()).equals(normalizedAction))
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException(
                "未登记爬虫动作：domain=" + domain + ", actionId=" + actionId
            ));
    }

    private static List<CrawlerMonitorActionDefinition> defaultActions() {
        return List.of(
            backend("items", "Items", "wiki.module.iteminfo", "Module:Iteminfo/data", "wiki-items-refresh", true),
            backend("npcs", "NPCs", "wiki.module.npcinfo", "Module:Npcinfo/data", "wiki-npcs-refresh", true),
            backend("projectiles", "Projectiles", "wiki.module.projectileinfo", "Module:Projectileinfo/data", "wiki-projectiles-refresh", true),
            resumableDirect(
                "buffs",
                "Buffs",
                "wiki.page.template_getbuffinfo",
                "Template:GetBuffInfo",
                "buff-page-immunity-refresh",
                "data/generated/fetch-wiki-buffs-progress.latest.json",
                List.of(
                    "node",
                    "scripts/data/fetch/fetch-wiki-buffs.mjs",
                    "--progress-path=data/generated/fetch-wiki-buffs-progress.latest.json"
                ),
                BUFF_RESUME
            ),
            direct(
                "armor_sets",
                "Armor sets",
                "wiki.module.armorsetbonuses",
                "Module:ArmorSetBonuses",
                "domain-source-armor-sets",
                "data/generated/domain-source-armor-sets-progress.latest.json",
                List.of(
                    "node",
                    "scripts/data/fetch/fetch-wiki-armorsetbonuses.mjs",
                    "--progress-path=data/generated/domain-source-armor-sets-progress.latest.json"
                )
            ),
            backend("recipes", "Recipes", "wiki.zh.recipes", "zh recipe source coverage", "recipe-reference-sync", true),
            backend("biomes", "Biomes", "wiki.page.biomes_anchor", "Forest", "biome-sync", true),
            resumableDirect(
                "bosses",
                "Bosses",
                "wiki.domain.bosses",
                "Boss source snapshot pages",
                "domain-source-bosses",
                "data/generated/domain-source-bosses-progress.latest.json",
                List.of(
                    "node",
                    "scripts/data/fetch/fetch-wiki-bosses.mjs",
                    "--progress-path=data/generated/domain-source-bosses-progress.latest.json"
                ),
                BOSS_RESUME
            ),
            resumableDirect(
                "town_npc_maintenance",
                "Town NPC maintenance",
                "wiki.domain.town_npc_maintenance",
                "Town NPC maintenance source page",
                "domain-source-town-npc-maintenance",
                "data/generated/domain-source-town-npc-maintenance-progress.latest.json",
                List.of(
                    "node",
                    "scripts/data/fetch/fetch-wiki-town-npc-maintenance.mjs",
                    "--progress-path=data/generated/domain-source-town-npc-maintenance-progress.latest.json"
                ),
                TOWN_NPC_RESUME
            ),
            direct(
                "shimmer",
                "Shimmer",
                "wiki.domain.shimmer",
                "Shimmer source page",
                "domain-source-shimmer",
                "data/generated/domain-source-shimmer-progress.latest.json",
                List.of(
                    "node",
                    "scripts/data/fetch/fetch-wiki-shimmer-page.mjs",
                    "--progress-path=data/generated/domain-source-shimmer-progress.latest.json"
                )
            ),
            backend("npc_loot", "NPC loot backfill", "npc.loot.backfill", "normal NPC loot import report", "npc-loot-backfill", false),
            backend("boss_loot", "Boss loot backfill", "boss.loot.backfill", "boss loot import report", "boss-loot-backfill", false)
        );
    }

    private static CrawlerMonitorActionDefinition backend(
        String domain,
        String label,
        String sourceKey,
        String locator,
        String actionId,
        boolean wikiDomain
    ) {
        return new CrawlerMonitorActionDefinition(
            domain,
            label,
            sourceKey,
            locator,
            actionId,
            "reports/backend-refresh/history/<run>.runtime/" + actionId + ".child-status.json",
            List.of(
                "node",
                "scripts/data/workflow/run-backend-data-refresh.mjs",
                "--mode=apply",
                "--steps=" + actionId,
                "--output=<reportPath>"
            ),
            true,
            wikiDomain,
            false,
            "fresh",
            null,
            "fresh"
        );
    }

    private static CrawlerMonitorActionDefinition direct(
        String domain,
        String label,
        String sourceKey,
        String locator,
        String actionId,
        String progressPath,
        List<String> command
    ) {
        return new CrawlerMonitorActionDefinition(
            domain,
            label,
            sourceKey,
            locator,
            actionId,
            progressPath,
            command,
            false,
            true,
            false,
            "fresh",
            null,
            "fresh"
        );
    }

    private static CrawlerMonitorActionDefinition resumableDirect(
        String domain,
        String label,
        String sourceKey,
        String locator,
        String actionId,
        String progressPath,
        List<String> command,
        String resumeStatePath
    ) {
        return new CrawlerMonitorActionDefinition(
            domain,
            label,
            sourceKey,
            locator,
            actionId,
            progressPath,
            command,
            false,
            true,
            true,
            "fresh",
            resumeStatePath,
            "resume-dispatch"
        );
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}

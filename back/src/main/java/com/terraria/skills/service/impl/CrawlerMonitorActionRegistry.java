package com.terraria.skills.service.impl;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;
import java.util.Set;

@Component
public class CrawlerMonitorActionRegistry {

    /**
     * The single source of truth for which crawler domains the scheduler is
     * allowed to auto-dispatch under changed-only automation. This is the
     * "auto-ingestion set": {@code isAutoEligibleRule} in the monitor service
     * and the scheduler-activation preflight both key off this set, so the
     * enablement gate covers exactly the domains the scheduler will actually
     * act on — no wider (which would block on domains it never touches) and no
     * narrower (which would let an uncovered domain slip past the gate).
     *
     * <p>Deliberately narrow. Expanding it is a governance decision: any domain
     * added here must have a fresh, passing domain-acceptance panel before the
     * preflight will report it eligible.
     */
    public static final Set<String> AUTO_DISPATCH_DOMAINS = Set.of(
        "items",
        "npcs",
        "projectiles",
        "armor_sets",
        "buffs",
        "audio",
        "bosses",
        "shimmer"
    );

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

    public List<CrawlerMonitorActionDefinition> defaultOperations() {
        return actions.stream()
            .filter(CrawlerMonitorActionDefinition::defaultOperation)
            .toList();
    }

    public List<CrawlerMonitorActionDefinition> operations(String domain) {
        String normalizedDomain = normalize(domain);
        return actions.stream()
            .filter(action -> normalize(action.domain()).equals(normalizedDomain))
            .toList();
    }

    public CrawlerMonitorActionDefinition requireOperation(String domain, String operationId) {
        String normalizedOperation = normalize(operationId);
        return operations(domain).stream()
            .filter(action -> normalize(action.operationId()).equals(normalizedOperation))
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException(
                "未登记域操作：domain=" + domain + ", operationId=" + operationId
            ));
    }

    public CrawlerMonitorActionDefinition requireDefaultOperation(String domain) {
        List<CrawlerMonitorActionDefinition> domainOperations = operations(domain);
        if (domainOperations.isEmpty()) {
            throw new IllegalArgumentException("未登记爬虫域：domain=" + domain);
        }
        List<CrawlerMonitorActionDefinition> defaults = domainOperations.stream()
            .filter(CrawlerMonitorActionDefinition::defaultOperation)
            .toList();
        if (defaults.size() != 1) {
            throw new IllegalArgumentException("爬虫域默认操作不唯一：domain=" + domain);
        }
        return defaults.get(0);
    }

    public CrawlerMonitorActionDefinition resolveStartOperation(
        String domain,
        String operationId,
        boolean confirmed
    ) {
        List<CrawlerMonitorActionDefinition> domainOperations = operations(domain);
        if (domainOperations.isEmpty()) {
            throw new IllegalArgumentException("未登记爬虫域：domain=" + domain);
        }
        CrawlerMonitorActionDefinition operation;
        if (operationId == null || operationId.isBlank()) {
            if (domainOperations.size() != 1) {
                throw new IllegalArgumentException("当前域包含多个操作，必须指定 operationId：domain=" + domain);
            }
            operation = domainOperations.get(0);
        } else {
            operation = requireOperation(domain, operationId);
        }
        if ("destructive".equals(operation.confirmationLevel()) && !confirmed) {
            throw new IllegalArgumentException("当前操作需要二次确认：operationId=" + operation.operationId());
        }
        return operation;
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

    public CrawlerMonitorActionDefinition requireDomain(String domain) {
        return requireDefaultOperation(domain);
    }

    /**
     * A deliberately unregistered action used only by the isolated V2 smoke
     * harness. Keeping it out of {@link #all()} preserves the approved list
     * of production crawler actions.
     */
    public static CrawlerMonitorActionDefinition fixture() {
        return new CrawlerMonitorActionDefinition(
            "crawler_queue_v2_fixture",
            "Crawler queue V2 fixture",
            "fixture.crawler.queue.v2",
            "no-network fixture",
            "crawler-queue-v2-fixture",
            "<progressPath>",
            List.of(
                "node",
                "scripts/data/monitor/crawler-queue-v2-fixture.mjs",
                "--progress-path=<progressPath>",
                "--heartbeats=20",
                "--interval-ms=250"
            ),
            false,
            false,
            false,
            "fresh",
            null,
            "fresh"
        );
    }

    private static CrawlerMonitorActionDefinition itemsSample() {
        return new CrawlerMonitorActionDefinition(
            "items",
            "模拟物品爬取（真实样本）",
            "fixture.items.standardized",
            "data/standardized/items.standardized.json",
            "crawler-queue-v2-items-fixture",
            "<progressPath>",
            List.of(
                "node",
                "scripts/data/monitor/crawler-queue-v2-items-fixture.mjs",
                "--items-input=data/standardized/items.standardized.json",
                "--progress-path=<progressPath>",
                "--output-path=<progressPath>.items-sample.json"
            ),
            false,
            false,
            false,
            "fresh",
            null,
            "fresh",
            "sample",
            "direct_crawl",
            "fresh",
            "读取最多三条真实标准化物品记录，模拟完整 V2 任务状态与产物链路。",
            false,
            "仅写入当前 attempt 的进度、日志和样本 JSON",
            "none",
            0L,
            3L,
            true,
            false,
            "summary",
            false
        );
    }

    private static List<CrawlerMonitorActionDefinition> defaultActions() {
        return List.of(
            baseAutomatic(
                "items", "检查物品模块更新", "wiki.module.iteminfo", "Module:Iteminfo/data",
                "wiki-items-refresh", "check", "check_sync", "check",
                "检查 Wiki 模块 revision，仅在变化或缺少本地文件时抓取。",
                "按需更新来源并执行冻结输入 dry-run", "read", 1L,
                "data/generated/domain-source-items-progress.latest.json", null
            ),
            backend(
                "items", "强制重抓物品模块", "wiki.module.iteminfo", "Module:Iteminfo/data",
                "wiki-items-force-refresh", "force", "check_sync", "force",
                "跳过 revision 未变化判断，重新访问并覆盖约定输出。",
                "覆盖物品模块来源和标准化文件", "none", 1L, false,
                "destructive", false, true, true
            ),
            backend(
                "items", "核验未解析物品图片来源", "wiki.item.image_source_verification",
                "Frozen unresolved item image identity set",
                "item-image-source-verification", "verify", "direct_crawl", "fresh",
                "仅核验冻结列表中的未解析物品图片来源。",
                "写入图片来源核验证据和进度", "none", 9L, false,
                "summary", false, true, true
            ),
            itemsSample(),
            baseAutomatic(
                "npcs", "检查 NPC 模块更新", "wiki.module.npcinfo", "Module:Npcinfo/data",
                "wiki-npcs-refresh", "check", "check_sync", "check",
                "检查 NPC 信息模块 revision；这不是逐 NPC 页面抓取。",
                "按需更新 NPC 来源并执行 activation-gated 入库", "write", 1L,
                "data/generated/domain-source-npcs-progress.latest.json", null
            ),
            backend(
                "npcs", "强制重抓 NPC 模块", "wiki.module.npcinfo", "Module:Npcinfo/data",
                "wiki-npcs-force-refresh", "force", "check_sync", "force",
                "跳过 revision 未变化判断，重新访问 NPC 信息模块。",
                "覆盖 NPC 模块来源文件", "none", 1L, false,
                "destructive", false, true, true
            ),
            baseAutomatic(
                "projectiles", "检查射弹模块更新", "wiki.module.projectileinfo", "Module:Projectileinfo/data",
                "wiki-projectiles-refresh", "check", "check_sync", "check",
                "检查射弹信息模块 revision，仅在需要时抓取。",
                "按需更新来源并执行冻结输入 dry-run", "read", 1L,
                "data/generated/domain-source-projectiles-progress.latest.json", null
            ),
            backend(
                "projectiles", "强制重抓射弹模块", "wiki.module.projectileinfo", "Module:Projectileinfo/data",
                "wiki-projectiles-force-refresh", "force", "check_sync", "force",
                "跳过 revision 未变化判断，重新访问射弹信息模块。",
                "覆盖射弹模块来源文件", "none", 1L, false,
                "destructive", false, true, true
            ),
            baseAutomatic(
                "buffs",
                "重新抓取 Buff 数据",
                "wiki.page.template_getbuffinfo",
                "Template:GetBuffInfo",
                "buff-page-immunity-refresh",
                "fresh",
                "direct_crawl",
                "fresh",
                "抓取 Buff 模板和免疫相关页面，并保留数据级断点。",
                "更新 Buff 来源、解析结果、报告和断点文件",
                "write",
                null,
                "data/generated/fetch-wiki-buffs-progress.latest.json",
                BUFF_RESUME
            ),
            baseAutomatic(
                "armor_sets",
                "重新抓取盔甲套装模块",
                "wiki.module.armorsetbonuses",
                "Module:ArmorSetBonuses",
                "domain-source-armor-sets",
                "fresh",
                "direct_crawl",
                "fresh",
                "直接重新抓取一个 Armor Set Bonuses 模块。",
                "更新盔甲套装来源、标准化文件和报告",
                "write",
                1L,
                "data/generated/domain-source-armor-sets-progress.latest.json",
                null
            ),
            backend(
                "recipes", "预览配方关系差异", "wiki.zh.recipes", "本地物品和配方关系来源",
                "recipe-reference-sync", "preview", "data_process", "preview",
                "生成配方关系并执行数据库 dry-run，不正式写入。",
                "写入配方关系包和差异报告", "read", null, false,
                "summary", true, true, false
            ),
            backend(
                "recipes", "正式同步配方关系", "wiki.zh.recipes", "本地物品和配方关系来源",
                "recipe-reference-apply", "apply", "data_process", "apply",
                "生成配方关系并通过既有导入链正式写入数据库。",
                "写入配方关系包、导入结果和审计报告", "write", null, false,
                "destructive", false, true, false
            ),
            backend(
                "biomes", "预览群系同步", "wiki.page.biomes_anchor", "Terraria Wiki 群系页面",
                "biome-preview", "preview", "data_process", "preview",
                "抓取并转换群系数据，但不执行数据库 import。",
                "更新群系来源、转换文件和预览报告", "none", null, false,
                "summary", true, true, true
            ),
            backend(
                "biomes", "抓取并正式写入群系", "wiki.page.biomes_anchor", "Terraria Wiki 群系页面",
                "biome-sync", "apply", "data_process", "apply",
                "抓取、转换群系数据并通过既有 pipeline 正式写库。",
                "更新群系来源、转换文件和导入报告", "write", null, false,
                "destructive", false, true, true
            ),
            resumableDirect(
                "bosses",
                "重新抓取 Boss 页面",
                "wiki.bosses.catalog",
                "Boss source snapshot pages",
                "domain-source-bosses",
                "fresh",
                "direct_crawl",
                "fresh",
                "逐页抓取 Boss 数据，并保留数据级断点。",
                "更新 Boss 来源、报告和断点文件",
                "data/generated/domain-source-bosses-progress.latest.json",
                List.of(
                    "node",
                    "scripts/data/automation/run-supplementary-domain-automatic-operation.mjs",
                    "--domain=bosses",
                    "--manifest-path=data/generated/wiki-source-manifest.latest.json",
                    "--progress-path=data/generated/domain-source-bosses-progress.latest.json"
                ),
                BOSS_RESUME
            ),
            resumableDirect(
                "town_npc_maintenance",
                "重新抓取 Town NPC 页面",
                "wiki.domain.town_npc_maintenance",
                "Town NPC maintenance source page",
                "domain-source-town-npc-maintenance",
                "fresh",
                "direct_crawl",
                "fresh",
                "逐页抓取 Town NPC maintenance 数据，并保留数据级断点。",
                "更新 Town NPC 来源和断点文件",
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
                "生成 Shimmer 内容寻址数据包",
                "wiki.shimmer.page_and_langlinks",
                "Shimmer source page",
                "domain-source-shimmer",
                "fresh",
                "direct_crawl",
                "fresh",
                "抓取、解析并校验一个完整的 Shimmer 内容寻址 generation。",
                "更新 Shimmer generation pointer、原始证据和报告",
                null,
                false,
                "data/generated/domain-source-shimmer-progress.latest.json",
                List.of(
                    "node",
                    "scripts/data/automation/run-supplementary-domain-automatic-operation.mjs",
                    "--domain=shimmer",
                    "--manifest-path=data/generated/wiki-source-manifest.latest.json",
                    "--progress-path=data/generated/domain-source-shimmer-progress.latest.json"
                )
            ),
            direct(
                "audio",
                "抓取音频并生成 L1 冻结预览",
                "wiki.audio_assets.catalog",
                "Terraria Wiki 音频文件",
                "wiki-audio-assets-refresh",
                "fresh",
                "direct_crawl",
                "fresh",
                "抓取音频资源并生成需要 Owner 批准的 L1 frozen bundle。",
                "更新音频来源、进度和 L1 预览证据",
                null,
                false,
                "data/generated/wiki-audio-assets-progress.latest.json",
                List.of(
                    "node",
                    "scripts/data/automation/run-supplementary-domain-automatic-operation.mjs",
                    "--domain=audio",
                    "--manifest-path=data/generated/wiki-source-manifest.latest.json",
                    "--progress-path=data/generated/wiki-audio-assets-progress.latest.json"
                )
            ),
            backend(
                "audio", "写入音频资源到数据库", "wiki.audio_assets.catalog", "Terraria Wiki 音频文件",
                "wiki-audio-assets-import", "apply", "data_process", "apply",
                "将已抓取的音频资源元数据正式写入数据库。",
                "更新音频资源入库结果和审计报告", "write", null, false,
                "destructive", false, false, false
            ),
            backend(
                "npc_loot", "预览普通 NPC 掉落差异", "npc.loot.backfill", "普通 NPC 掉落来源和数据库",
                "npc-loot-backfill", "preview", "backfill", "preview",
                "读取真实来源和数据库，生成普通 NPC 掉落 dry-run 报告。",
                "写入普通 NPC 掉落差异报告", "read", null, false,
                "summary", true, false, false
            ),
            backend(
                "npc_loot", "正式写入普通 NPC 掉落", "npc.loot.backfill", "普通 NPC 掉落来源和数据库",
                "npc-loot-apply", "apply", "backfill", "apply",
                "通过既有 import lane 正式写入普通 NPC 掉落。",
                "写入导入结果和审计报告", "write", null, false,
                "destructive", false, false, false
            ),
            backend(
                "boss_loot", "预览 Boss 掉落差异", "boss.loot.backfill", "Boss 掉落来源和数据库",
                "boss-loot-backfill", "preview", "backfill", "preview",
                "读取真实来源和数据库，生成 Boss 掉落 dry-run 报告。",
                "写入 Boss 掉落差异报告", "read", null, false,
                "summary", true, false, false
            ),
            backend(
                "boss_loot", "正式写入 Boss 掉落", "boss.loot.backfill", "Boss 掉落来源和数据库",
                "boss-loot-apply", "apply", "backfill", "apply",
                "通过既有 import lane 正式写入 Boss 掉落。",
                "写入导入结果和审计报告", "write", null, false,
                "destructive", false, false, false
            ),
            backend(
                "item_groups", "预览规范物品组入库", "canonical.item_groups",
                "规范物品组 landing、maint、relation 和 local projection",
                "item-group-canonical-preview", "preview", "data_process", "preview",
                "校验并冻结来源派生物品组差异，不写入数据库。",
                "写入规范物品组预览和进度证据", "read", null, false,
                "summary", true, false, false
            ),
            backend(
                "item_groups", "正式写入规范物品组", "canonical.item_groups",
                "规范物品组 landing、maint、relation 和 local projection",
                "item-group-canonical-apply", "apply", "data_process", "apply",
                "通过受治理执行器写入来源派生物品组及 projection state。",
                "写入规范物品组、快照、审计和进度证据", "write", null, false,
                "destructive", false, false, false
            ),
            backend(
                "npc_crawler_facts", "预览 NPC crawler facts 入库", "canonical.npc_crawler_facts",
                "NPC base landing、crawler fact landing 与 maint/relation/local projection",
                "npc-crawler-facts-preview", "preview", "data_process", "preview",
                "校验并冻结 NPC crawler facts 差异，不运行 crawler、不写入数据库。",
                "写入 NPC crawler facts 预览和进度证据", "read", null, false,
                "summary", true, false, false
            ),
            backend(
                "npc_crawler_facts", "正式写入 NPC crawler facts", "canonical.npc_crawler_facts",
                "NPC base landing、crawler fact landing 与 maint/relation/local projection",
                "npc-crawler-facts-apply", "apply", "data_process", "apply",
                "通过受治理执行器写入已冻结且审核通过的 NPC crawler facts。",
                "写入 NPC crawler facts、快照、审计和进度证据", "write", null, false,
                "destructive", false, false, false
            )
        );
    }

    private static CrawlerMonitorActionDefinition backend(
        String domain,
        String label,
        String sourceKey,
        String locator,
        String actionId,
        String operationId,
        String category,
        String mode,
        String descriptionZh,
        String fileWriteSummary,
        String databaseAccess,
        Long estimatedRequests,
        boolean shortTask,
        String confirmationLevel,
        boolean defaultOperation,
        boolean wikiDomain,
        boolean networkAccess
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
            "fresh",
            operationId,
            category,
            mode,
            descriptionZh,
            networkAccess,
            fileWriteSummary,
            databaseAccess,
            estimatedRequests,
            null,
            shortTask,
            true,
            confirmationLevel,
            defaultOperation
        );
    }

    private static CrawlerMonitorActionDefinition direct(
        String domain,
        String label,
        String sourceKey,
        String locator,
        String actionId,
        String operationId,
        String category,
        String mode,
        String descriptionZh,
        String fileWriteSummary,
        Long estimatedRequests,
        boolean shortTask,
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
            "fresh",
            operationId,
            category,
            mode,
            descriptionZh,
            true,
            fileWriteSummary,
            "none",
            estimatedRequests,
            null,
            shortTask,
            true,
            "summary",
            true
        );
    }

    private static CrawlerMonitorActionDefinition baseAutomatic(
        String domain,
        String label,
        String sourceKey,
        String locator,
        String actionId,
        String operationId,
        String category,
        String mode,
        String descriptionZh,
        String fileWriteSummary,
        String databaseAccess,
        Long estimatedRequests,
        String progressPath,
        String resumeStatePath
    ) {
        boolean backendRefresh = Set.of("items", "npcs", "projectiles").contains(domain);
        String effectiveProgressPath = backendRefresh
            ? "reports/backend-refresh/history/<run>.runtime/" + actionId + ".child-status.json"
            : progressPath;
        List<String> command = backendRefresh
            ? List.of(
                "node",
                "scripts/data/automation/run-base-domain-automatic-operation.mjs",
                "--domain=" + domain,
                "--manifest-path=data/generated/wiki-source-manifest.latest.json",
                "--output=<reportPath>"
            )
            : List.of(
                "node",
                "scripts/data/automation/run-base-domain-automatic-operation.mjs",
                "--domain=" + domain,
                "--manifest-path=data/generated/wiki-source-manifest.latest.json",
                "--progress-path=" + effectiveProgressPath
            );
        return new CrawlerMonitorActionDefinition(
            domain,
            label,
            sourceKey,
            locator,
            actionId,
            effectiveProgressPath,
            command,
            backendRefresh,
            true,
            resumeStatePath != null,
            "fresh",
            resumeStatePath,
            resumeStatePath == null ? "fresh" : "resume-dispatch",
            operationId,
            category,
            mode,
            descriptionZh,
            true,
            fileWriteSummary,
            databaseAccess,
            estimatedRequests,
            null,
            false,
            true,
            "summary",
            true
        );
    }

    private static CrawlerMonitorActionDefinition resumableDirect(
        String domain,
        String label,
        String sourceKey,
        String locator,
        String actionId,
        String operationId,
        String category,
        String mode,
        String descriptionZh,
        String fileWriteSummary,
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
            "resume-dispatch",
            operationId,
            category,
            mode,
            descriptionZh,
            true,
            fileWriteSummary,
            "none",
            null,
            null,
            false,
            true,
            "summary",
            true
        );
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}

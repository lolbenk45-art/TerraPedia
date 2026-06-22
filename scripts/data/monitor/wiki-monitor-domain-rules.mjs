export const WIKI_MONITOR_DOMAIN_RULES = [
  rule(
    'items',
    'Items',
    'wiki.module.iteminfo',
    'Module:Iteminfo/data',
    'wiki-core-refresh',
    backendProgress('wiki-core-refresh'),
    ['node', 'scripts/data/workflow/run-backend-data-refresh.mjs', '--mode=apply', '--steps=wiki-core-refresh', '--output=<reportPath>']
  ),
  rule(
    'npcs',
    'NPCs',
    'wiki.module.npcinfo',
    'Module:Npcinfo/data',
    'wiki-core-refresh',
    backendProgress('wiki-core-refresh'),
    ['node', 'scripts/data/workflow/run-backend-data-refresh.mjs', '--mode=apply', '--steps=wiki-core-refresh', '--output=<reportPath>']
  ),
  rule(
    'projectiles',
    'Projectiles',
    'wiki.module.projectileinfo',
    'Module:Projectileinfo/data',
    'wiki-core-refresh',
    backendProgress('wiki-core-refresh'),
    ['node', 'scripts/data/workflow/run-backend-data-refresh.mjs', '--mode=apply', '--steps=wiki-core-refresh', '--output=<reportPath>']
  ),
  rule(
    'buffs',
    'Buffs',
    'wiki.page.template_getbuffinfo',
    'Template:GetBuffInfo',
    'buff-page-immunity-refresh',
    'data/generated/fetch-wiki-buffs-progress.latest.json',
    ['node', 'scripts/data/fetch/fetch-wiki-buffs.mjs', '--progress-path=data/generated/fetch-wiki-buffs-progress.latest.json']
  ),
  rule(
    'armor_sets',
    'Armor sets',
    'wiki.module.armorsetbonuses',
    'Module:ArmorSetBonuses',
    'domain-source-armor-sets',
    'data/generated/domain-source-armor-sets-progress.latest.json',
    ['node', 'scripts/data/fetch/fetch-wiki-armorsetbonuses.mjs', '--progress-path=data/generated/domain-source-armor-sets-progress.latest.json']
  ),
  rule(
    'recipes',
    'Recipes',
    'wiki.zh.recipes',
    'zh recipe source coverage',
    'recipe-reference-sync',
    backendProgress('recipe-reference-sync'),
    ['node', 'scripts/data/workflow/run-backend-data-refresh.mjs', '--mode=apply', '--steps=recipe-reference-sync', '--output=<reportPath>']
  ),
  rule(
    'biomes',
    'Biomes',
    'wiki.page.biomes_anchor',
    'Forest',
    'biome-sync',
    backendProgress('biome-sync'),
    ['node', 'scripts/data/workflow/run-backend-data-refresh.mjs', '--mode=apply', '--steps=biome-sync', '--output=<reportPath>']
  ),
  rule(
    'bosses',
    'Bosses',
    'wiki.domain.bosses',
    'Boss source snapshot pages',
    'domain-source-bosses',
    'data/generated/domain-source-bosses-progress.latest.json',
    ['node', 'scripts/data/fetch/fetch-wiki-bosses.mjs', '--progress-path=data/generated/domain-source-bosses-progress.latest.json']
  ),
  rule(
    'town_npc_maintenance',
    'Town NPC maintenance',
    'wiki.domain.town_npc_maintenance',
    'Town NPC maintenance source page',
    'domain-source-town-npc-maintenance',
    'data/generated/domain-source-town-npc-maintenance-progress.latest.json',
    ['node', 'scripts/data/fetch/fetch-wiki-town-npc-maintenance.mjs', '--progress-path=data/generated/domain-source-town-npc-maintenance-progress.latest.json']
  ),
  rule(
    'shimmer',
    'Shimmer',
    'wiki.domain.shimmer',
    'Shimmer source page',
    'domain-source-shimmer',
    'data/generated/domain-source-shimmer-progress.latest.json',
    ['node', 'scripts/data/fetch/fetch-wiki-shimmer-page.mjs', '--progress-path=data/generated/domain-source-shimmer-progress.latest.json']
  )
];

export function buildWikiMonitorDomains({ sourceState = {}, dispatches = [] } = {}) {
  const sources = Array.isArray(sourceState.sources) ? sourceState.sources : [];
  const sourceByKey = new Map(sources.map((source) => [source.key, source]));
  const dispatchByDomain = new Map(
    (Array.isArray(dispatches) ? dispatches : [])
      .filter((dispatch) => dispatch?.domain)
      .map((dispatch) => [dispatch.domain, dispatch])
  );

  return WIKI_MONITOR_DOMAIN_RULES.map((ruleEntry) => {
    const source = sourceByKey.get(ruleEntry.sourceKey) ?? null;
    const dispatch = dispatchByDomain.get(ruleEntry.domain) ?? null;
    const changed = Boolean(source?.changed);
    const status = dispatch?.status ?? (source ? (changed ? 'changed' : 'unchanged') : 'unknown');

    return {
      ...ruleEntry,
      status,
      changed,
      lastCheckedAt: source?.checkedAt ?? sourceState.checkedAt ?? null,
      currentValue: source?.currentValue ?? null,
      previousValue: source?.previousValue ?? null,
      message: dispatch?.message ?? (changed ? 'changed source awaiting approval' : source ? 'no upstream change detected' : 'source state missing')
    };
  });
}

export function resolveWikiMonitorAction(domain, actionId) {
  const ruleEntry = WIKI_MONITOR_DOMAIN_RULES.find((entry) => entry.domain === domain);
  if (!ruleEntry || ruleEntry.recommendedActionId !== actionId) {
    throw new Error(`Action ${actionId} is not allowed for domain ${domain}`);
  }
  return ruleEntry;
}

function rule(domain, label, sourceKey, locator, recommendedActionId, progressPath, command) {
  return {
    domain,
    label,
    sourceKey,
    locator,
    actionId: recommendedActionId,
    recommendedActionId,
    progressPath,
    command,
    requiresApproval: true,
    autoEligible: false,
    dispatchMode: 'manual',
    cooldownMinutes: 30,
    maxConcurrent: 1,
    failureCircuitBreaker: 'disabled until auto dispatch is enabled',
    lastAutoRunAt: null,
    pauseReason: null
  };
}

function backendProgress(actionId) {
  return `reports/backend-refresh/history/<run>.runtime/${actionId}.child-status.json`;
}

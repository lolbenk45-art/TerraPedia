#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);

const PANEL_ALIASES = {
  source: 'sourceReadiness',
  relation: 'relationReadiness',
  image: 'imageReadiness',
  public: 'publicReadiness',
  blocking: 'blockingGate',
};

const BLOCKING_GATE_COUNTER_KEYS = [
  'blockedCount',
  'blockingCount',
  'duplicateCount',
  'unresolvedCount',
  'driftCount',
  'mismatchCount',
  'conflictCount',
  'invalidCount',
  'errorCount',
];

const DOMAIN_ACCEPTANCE_BASELINES = {
  recipeProviderConsolidation: {
    suppressedOverlapRecipeRows: 134,
    gapOnlyResultItems: 3059,
    gapOnlyRecipeRows: 6751,
  },
  recipeProviderSuppression: {
    candidateCount: 245,
  },
  recipeSourceCoverage: {
    suppressedButPresentCount: 2557,
  },
  itemGroupSourceAudit: {
    duplicateGroupKeys: 29,
    blockedGroupReferences: 1,
    consumerOnlyReferences: 0,
  },
  projectileImageBackfill: {
    unresolvedZh: 105,
  },
};

const ARMOR_DEFINITION_PLACEHOLDER_EXCEPTIONS = new Map([
  [244, { name: '雨具盔甲', itemIds: [1135, 1136], reason: 'wiki display set without Module:ArmorSetBonuses definition' }],
  [273, { name: '钴盔甲', itemIds: [372, 374, 375], reason: 'wiki display set represented by Cobalt class-specific bonus definitions' }],
  [275, { name: '秘银盔甲', itemIds: [377, 379, 380], reason: 'wiki display set represented by Mythril class-specific bonus definitions' }],
  [277, { name: '精金盔甲', itemIds: [401, 403, 404], reason: 'wiki display set represented by Adamantite class-specific bonus definitions' }],
  [291, { name: '甲虫盔甲', itemIds: [2199, 2200, 2202], reason: 'wiki display set represented by Beetle Damage/Defense bonus definitions' }],
  [292, { name: '蘑菇矿盔甲', itemIds: [1546, 1549, 1550], reason: 'wiki display set without Module:ArmorSetBonuses definition' }],
  [293, { name: '幽灵盔甲', itemIds: [1504, 1505, 2189], reason: 'wiki display set represented by Spectre Healing/Damage bonus definitions' }],
  [313, { name: '空桶', itemIds: [205], reason: 'nonstandard single-piece equipped display' }],
  [314, { name: '护目镜', itemIds: [37], reason: 'nonstandard single-piece equipped display' }],
  [315, { name: '绿帽', itemIds: [867], reason: 'nonstandard single-piece equipped display' }],
  [316, { name: '潜水头盔', itemIds: [268], reason: 'nonstandard single-piece equipped display' }],
  [317, { name: '夜视头盔', itemIds: [3109], reason: 'nonstandard single-piece equipped display' }],
  [318, { name: '维京海盗头盔', itemIds: [879], reason: 'nonstandard single-piece equipped display' }],
  [320, { name: '小雪怪皮毛外套', itemIds: [5068], reason: 'nonstandard single-piece equipped display' }],
  [321, { name: '稽古衣', itemIds: [2277], reason: 'nonstandard single-piece equipped display' }],
  [322, { name: '神灵诅咒', itemIds: [3770], reason: 'nonstandard single-piece equipped display' }],
  [323, { name: '月亮领主腿', itemIds: [5001], reason: 'nonstandard single-piece equipped display' }],
]);

const KNOWN_BUFF_REQUIRED_FIELD_GAP_KEYS = new Set([
  '138:MinecartLegacyUnused',
  '167:MinecartMechLegacyUnused',
  '185:MinecartWoodLegacyUnused',
  '209:DesertMinecartLegacyUnused',
  '211:FishMinecartLegacyUnused',
  '221:BeeMinecartLegacyUnused',
  '223:LadybugMinecartLegacyUnused',
  '225:PigronMinecartLegacyUnused',
  '227:SunflowerMinecartLegacyUnused',
  '229:HellMinecartLegacyUnused',
  '232:ShroomMinecartLegacyUnused',
  '234:AmethystMinecartLegacyUnused',
  '236:TopazMinecartLegacyUnused',
  '238:SapphireMinecartLegacyUnused',
  '240:EmeraldMinecartLegacyUnused',
  '242:RubyMinecartLegacyUnused',
  '244:DiamondMinecartLegacyUnused',
  '246:AmberMinecartLegacyUnused',
  '248:BeetleMinecartLegacyUnused',
  '250:MeowmereMinecartLegacyUnused',
  '252:PartyMinecartLegacyUnused',
  '254:PirateMinecartLegacyUnused',
  '256:SteampunkMinecartLegacyUnused',
  '270:CoffinMinecartLegacyUnused',
  '273:DiggingMoleMinecartLegacyUnused',
  '307:BlandWhipEnemyDebuff',
  '309:SwordWhipNPCDebuff',
  '310:ScytheWhipEnemyDebuff',
  '313:FlameWhipEnemyDebuff',
  '315:ThornWhipNPCDebuff',
  '316:RainbowWhipNPCDebuff',
  '319:MaceWhipNPCDebuff',
  '326:BoneWhipNPCDebuff',
  '337:TentacleSpike',
  '339:FartMinecartLegacyUnused',
  '340:CoolWhipNPCDebuff',
  '347:TerraFartMinecartLegacyUnused',
  '357:CobWhipNPCDebuff',
  '358:CorruptWhipNPCDebuff',
  '359:CrimsonWhipNPCDebuff',
  '360:MeteorWhipNPCDebuff',
  '361:FlowerWhipNPCDebuff',
  '362:EelWhipNPCDebuff',
  '363:ConstellationWhipNPCDebuff',
  '364:MoonLordWhipNPCDebuff',
  '367:FlowerWhipNPCDebuffProc',
  '368:MoonLordWhipNPCDebuffProc',
  '369:MeteorWhipNPCDebuffProc',
]);

const PRODUCT_DOMAIN_CONFIG = {
  bosses: {
    sourceReadiness: {
      fileKey: 'source-readiness',
      evidence: [
        requiredJson('data/generated/wiki-bosses.latest.json'),
        optionalLatestJson('reports/wiki-bosses-fetch*.json'),
        optionalLatestJson('reports/wiki-bosses-import*.json'),
      ],
    },
    relationReadiness: {
      fileKey: 'relation-readiness',
      evidence: [
        optionalLatestJson('reports/boss-loot-import*.json'),
        optionalLatestJson('reports/relation/entity-coverage-baseline*.json'),
      ],
    },
    imageReadiness: {
      fileKey: 'image-readiness',
      evidence: [
        optionalJson('data/generated/npc-standardized-map.json'),
      ],
    },
    publicReadiness: {
      fileKey: 'public-readiness',
      evidence: [
        optionalText('back/src/main/java/com/terraria/skills/controller/AdminBossController.java'),
        optionalText('front/src/router/routes.ts'),
        optionalDirectory('front/src/views'),
      ],
    },
  },
  buffs: {
    sourceReadiness: {
      fileKey: 'source-readiness',
      evidence: [
        requiredJson('data/standardized/buffs.standardized.json'),
        optionalJson('data/generated/buff-standardized-map.json'),
      ],
    },
    relationReadiness: {
      fileKey: 'relation-readiness',
      evidence: [
        optionalLatestJson('reports/data/npc-buff-relations-backfill*.json'),
        optionalLatestJson('reports/relation/entity-coverage-baseline*.json'),
      ],
    },
    imageReadiness: {
      fileKey: 'image-readiness',
      evidence: [
        requiredJson('data/standardized/buffs.standardized.json'),
        optionalJson('data/standardized-view/buffs/_meta.json'),
      ],
    },
    publicReadiness: {
      fileKey: 'public-readiness',
      evidence: [
        optionalText('front/src/router/routes.ts'),
        optionalDirectory('front/src/views'),
        optionalText('back/src/main/java/com/terraria/skills/controller/AdminBuffController.java'),
      ],
    },
  },
  projectiles: {
    sourceReadiness: {
      fileKey: 'source-readiness',
      evidence: [
        requiredJson('data/standardized/projectiles.standardized.json'),
        optionalJson('data/standardized-view/projectiles/_meta.json'),
      ],
    },
    relationReadiness: {
      fileKey: 'relation-readiness',
      evidence: [
        optionalLatestJson('reports/relation/entity-coverage-baseline*.json'),
        optionalLatestJson('reports/projectile-zh-image-backfill*.json'),
      ],
    },
    imageReadiness: {
      fileKey: 'image-readiness',
      evidence: [
        requiredJson('data/standardized/projectiles.standardized.json'),
        optionalJson('data/generated/projectile-zh-map.json'),
      ],
    },
    publicReadiness: {
      fileKey: 'public-readiness',
      evidence: [
        optionalText('back/src/main/java/com/terraria/skills/controller/AdminProjectileController.java'),
        optionalText('front/src/router/routes.ts'),
        optionalDirectory('front/src/views'),
      ],
    },
  },
  armor_sets: {
    sourceReadiness: {
      fileKey: 'source-readiness',
      evidence: [
        requiredJson('data/generated/wiki-armor-sets.latest.json'),
        optionalJson('data/standardized/armor_sets.standardized.json'),
        optionalJson('data/generated/armor-set-definition-map.json'),
      ],
    },
    relationReadiness: {
      fileKey: 'relation-readiness',
      evidence: [
        optionalJson('data/standardized-view/armor_sets/_meta.json'),
        optionalLatestJson('reports/relation/entity-coverage-baseline*.json'),
      ],
    },
    imageReadiness: {
      fileKey: 'image-readiness',
      evidence: [
        optionalJson('data/terraPedia/raw/wiki/armor_set_images.parsed.latest.json'),
        optionalLatestJson('reports/fetch/fetch-armor-set-images*.json'),
      ],
    },
    publicReadiness: {
      fileKey: 'public-readiness',
      evidence: [
        optionalText('back/src/main/java/com/terraria/skills/controller/AdminArmorSetController.java'),
        optionalText('front/src/router/routes.ts'),
        optionalDirectory('front/src/views'),
      ],
    },
  },
};

const SUPPORT_DOMAIN_CONFIG = {
  'support.recipe': {
    sourceReadiness: {
      fileKey: 'source-readiness',
      evidence: [
        requiredJson('data/generated/recipe-material-reference.json'),
        optionalJson('data/generated/wiki-zh-recipe-pages.latest.json'),
        optionalLatestJson('reports/wiki-zh-recipe-import*.json'),
      ],
    },
    blockingGate: {
      fileKey: 'blocking-gate',
      evidence: [
        optionalLatestJson('reports/recipe-provider-consolidation*.json'),
        optionalLatestJson('reports/recipe-provider-suppression*.json'),
        optionalLatestJson('reports/wiki-zh-recipe-source-coverage*.json'),
      ],
    },
  },
  'support.shimmer': {
    sourceReadiness: {
      fileKey: 'source-readiness',
      evidence: [
        requiredJson('data/generated/shimmer/wiki-shimmer-manifest.latest.json'),
        optionalJson('data/generated/shimmer/wiki-shimmer-context.importable.latest.json'),
        optionalJson('data/generated/shimmer/wiki-shimmer-item-transforms.importable.latest.json'),
      ],
    },
    blockingGate: {
      fileKey: 'blocking-gate',
      evidence: [
        optionalLatestJson('reports/wiki-shimmer-db-import*.json'),
        optionalText('back/src/main/java/com/terraria/skills/controller/AdminShimmerController.java'),
      ],
    },
  },
  'support.category': {
    sourceReadiness: {
      fileKey: 'source-readiness',
      evidence: [
        requiredJson('data/canonical/category/README.md', { type: 'text' }),
        optionalLatestJson('reports/relation/category-local-sync*.json'),
        optionalLatestJson('reports/relation/category-recipe-cutover-baseline*.json'),
      ],
    },
    blockingGate: {
      fileKey: 'blocking-gate',
      evidence: [
        optionalText('front/src/services/categoryManagement.ts'),
        optionalText('data-query-app/pages/categories.vue'),
        optionalLatestText('reports/relation/category-recipe-cutover-verification*.md'),
      ],
    },
  },
  'support.item_group': {
    sourceReadiness: {
      fileKey: 'source-readiness',
      evidence: [
        requiredJson('data/generated/item-group-overrides.json'),
        optionalJson('data/generated/recipe-group-overrides.json'),
      ],
    },
    blockingGate: {
      fileKey: 'blocking-gate',
      evidence: [
        requiredLatestJson('reports/item-groups/any-item-group-source-audit*.json'),
      ],
    },
  },
  'support.town_npc_maintenance': {
    sourceReadiness: {
      fileKey: 'source-readiness',
      evidence: [
        requiredJson('data/generated/wiki-town-npc-maintenance.latest.json'),
        optionalLatestJson('reports/wiki-town-npc-import*.json'),
      ],
    },
    blockingGate: {
      fileKey: 'blocking-gate',
      evidence: [
        optionalLatestJson('reports/wiki-town-npc-maintenance*.json'),
        optionalText('data-query-app/pages/entities/town-npcs/index.vue'),
        optionalText('back/src/main/java/com/terraria/skills/controller/AdminTownNpcMaintenanceController.java'),
      ],
    },
  },
};

const DOMAIN_CONFIG = {
  ...PRODUCT_DOMAIN_CONFIG,
  ...SUPPORT_DOMAIN_CONFIG,
};

export function buildDomainReadinessReport({
  repoRoot = process.cwd(),
  domainId,
  panel,
  generatedAt = new Date().toISOString(),
  reportPath = null,
} = {}) {
  const normalizedPanel = normalizePanel(panel);
  const panelConfig = resolvePanelConfig(domainId, normalizedPanel);
  const root = path.resolve(repoRoot);
  const checks = panelConfig.evidence.map((entry) => evaluateEvidence(root, entry, {
    domainId,
    panelId: normalizedPanel,
  }));
  const blockingReasons = checks
    .filter((check) => check.status === 'blocked')
    .map((check) => check.message);
  const warningReasons = checks
    .filter((check) => check.status === 'warning')
    .map((check) => check.message);

  return {
    generatedAt,
    domainId,
    panelId: normalizedPanel,
    status: blockingReasons.length > 0 ? 'blocked' : warningReasons.length > 0 ? 'warning' : 'pass',
    reportPath: reportPath ?? null,
    requiresDatabase: false,
    writesDatabase: false,
    summary: summarizeChecks(checks),
    blockingReasons,
    warningReasons,
    checks,
  };
}

export function resolveDomainReportPath({ domainId, panel, generatedAt = new Date().toISOString() } = {}) {
  const normalizedPanel = normalizePanel(panel);
  const panelConfig = resolvePanelConfig(domainId, normalizedPanel);
  const dateKey = isoDateKey(generatedAt);
  return normalizePath(path.posix.join('reports/domain', domainId, `${panelConfig.fileKey}-${dateKey}.json`));
}

function summarizeChecks(checks) {
  return {
    checkCount: checks.length,
    requiredEvidenceCount: checks.filter((check) => check.required).length,
    optionalEvidenceCount: checks.filter((check) => !check.required).length,
    presentEvidenceCount: checks.filter((check) => check.found).length,
    missingEvidenceCount: checks.filter((check) => !check.found).length,
    blockedCount: checks.filter((check) => check.status === 'blocked').length,
    warningCount: checks.filter((check) => check.status === 'warning').length,
  };
}

function evaluateEvidence(repoRoot, evidence, { domainId, panelId } = {}) {
  const resolved = evidence.latest
    ? findLatestReport(repoRoot, evidence.path)
    : resolveStaticEvidence(repoRoot, evidence.path, evidence.type);
  if (!resolved) {
    return {
      id: evidence.id,
      type: evidence.type,
      required: evidence.required,
      found: false,
      readable: false,
      evidencePath: evidence.path,
      latestReportPath: null,
      recordCount: null,
      status: evidence.required ? 'blocked' : 'warning',
      message: `Missing ${evidence.required ? 'required' : 'optional'} evidence: ${evidence.path}`,
    };
  }

  const readability = readEvidence(resolved.fullPath, evidence.type);
  if (!readability.readable) {
    return {
      id: evidence.id,
      type: evidence.type,
      required: evidence.required,
      found: true,
      readable: false,
      evidencePath: resolved.relativePath,
      latestReportPath: evidence.latest ? resolved.relativePath : null,
      recordCount: null,
      status: evidence.required ? 'blocked' : 'warning',
      message: `Unreadable ${evidence.required ? 'required' : 'optional'} evidence: ${resolved.relativePath}`,
    };
  }

  const semanticStatus = evaluateEvidenceSemantics({
    repoRoot,
    evidence,
    domainId,
    panelId,
    resolvedPath: resolved.relativePath,
    payload: readability.payload,
  });

  return {
    id: evidence.id,
    type: evidence.type,
    required: evidence.required,
    found: true,
    readable: true,
    evidencePath: resolved.relativePath,
    latestReportPath: evidence.latest ? resolved.relativePath : null,
    recordCount: readability.recordCount,
    status: semanticStatus.status,
    message: semanticStatus.message,
  };
}

function readEvidence(fullPath, type) {
  if (type === 'directory') {
    return { readable: true, recordCount: null, payload: null };
  }
  if (type === 'text') {
    try {
      fs.readFileSync(fullPath, 'utf8');
      return { readable: true, recordCount: null, payload: null };
    } catch {
      return { readable: false, recordCount: null, payload: null };
    }
  }
  try {
    const payload = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    return { readable: true, recordCount: inferRecordCount(payload), payload };
  } catch {
    return { readable: false, recordCount: null, payload: null };
  }
}

function evaluateEvidenceSemantics({ repoRoot, evidence, domainId, panelId, resolvedPath, payload }) {
  if (panelId !== 'blockingGate' || evidence.type !== 'json' || !evidence.latest) {
    return evaluateProductDomainSemantics({ repoRoot, evidence, domainId, panelId, resolvedPath, payload });
  }
  const supportSemanticStatus = evaluateSupportDomainBlockingSemantics({ evidence, domainId, resolvedPath, payload });
  if (supportSemanticStatus) {
    return supportSemanticStatus;
  }
  const counters = collectBlockingGateCounters(payload);
  if (counters.length === 0) {
    return {
      status: 'warning',
      message: `Blocking gate report does not expose known blocking gate counters: ${resolvedPath}`,
    };
  }
  const blockingCounters = counters.filter((counter) => counter.value > 0);
  if (blockingCounters.length > 0) {
    return {
      status: 'blocked',
      message: `Blocking gate counters are non-zero in ${resolvedPath}: ${blockingCounters
        .map((counter) => `${counter.key}=${counter.value}`)
        .join(', ')}`,
    };
  }
  return {
    status: 'pass',
    message: `Blocking gate counters are clean in ${resolvedPath}: ${counters
      .map((counter) => `${counter.key}=${counter.value}`)
      .join(', ')}`,
  };
}

function evaluateProductDomainSemantics({ repoRoot, evidence, domainId, panelId, resolvedPath, payload }) {
  const pathKey = normalizePath(evidence.path);
  const reportPath = normalizePath(resolvedPath);
  if (domainId === 'bosses' && panelId === 'sourceReadiness' && pathKey === 'data/generated/wiki-bosses.latest.json') {
    return bossSourceSemantics(payload, reportPath);
  }
  if (domainId === 'buffs' && panelId === 'sourceReadiness' && pathKey === 'data/standardized/buffs.standardized.json') {
    return requiredRecordSourceSemantics(payload, reportPath, {
      entityLabel: 'buff',
      totalField: 'totalRecords',
      requiredFields: ['id', 'internalName', 'englishName', 'type'],
      allowMissingRequired: isScopedBuffSourceGap,
    });
  }
  if (domainId === 'buffs' && panelId === 'imageReadiness' && pathKey === 'data/standardized/buffs.standardized.json') {
    return imageSourceSemantics(payload, reportPath, {
      entityLabel: 'buff',
      totalField: 'totalRecords',
      imageFields: ['imageUrl', 'image'],
    });
  }
  if (domainId === 'buffs' && panelId === 'sourceReadiness' && pathKey === 'data/generated/buff-standardized-map.json') {
    return mapCountSemantics(payload, reportPath, 'buff map');
  }
  if (domainId === 'projectiles' && panelId === 'sourceReadiness' && pathKey === 'data/standardized/projectiles.standardized.json') {
    return requiredRecordSourceSemantics(payload, reportPath, {
      entityLabel: 'projectile',
      totalField: 'totalRecords',
      requiredFields: ['id', 'internalName', 'name'],
      allowMissingRequired: isProjectileNoneSentinel,
    });
  }
  if (domainId === 'projectiles' && panelId === 'imageReadiness' && pathKey === 'data/standardized/projectiles.standardized.json') {
    return imageSourceSemantics(payload, reportPath, {
      entityLabel: 'projectile',
      totalField: 'totalRecords',
      imageFields: ['imageUrl'],
      nestedImageFields: [['extras', 'image']],
      allowMissingImage: isProjectileNoneSentinel,
    });
  }
  if (domainId === 'projectiles' && panelId === 'sourceReadiness' && pathKey === 'data/standardized-view/projectiles/_meta.json') {
    return totalRecordsMetaSemantics(payload, reportPath, 'projectile meta');
  }
  if (['buffs', 'projectiles'].includes(domainId)
    && panelId === 'relationReadiness'
    && evidence.latest
    && pathKey === 'reports/relation/entity-coverage-baseline*.json') {
    return relationCoverageSemantics(payload, reportPath, domainId);
  }
  if (domainId === 'projectiles'
    && ['relationReadiness', 'imageReadiness'].includes(panelId)
    && evidence.latest
    && pathKey === 'reports/projectile-zh-image-backfill*.json') {
    return projectileImageBackfillSemantics(payload, reportPath);
  }
  if (domainId === 'projectiles' && panelId === 'imageReadiness' && pathKey === 'data/generated/projectile-zh-map.json') {
    return mapCountSemantics(payload, reportPath, 'projectile zh map');
  }
  if (domainId === 'armor_sets' && panelId === 'sourceReadiness' && pathKey === 'data/generated/wiki-armor-sets.latest.json') {
    return armorWikiSourceSemantics(payload, reportPath);
  }
  if (domainId === 'armor_sets' && panelId === 'sourceReadiness' && pathKey === 'data/standardized/armor_sets.standardized.json') {
    return armorStandardizedSourceSemantics(payload, reportPath);
  }
  if (domainId === 'armor_sets' && panelId === 'sourceReadiness' && pathKey === 'data/generated/armor-set-definition-map.json') {
    return armorDefinitionMapSemantics(payload, reportPath);
  }
  if (domainId === 'armor_sets' && panelId === 'imageReadiness' && evidence.latest && pathKey === 'reports/fetch/fetch-armor-set-images*.json') {
    return armorImageFetchSemantics(payload, reportPath, repoRoot);
  }
  return { status: 'pass', message: `Evidence present: ${resolvedPath}` };
}

function evaluateSupportDomainBlockingSemantics({ evidence, domainId, resolvedPath, payload }) {
  const pathKey = normalizePath(evidence.path);
  const reportPath = normalizePath(resolvedPath);
  if (domainId === 'support.recipe' && pathKey === 'reports/recipe-provider-consolidation*.json') {
    return recipeProviderConsolidationSemantics(payload, reportPath);
  }
  if (domainId === 'support.recipe' && pathKey === 'reports/recipe-provider-suppression*.json') {
    return recipeProviderSuppressionSemantics(payload, reportPath);
  }
  if (domainId === 'support.recipe' && pathKey === 'reports/wiki-zh-recipe-source-coverage*.json') {
    return recipeSourceCoverageSemantics(payload, reportPath);
  }
  if (domainId === 'support.shimmer' && pathKey === 'reports/wiki-shimmer-db-import*.json') {
    return shimmerDbImportSemantics(payload, reportPath);
  }
  if (domainId === 'support.item_group' && pathKey === 'reports/item-groups/any-item-group-source-audit*.json') {
    return itemGroupSourceAuditSemantics(payload, reportPath);
  }
  return null;
}

function recipeProviderConsolidationSemantics(payload, reportPath) {
  const blocking = [];
  const warnings = [];
  const after = payload?.after;
  if (after && after.activeResultItems !== after.resultItems) {
    blocking.push(`activeResultItems=${after.activeResultItems} does not match resultItems=${after.resultItems}`);
  }
  const metrics = pickFiniteMetrics(payload?.changes, ['suppressedOverlapRecipeRows', 'gapOnlyResultItems', 'gapOnlyRecipeRows']);
  warnings.push(...baselineWarnings(metrics, DOMAIN_ACCEPTANCE_BASELINES.recipeProviderConsolidation));
  return semanticResult({
    reportPath,
    cleanMessage: `recipe provider consolidation semantic gates are clean in ${reportPath}; non-blocking metrics within baseline: ${formatMetricsWithBaseline(metrics, DOMAIN_ACCEPTANCE_BASELINES.recipeProviderConsolidation)}`,
    blocking,
    warnings,
  });
}

function recipeProviderSuppressionSemantics(payload, reportPath) {
  const metrics = pickFiniteMetrics(payload?.summary, ['candidateCount']);
  const warnings = baselineWarnings(metrics, DOMAIN_ACCEPTANCE_BASELINES.recipeProviderSuppression);
  return semanticResult({
    reportPath,
    cleanMessage: `recipe provider suppression semantic gates are clean in ${reportPath}; non-blocking metrics within baseline: ${formatMetricsWithBaseline(metrics, DOMAIN_ACCEPTANCE_BASELINES.recipeProviderSuppression)}`,
    warnings,
  });
}

function recipeSourceCoverageSemantics(payload, reportPath) {
  const blocking = [];
  const comparison = payload?.comparison ?? {};
  for (const key of ['missingFromWikiZhDbCount', 'extraInWikiZhDbCount', 'trulyMissingEverywhereCount']) {
    const value = comparison[key];
    if (Number.isFinite(value) && value > 0) {
      blocking.push(`${key}=${value}`);
    }
  }
  if (payload?.sourceRecipes !== payload?.wikiZhDbRecipes) {
    blocking.push(`sourceRecipes=${payload?.sourceRecipes} does not match wikiZhDbRecipes=${payload?.wikiZhDbRecipes}`);
  }
  const metrics = pickFiniteMetrics(comparison, ['suppressedButPresentCount']);
  const warnings = baselineWarnings(metrics, DOMAIN_ACCEPTANCE_BASELINES.recipeSourceCoverage);
  return semanticResult({
    reportPath,
    cleanMessage: `recipe source coverage semantic gates are clean in ${reportPath}; non-blocking metrics within baseline: ${formatMetricsWithBaseline(metrics, DOMAIN_ACCEPTANCE_BASELINES.recipeSourceCoverage)}`,
    blocking,
    warnings,
  });
}

function shimmerDbImportSemantics(payload, reportPath) {
  const blocking = [];
  const counts = payload?.counts ?? {};
  if (Number.isFinite(counts.unresolvedTitles) && counts.unresolvedTitles > 0) {
    blocking.push(`unresolvedTitles=${counts.unresolvedTitles}`);
  }
  for (const key of ['itemTransforms', 'decraftRules', 'entityTransforms', 'npcTransforms']) {
    if (!Number.isFinite(counts[key]) || counts[key] <= 0) {
      blocking.push(`${key} is missing or zero`);
    }
  }
  return semanticResult({
    reportPath,
    cleanMessage: `shimmer import semantic gates are clean in ${reportPath}`,
    blocking,
  });
}

function itemGroupSourceAuditSemantics(payload, reportPath) {
  const blocking = [];
  const summary = payload?.summary ?? {};
  if (Number.isFinite(summary.unresolvedMemberReferences) && summary.unresolvedMemberReferences > 0) {
    blocking.push(`unresolvedMemberReferences=${summary.unresolvedMemberReferences}`);
  }
  if (!Number.isFinite(summary.totalGroups) || summary.totalGroups <= 0) {
    blocking.push('totalGroups is missing or zero');
  }
  const metrics = pickFiniteMetrics(summary, ['duplicateGroupKeys', 'blockedGroupReferences', 'consumerOnlyReferences']);
  const warnings = baselineWarnings(metrics, DOMAIN_ACCEPTANCE_BASELINES.itemGroupSourceAudit);
  return semanticResult({
    reportPath,
    cleanMessage: `item group source audit semantic gates are clean in ${reportPath}; scoped non-blocking metrics within baseline: ${formatMetricsWithBaseline(metrics, DOMAIN_ACCEPTANCE_BASELINES.itemGroupSourceAudit)}`,
    blocking,
    warnings,
  });
}

function bossSourceSemantics(payload, reportPath) {
  const records = Array.isArray(payload?.records) ? payload.records : [];
  const blocking = [];
  const warnings = [];
  const overviewCount = payload?.overview?.bossCount;
  if (Number.isFinite(overviewCount) && overviewCount !== records.length) {
    blocking.push(`overview.bossCount=${overviewCount} does not match records.length=${records.length}`);
  }
  const missingRequired = records.filter((record) => (
    isBlank(record?.titleEn) || isBlank(record?.pageTitleEn) || isBlank(record?.sourceUrl)
  )).length;
  if (missingRequired > 0) {
    blocking.push(`${missingRequired} boss records missing required source fields`);
  }
  const badStatus = records.filter((record) => record?.status && record.status !== 'ok').length;
  if (badStatus > 0) {
    blocking.push(`${badStatus} boss records have non-ok status`);
  }
  const missingOptional = records.filter((record) => (
    (isBlank(record?.titleZh) || isBlank(record?.imageUrl))
    && !isKnownBossSourceFallback(record)
  )).length;
  if (missingOptional > 0) {
    warnings.push(`${missingOptional} boss records missing optional localized or image fields`);
  }
  return semanticResult({
    reportPath,
    cleanMessage: `Boss source semantic gates are clean in ${reportPath}`,
    blocking,
    warnings,
  });
}

function requiredRecordSourceSemantics(payload, reportPath, {
  entityLabel,
  totalField,
  requiredFields,
  allowMissingRequired = () => false,
}) {
  const records = Array.isArray(payload?.records) ? payload.records : [];
  const blocking = [];
  const warnings = [];
  const total = payload?.[totalField];
  if (!Number.isFinite(total) || total <= 0) {
    blocking.push(`${totalField} is missing or zero`);
  } else if (total !== records.length) {
    blocking.push(`${totalField}=${total} does not match records.length=${records.length}`);
  }
  const missingRequired = records.filter((record) => (
    requiredFields.some((field) => isBlank(record?.[field]))
    && !allowMissingRequired(record)
  )).length;
  if (missingRequired > 0) {
    warnings.push(`${missingRequired} ${entityLabel} records missing required fields`);
  }
  return semanticResult({
    reportPath,
    cleanMessage: `${entityLabel} source semantic gates are clean in ${reportPath}`,
    blocking,
    warnings,
  });
}

function mapCountSemantics(payload, reportPath, label) {
  const recordCount = objectRecordCount(payload?.records);
  const blocking = [];
  if (Number.isFinite(payload?.count) && recordCount != null && payload.count !== recordCount) {
    blocking.push(`map count=${payload.count} does not match records size=${recordCount}`);
  }
  return semanticResult({
    reportPath,
    cleanMessage: `${label} count semantic gate is clean in ${reportPath}`,
    blocking,
  });
}

function totalRecordsMetaSemantics(payload, reportPath, label) {
  const blocking = [];
  if (!Number.isFinite(payload?.totalRecords) || payload.totalRecords <= 0) {
    blocking.push(`${label} totalRecords is missing or zero`);
  }
  return semanticResult({
    reportPath,
    cleanMessage: `${label} semantic gate is clean in ${reportPath}`,
    blocking,
  });
}

function relationCoverageSemantics(payload, reportPath, domainId) {
  const domain = payload?.domains?.[domainId];
  const fields = payload?.fieldAudit?.domains?.[domainId]?.fields ?? {};
  const blocking = [];
  if (!domain) {
    blocking.push(`${domainId} coverage domain is missing`);
  } else if (domain.localTotal !== domain.maintTotal || domain.localTotal !== domain.relationTotal) {
    blocking.push(`${domainId} coverage totals drift: local=${domain.localTotal}, maint=${domain.maintTotal}, relation=${domain.relationTotal}`);
  }
  const gateFields = domainId === 'buffs' ? ['nameZh', 'image', 'tooltipZh'] : ['nameZh', 'image'];
  const gaps = gateFields
    .map((field) => ({ field, gap: fields?.[field]?.gap }))
    .filter((entry) => Number.isFinite(entry.gap) && entry.gap > 0);
  if (gaps.length > 0) {
    blocking.push(`${domainId} relation field gaps: ${gaps.map((entry) => `${entry.field}.gap=${entry.gap}`).join(', ')}`);
  }
  return semanticResult({
    reportPath,
    cleanMessage: `${domainId} relation coverage semantic gates are clean in ${reportPath}`,
    blocking,
  });
}

function projectileImageBackfillSemantics(payload, reportPath) {
  const blocking = [];
  if (payload?.total !== payload?.totalAvailable) {
    blocking.push(`total=${payload?.total} does not match totalAvailable=${payload?.totalAvailable}`);
  }
  if (Number.isFinite(payload?.unresolvedImage) && payload.unresolvedImage > 1) {
    blocking.push(`unresolvedImage=${payload.unresolvedImage} exceeds allowed threshold 1`);
  }
  if (Number.isFinite(payload?.imageResolved) && Number.isFinite(payload?.total) && payload.imageResolved < payload.total - 1) {
    blocking.push(`imageResolved=${payload.imageResolved} is below total-1=${payload.total - 1}`);
  }
  const metrics = pickFiniteMetrics(payload, ['unresolvedZh']);
  const warnings = baselineWarnings(metrics, DOMAIN_ACCEPTANCE_BASELINES.projectileImageBackfill);
  return semanticResult({
    reportPath,
    cleanMessage: `projectile image semantic gates are clean in ${reportPath}; non-blocking metrics within baseline: ${formatMetricsWithBaseline(metrics, DOMAIN_ACCEPTANCE_BASELINES.projectileImageBackfill)}`,
    blocking,
    warnings,
  });
}

function armorWikiSourceSemantics(payload, reportPath) {
  const records = Array.isArray(payload?.records) ? payload.records : [];
  const blocking = [];
  if (Number.isFinite(payload?.total) && payload.total !== records.length) {
    blocking.push(`total=${payload.total} does not match records.length=${records.length}`);
  }
  const invalid = records.filter((record) => (
    record?.entityType !== 'armor_set'
    || isBlank(record?.compositionKind)
    || isBlank(record?.nameEn)
    || isBlank(record?.nameZh)
    || !Array.isArray(record?.images)
    || record.images.length === 0
  )).length;
  if (invalid > 0) {
    blocking.push(`${invalid} armor wiki records missing required source fields`);
  }
  return semanticResult({
    reportPath,
    cleanMessage: `armor wiki source semantic gates are clean in ${reportPath}`,
    blocking,
  });
}

function armorStandardizedSourceSemantics(payload, reportPath) {
  const records = Array.isArray(payload?.records) ? payload.records : [];
  const blocking = [];
  if (Number.isFinite(payload?.totalRecords) && payload.totalRecords !== records.length) {
    blocking.push(`totalRecords=${payload.totalRecords} does not match records.length=${records.length}`);
  }
  const invalid = records.filter((record) => (
    isBlank(record?.textKey)
    || isBlank(record?.benefitExpression)
    || !Array.isArray(record?.uniqueItemIds)
    || record.uniqueItemIds.length === 0
    || !Array.isArray(record?.sets)
    || record.sets.length === 0
    || !Number.isFinite(record?.setCount)
    || record.setCount <= 0
  )).length;
  if (invalid > 0) {
    blocking.push(`${invalid} armor standardized records missing required fields`);
  }
  return semanticResult({
    reportPath,
    cleanMessage: `armor standardized source semantic gates are clean in ${reportPath}`,
    blocking,
  });
}

function armorDefinitionMapSemantics(payload, reportPath) {
  const blocking = [];
  const warnings = [];
  const records = Object.values(payload?.records ?? {});
  if (!Number.isFinite(payload?.total) || payload.total <= 0) {
    blocking.push('armor definition map total is missing or zero');
  }
  if (!Number.isFinite(payload?.mapped) || payload.mapped <= 0) {
    blocking.push('armor definition map mapped is missing or zero');
  }
  if (Number.isFinite(payload?.total) && payload.total !== records.length) {
    warnings.push(`armor definition map records=${records.length} does not match total=${payload.total}`);
  }
  if (Number.isFinite(payload?.mapped) && Number.isFinite(payload?.placeholder) && Number.isFinite(payload?.total)
    && payload.mapped + payload.placeholder !== payload.total) {
    warnings.push(`armor definition map mapped + placeholder=${payload.mapped + payload.placeholder} does not match total=${payload.total}`);
  }
  const placeholders = armorDefinitionPlaceholderRecords(payload);
  const acceptedPlaceholders = placeholders.filter((record) => isAcceptedArmorDefinitionPlaceholder(record));
  const unacceptedPlaceholders = placeholders.filter((record) => !isAcceptedArmorDefinitionPlaceholder(record));
  if (Number.isFinite(payload?.total) && Number.isFinite(payload?.mapped) && payload.mapped < payload.total && unacceptedPlaceholders.length > 0) {
    warnings.push(`armor definition map mapped=${payload.mapped}/${payload.total}; unaccepted placeholders=${unacceptedPlaceholders.length}`);
  }
  if (Number.isFinite(payload?.placeholder) && payload.placeholder !== placeholders.length) {
    warnings.push(`armor definition map placeholder=${payload.placeholder} does not match placeholder records=${placeholders.length}`);
  }
  if (unacceptedPlaceholders.length > 0) {
    warnings.push(`armor definition map has unaccepted placeholders: ${unacceptedPlaceholders.map((record) => `${record.armorSetId}:${record.name}`).join(', ')}`);
  }
  return semanticResult({
    reportPath,
    cleanMessage: acceptedPlaceholders.length > 0
      ? `armor definition map semantic gate is clean in ${reportPath}; accepted placeholder exceptions=${acceptedPlaceholders.length}/${placeholders.length}`
      : `armor definition map semantic gate is clean in ${reportPath}`,
    blocking,
    warnings,
  });
}

function armorImageFetchSemantics(payload, reportPath, repoRoot) {
  const blocking = [];
  const warnings = [];
  if (!Number.isFinite(payload?.totalArmorSets) || payload.totalArmorSets <= 0) {
    blocking.push('totalArmorSets is missing or zero');
  }
  if (!Number.isFinite(payload?.totalArmorSetImages) || payload.totalArmorSetImages <= 0) {
    blocking.push('totalArmorSetImages is missing or zero');
  }
  const parsedSnapshot = loadArmorImageParsedSnapshot(payload, repoRoot);
  const fallback = armorImageWarningFallbackStatus(payload, parsedSnapshot);
  if (!fallback.ok) {
    warnings.push(...fallback.messages);
  }
  return semanticResult({
    reportPath,
    cleanMessage: armorImageCleanMessage({ payload, reportPath, parsedSnapshot }),
    blocking,
    warnings,
  });
}

function isScopedBuffSourceGap(record) {
  return KNOWN_BUFF_REQUIRED_FIELD_GAP_KEYS.has(`${Number(record?.id)}:${String(record?.internalName ?? '')}`);
}

function isProjectileNoneSentinel(record) {
  return Number(record?.id) === 0 && String(record?.internalName ?? '') === 'None';
}

function isKnownBossSourceFallback(record) {
  return [
    'Solar Pillar',
    'Nebula Pillar',
    'Vortex Pillar',
    'Stardust Pillar',
  ].includes(String(record?.titleEn ?? record?.pageTitleEn ?? ''));
}

function recordHasImageEvidence(record, imageFields = [], nestedImageFields = []) {
  return imageFields.some((field) => !isBlank(record?.[field]))
    || nestedImageFields.some((pathParts) => !isBlank(readPath(record, pathParts)));
}

function readPath(value, pathParts = []) {
  return pathParts.reduce((current, key) => current?.[key], value);
}

function armorDefinitionPlaceholderRecords(payload) {
  return Object.values(payload?.records ?? {})
    .filter((record) => String(record?.status ?? '') === 'placeholder')
    .map((record) => ({
      armorSetId: Number(record?.armorSetId),
      name: String(record?.name ?? ''),
      internalCode: String(record?.internalCode ?? ''),
      itemIds: Array.isArray(record?.itemIds) ? record.itemIds.map(Number).filter(Number.isFinite) : [],
    }));
}

function isAcceptedArmorDefinitionPlaceholder(record) {
  const exception = ARMOR_DEFINITION_PLACEHOLDER_EXCEPTIONS.get(Number(record?.armorSetId));
  return Boolean(
    exception
    && exception.name === record?.name
    && sameNumberSet(exception.itemIds, record?.itemIds),
  );
}

function armorImageWarningFallbackStatus(payload, parsedSnapshot = null) {
  const warningCount = payload?.warningCount;
  if (!Number.isFinite(warningCount) || warningCount <= 0) {
    return { ok: true, messages: [] };
  }
  if (parsedSnapshot) {
    const messages = [];
    const snapshotWarnings = Array.isArray(parsedSnapshot.warnings) ? parsedSnapshot.warnings : [];
    const imageRows = Array.isArray(parsedSnapshot.armorSetImages) ? parsedSnapshot.armorSetImages : [];
    if (snapshotWarnings.length !== warningCount) {
      messages.push(`armor image fetch warningCount=${warningCount} does not match parsed snapshot warnings=${snapshotWarnings.length}`);
    }
    if (Number.isFinite(payload?.totalArmorSets) && Number.isFinite(parsedSnapshot?.totalArmorSets)
      && parsedSnapshot.totalArmorSets !== payload.totalArmorSets) {
      messages.push(`parsed snapshot totalArmorSets=${parsedSnapshot.totalArmorSets} does not match report totalArmorSets=${payload.totalArmorSets}`);
    }
    if (Number.isFinite(payload?.totalArmorSetImages) && Number.isFinite(parsedSnapshot?.totalArmorSetImages)
      && parsedSnapshot.totalArmorSetImages !== payload.totalArmorSetImages) {
      messages.push(`parsed snapshot totalArmorSetImages=${parsedSnapshot.totalArmorSetImages} does not match report totalArmorSetImages=${payload.totalArmorSetImages}`);
    }
    if (Number.isFinite(parsedSnapshot?.totalArmorSetImages) && imageRows.length !== parsedSnapshot.totalArmorSetImages) {
      messages.push(`parsed snapshot image rows=${imageRows.length} does not match totalArmorSetImages=${parsedSnapshot.totalArmorSetImages}`);
    }
    const missingFallback = imageRows.filter((row) => isBlank(row?.originalUrl) || isBlank(row?.contentType)).length;
    if (missingFallback > 0) {
      messages.push(`armor image parsed snapshot has ${missingFallback} image rows without wiki original fallback`);
    }
    return { ok: messages.length === 0, messages };
  }
  const samples = Array.isArray(payload?.samples) ? payload.samples : [];
  if (samples.length < warningCount) {
    return {
      ok: false,
      messages: [`armor image fetch warningCount=${warningCount} has only ${samples.length} sampled fallback records`],
    };
  }
  const missingFallback = samples.filter((sample) => isBlank(sample?.originalUrl) || isBlank(sample?.contentType)).length;
  if (missingFallback > 0) {
    return {
      ok: false,
      messages: [`armor image fetch warningCount=${warningCount} has ${missingFallback} sampled records without wiki original fallback`],
    };
  }
  return { ok: true, messages: [] };
}

function armorImageCleanMessage({ payload, reportPath, parsedSnapshot }) {
  if (!Number.isFinite(payload?.warningCount) || payload.warningCount <= 0) {
    return `armor image fetch semantic gate is clean in ${reportPath}`;
  }
  return parsedSnapshot
    ? `armor image fetch semantic gate is clean in ${reportPath}; parsed snapshot fallback evidence covers ${parsedSnapshot.armorSetImages?.length ?? 0} image rows and ${parsedSnapshot.warnings?.length ?? 0} page warnings`
    : `armor image fetch semantic gate is clean in ${reportPath}; all warning records have wiki original fallback`;
}

function loadArmorImageParsedSnapshot(payload, repoRoot) {
  for (const candidate of [payload?.snapshotParsedPath, payload?.latestParsedPath]) {
    const fullPath = resolveEvidenceReferencePath(candidate, repoRoot);
    if (!fullPath || !fs.existsSync(fullPath)) {
      continue;
    }
    try {
      return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

function resolveEvidenceReferencePath(value, repoRoot) {
  const text = String(value ?? '').trim();
  if (text === '') {
    return null;
  }
  const fullPath = path.isAbsolute(text) ? path.resolve(text) : path.resolve(repoRoot, text);
  const root = path.resolve(repoRoot);
  const relative = normalizePath(path.relative(root, fullPath));
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  if (!/^data\/terraPedia\/raw\/wiki\/armor_set_images\.parsed\.(latest|\d{4}-\d{2}-\d{2}T.+)\.json$/.test(relative)) {
    return null;
  }
  return fullPath;
}

function pickFiniteMetrics(source, keys) {
  return Object.fromEntries(keys
    .map((key) => [key, source?.[key]])
    .filter(([, value]) => Number.isFinite(value)));
}

function formatMetrics(metrics) {
  const entries = Object.entries(metrics ?? {}).filter(([, value]) => value !== undefined && value !== null && value !== '');
  return entries.length > 0
    ? entries.map(([key, value]) => `${key}=${value}`).join(', ')
    : 'none';
}

function baselineWarnings(metrics, baseline) {
  return Object.entries(metrics ?? {})
    .filter(([key, value]) => Number.isFinite(value) && Number.isFinite(baseline?.[key]) && value > baseline[key])
    .map(([key, value]) => `${key}=${value} exceeds baseline ${baseline[key]}`);
}

function formatMetricsWithBaseline(metrics, baseline) {
  const entries = Object.entries(metrics ?? {}).filter(([, value]) => value !== undefined && value !== null && value !== '');
  return entries.length > 0
    ? entries.map(([key, value]) => {
      const baselineValue = baseline?.[key];
      return Number.isFinite(baselineValue) ? `${key}=${value}/${baselineValue}` : `${key}=${value}`;
    }).join(', ')
    : 'none';
}

function sameNumberSet(left, right) {
  const normalize = (values) => (Array.isArray(values) ? values : [])
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function imageSourceSemantics(payload, reportPath, {
  entityLabel,
  totalField,
  imageFields = [],
  nestedImageFields = [],
  allowMissingImage = () => false,
} = {}) {
  const records = Array.isArray(payload?.records) ? payload.records : [];
  const blocking = [];
  const warnings = [];
  const total = payload?.[totalField];
  if (!Number.isFinite(total) || total <= 0) {
    blocking.push(`${totalField} is missing or zero`);
  } else if (total !== records.length) {
    blocking.push(`${totalField}=${total} does not match records.length=${records.length}`);
  }
  const missingImage = records.filter((record) => !recordHasImageEvidence(record, imageFields, nestedImageFields) && !allowMissingImage(record)).length;
  if (missingImage > 0) {
    warnings.push(`${missingImage} ${entityLabel} records missing image source fields`);
  }
  return semanticResult({
    reportPath,
    cleanMessage: `${entityLabel} image source semantic gates are clean in ${reportPath}`,
    blocking,
    warnings,
  });
}

function collectBlockingGateCounters(payload) {
  const candidates = [
    payload,
    payload?.summary,
    payload?.totals,
    payload?.counts,
    payload?.gate,
    payload?.gateSummary,
    payload?.blockingSummary,
  ];
  const counters = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      continue;
    }
    for (const key of BLOCKING_GATE_COUNTER_KEYS) {
      const value = candidate[key];
      if (Number.isFinite(value)) {
        counters.push({ key, value });
      }
    }
  }
  return counters;
}

function semanticResult({ reportPath, cleanMessage, blocking = [], warnings = [] }) {
  if (blocking.length > 0) {
    return {
      status: 'blocked',
      message: `${reportPath}: ${blocking.join('; ')}`,
    };
  }
  if (warnings.length > 0) {
    return {
      status: 'warning',
      message: `${reportPath}: ${warnings.join('; ')}`,
    };
  }
  return {
    status: 'pass',
    message: cleanMessage,
  };
}

function objectRecordCount(records) {
  if (Array.isArray(records)) {
    return records.length;
  }
  if (records && typeof records === 'object') {
    return Object.keys(records).length;
  }
  return null;
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function inferRecordCount(payload) {
  if (Array.isArray(payload)) {
    return payload.length;
  }
  if (Array.isArray(payload?.records)) {
    return payload.records.length;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data.length;
  }
  if (Array.isArray(payload?.items)) {
    return payload.items.length;
  }
  if (Array.isArray(payload?.projectiles)) {
    return payload.projectiles.length;
  }
  return null;
}

function resolveStaticEvidence(repoRoot, relativePath, type) {
  const fullPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  const stat = fs.statSync(fullPath);
  if (type === 'directory' && !stat.isDirectory()) {
    return null;
  }
  if (type !== 'directory' && !stat.isFile()) {
    return null;
  }
  return {
    fullPath,
    relativePath: normalizePath(relativePath),
  };
}

function findLatestReport(repoRoot, reportPattern) {
  const parsed = parseReportPattern(reportPattern);
  if (!parsed) {
    return null;
  }
  const dir = path.join(repoRoot, parsed.dir);
  if (!fs.existsSync(dir)) {
    return null;
  }
  const candidates = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => entry.name.startsWith(parsed.prefix) && entry.name.endsWith(parsed.suffix))
    .map((entry) => {
      const relativePath = normalizePath(path.join(parsed.dir, entry.name));
      const fullPath = path.join(repoRoot, relativePath);
      const stat = fs.statSync(fullPath);
      return {
        fullPath,
        relativePath,
        fileName: entry.name,
        mtimeMs: stat.mtimeMs,
      };
    });
  candidates.sort(compareReportCandidates);
  return candidates[0] ?? null;
}

function parseReportPattern(reportPattern = '') {
  const pattern = normalizePath(reportPattern);
  if (!pattern.includes('*') || pattern.includes(':')) {
    return null;
  }
  const dir = path.posix.dirname(pattern);
  const filePattern = path.posix.basename(pattern);
  const [prefix, suffix] = filePattern.split('*');
  if (prefix === undefined || suffix === undefined) {
    return null;
  }
  return { dir, prefix, suffix };
}

function compareReportCandidates(left, right) {
  const leftDate = datedNameValue(left.fileName);
  const rightDate = datedNameValue(right.fileName);
  if (leftDate !== rightDate) {
    return rightDate - leftDate;
  }
  if (left.mtimeMs !== right.mtimeMs) {
    return right.mtimeMs - left.mtimeMs;
  }
  return right.fileName.localeCompare(left.fileName);
}

function resolvePanelConfig(domainId, panelId) {
  const domainConfig = DOMAIN_CONFIG[domainId];
  if (!domainConfig) {
    throw new Error(`Unsupported domain: ${domainId}`);
  }
  const panelConfig = domainConfig[panelId];
  if (!panelConfig) {
    throw new Error(`Unsupported panel for ${domainId}: ${panelId}`);
  }
  return panelConfig;
}

function normalizePanel(panel) {
  const value = String(panel ?? '').trim();
  return PANEL_ALIASES[value] ?? value;
}

function requiredJson(relativePath, options = {}) {
  return evidence(relativePath, true, options.type ?? 'json');
}

function optionalJson(relativePath, options = {}) {
  return evidence(relativePath, false, options.type ?? 'json');
}

function requiredLatestJson(reportPattern) {
  return evidence(reportPattern, true, 'json', true);
}

function optionalLatestJson(reportPattern) {
  return evidence(reportPattern, false, 'json', true);
}

function optionalLatestText(reportPattern) {
  return evidence(reportPattern, false, 'text', true);
}

function optionalText(relativePath) {
  return evidence(relativePath, false, 'text');
}

function optionalDirectory(relativePath) {
  return evidence(relativePath, false, 'directory');
}

function evidence(relativePath, required, type, latest = false) {
  return {
    id: evidenceId(relativePath),
    path: relativePath,
    required,
    type,
    latest,
  };
}

function evidenceId(relativePath) {
  return normalizePath(relativePath)
    .replace(/\*/g, 'latest')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isoDateKey(generatedAt) {
  const date = new Date(generatedAt);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function datedNameValue(fileName) {
  const match = String(fileName ?? '').match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return 0;
  }
  return Number(`${match[1]}${match[2]}${match[3]}`);
}

function normalizePath(value) {
  return String(value ?? '').replace(/\\/g, '/');
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const arg of argv) {
    const match = String(arg).match(/^--([^=]+)=(.*)$/);
    if (match) {
      args[match[1]] = match[2];
    }
  }
  return args;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const generatedAt = args['generated-at'] ?? new Date().toISOString();
  const reportPath = args.output === 'default'
    ? resolveDomainReportPath({ domainId: args.domain, panel: args.panel, generatedAt })
    : args.output ?? null;
  if (reportPath) {
    assertDomainOutputPath(args['repo-root'] ?? process.cwd(), reportPath);
  }
  const report = buildDomainReadinessReport({
    repoRoot: args['repo-root'] ?? process.cwd(),
    domainId: args.domain,
    panel: args.panel,
    generatedAt,
    reportPath,
  });

  if (reportPath) {
    const fullPath = path.resolve(args['repo-root'] ?? process.cwd(), reportPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function assertDomainOutputPath(repoRoot, outputPath) {
  const normalized = normalizePath(outputPath);
  if (!normalized.startsWith('reports/domain/') || normalized.includes('..') || normalized.includes(':')) {
    throw new Error(`Invalid domain readiness output path: ${outputPath}`);
  }
  const root = path.resolve(repoRoot);
  const fullPath = path.resolve(root, outputPath);
  const reportsRoot = path.resolve(root, 'reports/domain');
  if (fullPath !== reportsRoot && !fullPath.startsWith(`${reportsRoot}${path.sep}`)) {
    throw new Error(`Invalid domain readiness output path: ${outputPath}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}

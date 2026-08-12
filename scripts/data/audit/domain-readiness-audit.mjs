#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSourceContractComplianceReport } from './canonical-source-contract-registry.mjs';
import { resolveExpectedArmorSetPlaceholder } from '../generate/armor-set-definition-source.mjs';
import { resolveSharedDataRoot } from '../lib/project-root.mjs';
import {
  assertRepositoryOrdinaryDirectory,
  assertRepositoryOrdinaryFile,
} from '../lib/private-repository-path.mjs';
import { verifyShimmerGeneration } from '../transform/shimmer-generation-contract.mjs';
import {
  CANONICAL_SHIMMER_IMPORT_RESULT_PATH,
  CANONICAL_SHIMMER_IMPORT_OPERATION_ID,
  SHIMMER_IMPORT_PROVIDER_SCOPE,
} from '../automation/canonical-shimmer-import-input-contract.mjs';

const __filename = fileURLToPath(import.meta.url);

const PANEL_ALIASES = {
  source: 'sourceReadiness',
  relation: 'relationReadiness',
  image: 'imageReadiness',
  public: 'publicReadiness',
  'unresolved-audit-trend': 'unresolvedAuditTrend',
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
  items: {
    sourceReadiness: {
      fileKey: 'source-readiness',
      evidence: [
        requiredJson('data/standardized/items.standardized.json'),
      ],
    },
    relationReadiness: {
      fileKey: 'relation-readiness',
      evidence: [
        optionalLatestJson('reports/relation/entity-coverage-baseline*.json'),
      ],
    },
    imageReadiness: {
      fileKey: 'image-readiness',
      evidence: [
        requiredJson('data/standardized/items.standardized.json'),
        optionalLatestJson('reports/workflow-image-sync*.json'),
        optionalText('back/src/main/java/com/terraria/skills/controller/PublicItemRelationController.java'),
      ],
    },
    publicReadiness: {
      fileKey: 'public-readiness',
      evidence: [
        optionalText('back/src/main/java/com/terraria/skills/controller/PublicItemController.java'),
        optionalText('back/src/main/java/com/terraria/skills/controller/PublicItemAggregateController.java'),
        optionalText('back/src/main/java/com/terraria/skills/controller/PublicItemRecipeController.java'),
        optionalText('front-nuxt/pages/index.vue'),
        optionalText('front-nuxt/pages/items/[id].vue'),
      ],
    },
    unresolvedAuditTrend: {
      fileKey: 'unresolved-audit-trend',
      evidence: [
        requiredLatestJson('reports/relation/reresolve-candidates*.json'),
      ],
    },
  },
  npcs: {
    sourceReadiness: {
      fileKey: 'source-readiness',
      evidence: [
        requiredJson('data/standardized/npcs.standardized.json'),
        optionalLatestJson('reports/wiki-town-npc-import*.json', { warnWhenMissing: false }),
        optionalLatestJson('reports/wiki-town-npc-maintenance*.json'),
      ],
    },
    relationReadiness: {
      fileKey: 'relation-readiness',
      evidence: [
        optionalLatestJson('reports/relation/entity-coverage-baseline*.json'),
      ],
    },
    imageReadiness: {
      fileKey: 'image-readiness',
      evidence: [
        requiredJson('data/standardized/npcs.standardized.json'),
        optionalText('back/src/main/java/com/terraria/skills/controller/PublicNpcAggregateController.java'),
      ],
    },
    publicReadiness: {
      fileKey: 'public-readiness',
      evidence: [
        optionalText('back/src/main/java/com/terraria/skills/controller/PublicNpcAggregateController.java'),
        optionalText('front-nuxt/pages/npcs/index.vue'),
        optionalText('front-nuxt/pages/npcs/[id].vue'),
      ],
    },
    unresolvedAuditTrend: {
      fileKey: 'unresolved-audit-trend',
      evidence: [
        requiredLatestJson('reports/relation/reresolve-candidates*.json'),
      ],
    },
  },
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
        requiredLatestJson('reports/audit/image-source-lineage*.json'),
        requiredText('docs/contracts/image-source-contract.md'),
      ],
    },
    publicReadiness: {
      fileKey: 'public-readiness',
      evidence: [
        requiredText('scripts/data/relation/projection-schema.mjs'),
        requiredText('scripts/data/relation/projection-sync.mjs'),
        requiredText('back/src/main/java/com/terraria/skills/controller/PublicBossController.java'),
        requiredText('back/src/test/java/com/terraria/skills/controller/PublicBossControllerTest.java'),
      ],
    },
    unresolvedAuditTrend: {
      fileKey: 'unresolved-audit-trend',
      evidence: [
        requiredLatestJson('reports/relation/reresolve-candidates*.json'),
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
        requiredText('back/src/main/java/com/terraria/skills/controller/PublicBuffController.java'),
        requiredText('back/src/test/java/com/terraria/skills/controller/PublicBuffControllerTest.java'),
        optionalText('front-nuxt/pages/buffs/index.vue'),
        optionalDirectory('front-nuxt/pages'),
      ],
    },
    unresolvedAuditTrend: {
      fileKey: 'unresolved-audit-trend',
      evidence: [
        requiredLatestJson('reports/relation/reresolve-candidates*.json'),
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
        optionalLatestJson('reports/projectile-zh-image-backfill*.json'),
      ],
    },
    publicReadiness: {
      fileKey: 'public-readiness',
      evidence: [
        requiredText('back/src/main/java/com/terraria/skills/controller/PublicProjectileController.java'),
        requiredText('back/src/test/java/com/terraria/skills/controller/PublicProjectileControllerTest.java'),
        optionalText('front-nuxt/pages/projectiles/index.vue'),
        optionalDirectory('front-nuxt/pages'),
      ],
    },
    unresolvedAuditTrend: {
      fileKey: 'unresolved-audit-trend',
      evidence: [
        requiredLatestJson('reports/relation/reresolve-candidates*.json'),
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
        optionalSharedJson('raw/wiki/armor_set_images.parsed.latest.json'),
        optionalLatestJson('reports/fetch/fetch-armor-set-images*.json', { warnWhenMissing: false }),
      ],
    },
    publicReadiness: {
      fileKey: 'public-readiness',
      evidence: [
        requiredText('back/src/main/java/com/terraria/skills/controller/PublicArmorSetController.java'),
        requiredText('back/src/test/java/com/terraria/skills/controller/PublicArmorSetControllerTest.java'),
        optionalText('front-nuxt/pages/armor-sets/index.vue'),
        optionalDirectory('front-nuxt/pages'),
      ],
    },
    unresolvedAuditTrend: {
      fileKey: 'unresolved-audit-trend',
      evidence: [
        requiredLatestJson('reports/relation/reresolve-candidates*.json'),
      ],
    },
  },
  biomes: {
    sourceReadiness: {
      fileKey: 'source-readiness',
      evidence: [
        requiredJson('data/standardized/biomes.standardized.json'),
        optionalJson('data/generated/wiki-biomes.latest.json'),
      ],
    },
    imageReadiness: {
      fileKey: 'image-readiness',
      evidence: [
        requiredJson('data/standardized/biomes.standardized.json'),
        optionalJson('data/standardized-view/biomes/_meta.json'),
      ],
    },
    publicReadiness: {
      fileKey: 'public-readiness',
      evidence: [
        requiredText('back/src/main/java/com/terraria/skills/controller/PublicBiomeController.java'),
        requiredText('back/src/test/java/com/terraria/skills/controller/PublicBiomeControllerTest.java'),
        optionalText('front-nuxt/pages/biomes/index.vue'),
        optionalDirectory('front-nuxt/pages'),
      ],
    },
    unresolvedAuditTrend: {
      fileKey: 'unresolved-audit-trend',
      evidence: [
        requiredLatestJson('reports/relation/reresolve-candidates*.json'),
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
        requiredJson('reports/canonical-migration/canonical-recipe-formal-verification.json'),
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
        requiredJson('data/generated/shimmer/wiki-shimmer-current-generation.json'),
      ],
    },
    blockingGate: {
      fileKey: 'blocking-gate',
      evidence: [
        requiredJson(CANONICAL_SHIMMER_IMPORT_RESULT_PATH),
      ],
    },
  },
  'support.category': {
    sourceReadiness: {
      fileKey: 'source-readiness',
      evidence: [
        requiredJson('data/canonical/category/README.md', { type: 'text' }),
        optionalLatestJson('reports/relation/category-recipe-cutover-baseline*.json'),
      ],
    },
    blockingGate: {
      fileKey: 'blocking-gate',
      evidence: [
        optionalText('front-nuxt/pages/categories/index.vue'),
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
        optionalLatestJson('reports/wiki-town-npc-import*.json', { warnWhenMissing: false }),
        optionalLatestJson('reports/wiki-town-npc-maintenance*.json'),
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
  if (normalizedPanel === 'b1ExemptionCompliance') {
    return {
      ...buildSourceContractComplianceReport({
        repoRoot,
        domainId,
        generatedAt,
      }),
      reportPath: reportPath ?? null,
    };
  }
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
  if (normalizedPanel === 'b1ExemptionCompliance') {
    const dateKey = isoDateKey(generatedAt);
    return normalizePath(path.posix.join('reports/domain', domainId, `b1-exemption-compliance-${dateKey}.json`));
  }
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
    const status = evidence.required
      ? 'blocked'
      : evidence.warnWhenMissing === false
        ? 'pass'
        : 'warning';
    return {
      id: evidence.id,
      type: evidence.type,
      required: evidence.required,
      found: false,
      readable: false,
      evidencePath: evidence.path,
      latestReportPath: null,
      recordCount: null,
      status,
      message: `Missing ${evidence.required ? 'required' : 'optional'} evidence: ${evidence.path}`,
    };
  }

  try {
    assertShimmerEvidenceConfinement({
      repoRoot,
      domainId,
      panelId,
      evidence,
      resolvedPath: resolved.relativePath,
    });
  } catch (error) {
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
      message: `Rejected ${evidence.required ? 'required' : 'optional'} evidence: ${resolved.relativePath} (${error.message})`,
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
      return { readable: true, recordCount: null, payload: fs.readFileSync(fullPath, 'utf8') };
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
  const pathKey = normalizePath(evidence.path);
  if (domainId === 'support.shimmer'
      && panelId === 'sourceReadiness'
      && pathKey === 'data/generated/shimmer/wiki-shimmer-current-generation.json') {
    return shimmerCurrentGenerationSemantics({ repoRoot, payload, reportPath: resolvedPath });
  }
  if (domainId === 'support.shimmer'
      && panelId === 'blockingGate'
      && pathKey === CANONICAL_SHIMMER_IMPORT_RESULT_PATH) {
    return shimmerDbImportSemantics({ repoRoot, payload, reportPath: resolvedPath });
  }
  if (panelId !== 'blockingGate' || evidence.type !== 'json' || !evidence.latest) {
    return evaluateProductDomainSemantics({ repoRoot, evidence, domainId, panelId, resolvedPath, payload });
  }
  const supportSemanticStatus = evaluateSupportDomainBlockingSemantics({ repoRoot, evidence, domainId, resolvedPath, payload });
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
  if (panelId === 'unresolvedAuditTrend' && pathKey === 'reports/relation/reresolve-candidates*.json') {
    return unresolvedAuditTrendSemantics(payload, reportPath);
  }
  if (domainId === 'bosses' && panelId === 'sourceReadiness' && pathKey === 'data/generated/wiki-bosses.latest.json') {
    return bossSourceSemantics(payload, reportPath);
  }
  if (domainId === 'items' && panelId === 'imageReadiness' && pathKey === 'reports/workflow-image-sync*.json') {
    return imageSyncReportSemantics(payload, reportPath, 'items');
  }
  if (domainId === 'bosses' && panelId === 'sourceReadiness' && pathKey === 'reports/wiki-bosses-import*.json') {
    return bossImportSemantics(payload, reportPath);
  }
  if (domainId === 'bosses' && panelId === 'relationReadiness' && pathKey === 'reports/boss-loot-import*.json') {
    return bossLootImportSemantics(payload, reportPath);
  }
  if (domainId === 'bosses' && panelId === 'imageReadiness' && pathKey === 'reports/audit/image-source-lineage*.json') {
    return bossImageLineageSemantics(payload, reportPath);
  }
  if (domainId === 'bosses' && panelId === 'imageReadiness' && pathKey === 'docs/contracts/image-source-contract.md') {
    return bossImageContractSemantics(payload, reportPath);
  }
  if (domainId === 'bosses' && panelId === 'publicReadiness' && pathKey === 'scripts/data/relation/projection-schema.mjs') {
    return bossProjectionSchemaSemantics(payload, reportPath);
  }
  if (domainId === 'bosses' && panelId === 'publicReadiness' && pathKey === 'scripts/data/relation/projection-sync.mjs') {
    return bossProjectionSyncSemantics(payload, reportPath);
  }
  if (domainId === 'bosses' && panelId === 'publicReadiness' && pathKey === 'back/src/main/java/com/terraria/skills/controller/PublicBossController.java') {
    return bossPublicControllerSemantics(payload, reportPath);
  }
  if (domainId === 'bosses' && panelId === 'publicReadiness' && pathKey === 'back/src/test/java/com/terraria/skills/controller/PublicBossControllerTest.java') {
    return bossPublicControllerTestSemantics(payload, reportPath);
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
  if (['npcs', 'support.town_npc_maintenance'].includes(domainId)
    && panelId === 'sourceReadiness'
    && evidence.latest
    && pathKey === 'reports/wiki-town-npc-import*.json') {
    return townNpcLegacyImportSemantics(payload, reportPath);
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
  if (domainId === 'support.recipe' && panelId === 'sourceReadiness' && pathKey === 'data/generated/wiki-zh-recipe-pages.latest.json') {
    return recipeCrawlerSnapshotSemantics(payload, reportPath);
  }
  if (domainId === 'support.recipe'
    && panelId === 'sourceReadiness'
    && pathKey === 'reports/canonical-migration/canonical-recipe-formal-verification.json') {
    return recipeFormalVerificationSemantics(payload, reportPath, repoRoot);
  }
  return { status: 'pass', message: `Evidence present: ${resolvedPath}` };
}

function recipeFormalVerificationSemantics(payload, reportPath, repoRoot) {
  const blocking = [];
  requireGeneratedAt(payload, blocking);
  if (payload?.schemaVersion !== 1) blocking.push('schemaVersion must be 1');
  if (payload?.status !== 'passed') blocking.push('status is not passed');
  if (payload?.mode !== 'read-only') blocking.push('mode is not read-only');
  if (payload?.writesAttempted !== false) blocking.push('writesAttempted is not false');
  if (payload?.decisionId !== 'canonical-recipe-apply-20260729-03') {
    blocking.push('formal decision identity does not match the completed Recipe apply');
  }

  const inputArtifact = payload?.artifacts?.input;
  const pipelineArtifact = payload?.artifacts?.appliedPipeline;
  const standaloneArtifact = payload?.artifacts?.standaloneImport;
  if (inputArtifact?.path !== 'data/generated/wiki-zh-recipe-pages.latest.json' || !isRecipeSha256(inputArtifact?.sha256)) {
    blocking.push('canonical input artifact path or hash is invalid');
  }
  if (pipelineArtifact?.path !== 'reports/wiki-zh-recipe-sync-summary-2026-07-29.json' || !isRecipeSha256(pipelineArtifact?.sha256)) {
    blocking.push('applied pipeline artifact path or hash is invalid');
  }
  if (standaloneArtifact?.path !== 'reports/wiki-zh-recipe-import-2026-07-29.json' || !isRecipeSha256(standaloneArtifact?.sha256)) {
    blocking.push('standalone import artifact path or hash is invalid');
  }
  for (const [label, artifact] of [
    ['input', inputArtifact],
    ['applied pipeline', pipelineArtifact],
    ['standalone import', standaloneArtifact],
  ]) {
    if (!recipeArtifactHashMatches(repoRoot, artifact)) {
      blocking.push(`${label} artifact bytes do not match the verification hash`);
    }
  }
  if (payload?.input?.expectedSha256 !== inputArtifact?.sha256) {
    blocking.push('input artifact hash does not match the expected input hash');
  }

  const appliedImport = payload?.appliedPipeline?.import ?? {};
  const displayNameBackfill = payload?.appliedPipeline?.displayNameBackfill ?? {};
  const consolidation = payload?.appliedPipeline?.consolidation ?? {};
  const formal = payload?.formalScope ?? {};
  if (payload?.appliedPipeline?.apply !== true || appliedImport.apply !== true) {
    blocking.push('embedded Recipe import is not applied');
  }
  if (appliedImport.database !== 'terria_v1_local' || formal.database !== 'terria_v1_local') {
    blocking.push('embedded or formal database identity is invalid');
  }
  if (consolidation.apply !== true || consolidation.dryRun !== false) {
    blocking.push('embedded provider consolidation is not applied');
  }
  if (displayNameBackfill.apply !== true
    || displayNameBackfill.database !== 'terria_v1_local'
    || displayNameBackfill.groupIngredientsUpdated !== 124
    || displayNameBackfill.stationsUpdated !== 239
    || displayNameBackfill?.after?.groupIngredients?.needsSync !== 0
    || displayNameBackfill?.after?.ingredients?.needsSync !== 0
    || displayNameBackfill?.after?.stations?.needsSync !== 0) {
    blocking.push('embedded display-name backfill evidence is incomplete');
  }

  for (const [left, right, label] of [
    [payload?.input?.pageCount, appliedImport.inputPages, 'input page count'],
    [payload?.input?.recipeCount, appliedImport.inputRecipes, 'input recipe count'],
    [formal.wikiZhRecipes, appliedImport.importedRecipeCountInDb, 'wiki_zh recipe count'],
    [formal.wikiZhIngredients, appliedImport.insertedIngredientRows, 'wiki_zh ingredient count'],
    [formal.wikiZhStations, appliedImport.insertedStationRows, 'wiki_zh station count'],
    [formal.totalRecipes, consolidation?.after?.recipeRows, 'formal total recipe count'],
    [formal.consolidationRecipeRows, consolidation?.after?.recipeRows, 'consolidation recipe count'],
    [formal.activeRecipeRows, consolidation?.after?.activeRecipeRows, 'active recipe count'],
    [formal.resultItems, consolidation?.after?.resultItems, 'result item count'],
    [formal.activeResultItems, consolidation?.after?.activeResultItems, 'active result item count'],
  ]) {
    if (!isNonNegativeNumber(left) || left !== right) blocking.push(`${label} does not match authoritative evidence`);
  }
  if (!isRecipeSha256(appliedImport.recipeScopeHashTarget)) {
    blocking.push('import-stage projection hash is invalid');
  }
  if (!isRecipeSha256(payload?.expectedFinalProjectionHash)
    || formal.projectionHash !== payload.expectedFinalProjectionHash) {
    blocking.push('formal projection hash does not match the expected post-backfill scope');
  }
  if (formal.unresolvedItems !== 0 || formal.unresolvedStations !== 0) {
    blocking.push('formal Recipe scope contains unresolved relations');
  }
  if (!Array.isArray(payload?.checks)
    || payload.checks.length === 0
    || payload.checks.some((check) => check?.status !== 'passed')) {
    blocking.push('verification checks are missing or not all passed');
  }
  if (!Array.isArray(payload?.blockingReasons) || payload.blockingReasons.length !== 0) {
    blocking.push('verification report contains blocking reasons');
  }

  return semanticResult({
    reportPath,
    cleanMessage: `Recipe formal read-only verification is clean in ${reportPath}; standalone import=${payload?.standaloneImport?.classification ?? 'unknown'}`,
    blocking,
    warnings: [],
  });
}

function isRecipeSha256(value) {
  return /^[a-f0-9]{64}$/.test(String(value ?? ''));
}

function recipeArtifactHashMatches(repoRoot, artifact) {
  if (!artifact?.path || !isRecipeSha256(artifact?.sha256)) return false;
  try {
    const fullPath = path.resolve(repoRoot, artifact.path);
    const root = path.resolve(repoRoot);
    if (!fullPath.startsWith(`${root}${path.sep}`)) return false;
    const actual = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
    return actual === artifact.sha256;
  } catch {
    return false;
  }
}

function unresolvedAuditTrendSemantics(payload, reportPath) {
  const unresolvedAuditCount = Number(payload?.summary?.unresolvedAuditCount);
  const candidateCount = Number(payload?.summary?.candidateCount);
  const delta = Number.isFinite(payload?.trend?.delta) ? payload.trend.delta : null;
  const direction = String(payload?.trend?.direction ?? 'unknown');
  const blocking = [];
  const warnings = [];

  if (!Number.isFinite(unresolvedAuditCount) || unresolvedAuditCount < 0) {
    blocking.push('summary.unresolvedAuditCount is missing or invalid');
  }
  if (!Number.isFinite(candidateCount) || candidateCount < 0) {
    blocking.push('summary.candidateCount is missing or invalid');
  }
  if (direction === 'up' && delta != null && delta > 0) {
    blocking.push(`unresolved audit trend is rising (delta=${delta})`);
  } else if (delta == null || direction === 'unknown') {
    warnings.push('historical baseline is unavailable for unresolved audit trend');
  }

  return semanticResult({
    reportPath,
    cleanMessage: `unresolved audit trend is stable in ${reportPath}`,
    blocking,
    warnings,
  });
}

function evaluateSupportDomainBlockingSemantics({ repoRoot, evidence, domainId, resolvedPath, payload }) {
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
  if (domainId === 'support.item_group' && pathKey === 'reports/item-groups/any-item-group-source-audit*.json') {
    return itemGroupSourceAuditSemantics(payload, reportPath);
  }
  return null;
}

function recipeProviderConsolidationSemantics(payload, reportPath) {
  const blocking = [];
  const warnings = [];
  requireGeneratedAt(payload, blocking);
  if (payload?.apply !== true || payload?.dryRun === true) {
    blocking.push('recipe consolidation report is not from an applied run');
  }
  for (const snapshotName of ['before', 'after']) {
    const snapshot = payload?.[snapshotName];
    for (const key of ['recipeRows', 'activeRecipeRows', 'resultItems', 'activeResultItems']) {
      if (!isNonNegativeNumber(snapshot?.[key])) {
        blocking.push(`${snapshotName}.${key} is missing or invalid`);
      }
    }
  }
  const after = payload?.after;
  if (after && after.activeResultItems !== after.resultItems) {
    blocking.push(`activeResultItems=${after.activeResultItems} does not match resultItems=${after.resultItems}`);
  }
  const metrics = pickFiniteMetrics(payload?.changes, ['gapOnlyResultItems', 'gapOnlyRecipeRows']);
  warnings.push(...baselineWarnings(metrics, DOMAIN_ACCEPTANCE_BASELINES.recipeProviderConsolidation));
  return semanticResult({
    reportPath,
    cleanMessage: `recipe provider consolidation semantic gates are clean in ${reportPath}; non-blocking metrics within baseline: ${formatMetricsWithBaseline(metrics, DOMAIN_ACCEPTANCE_BASELINES.recipeProviderConsolidation)}`,
    blocking,
    warnings,
  });
}

function recipeProviderSuppressionSemantics(payload, reportPath) {
  const blocking = [];
  requireGeneratedAt(payload, blocking);
  for (const key of ['totalRecipeCount', 'activeRecipeCount', 'recipeItemCount', 'focusProviderItemCount', 'candidateCount']) {
    if (!isNonNegativeNumber(payload?.summary?.[key])) {
      blocking.push(`summary.${key} is missing or invalid`);
    }
  }
  if (!Array.isArray(payload?.topCandidates)) {
    blocking.push('topCandidates is missing or invalid');
  }
  const metrics = pickFiniteMetrics(payload?.summary, ['candidateCount']);
  const warnings = baselineWarnings(metrics, DOMAIN_ACCEPTANCE_BASELINES.recipeProviderSuppression);
  return semanticResult({
    reportPath,
    cleanMessage: `recipe provider suppression semantic gates are clean in ${reportPath}; non-blocking metrics within baseline: ${formatMetricsWithBaseline(metrics, DOMAIN_ACCEPTANCE_BASELINES.recipeProviderSuppression)}`,
    blocking,
    warnings,
  });
}

function recipeSourceCoverageSemantics(payload, reportPath) {
  const blocking = [];
  requireGeneratedAt(payload, blocking);
  const comparison = payload?.comparison ?? {};
  for (const key of ['missingFromWikiZhDbCount', 'extraInWikiZhDbCount', 'trulyMissingEverywhereCount']) {
    const value = comparison[key];
    if (!isNonNegativeNumber(value)) {
      blocking.push(`${key} is missing or invalid`);
    } else if (value > 0) {
      blocking.push(`${key}=${value}`);
    }
  }
  for (const key of ['sourceRecipes', 'wikiZhDbRecipes', 'activeDbRecipes']) {
    if (!isNonNegativeNumber(payload?.[key])) {
      blocking.push(`${key} is missing or invalid`);
    }
  }
  for (const key of ['missingFromActiveDbCount', 'suppressedButPresentCount']) {
    if (!isNonNegativeNumber(comparison[key])) {
      blocking.push(`${key} is missing or invalid`);
    }
  }
  if (isNonNegativeNumber(payload?.sourceRecipes)
    && isNonNegativeNumber(payload?.wikiZhDbRecipes)
    && payload.sourceRecipes !== payload.wikiZhDbRecipes) {
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

function shimmerCurrentGenerationSemantics({ repoRoot, payload, reportPath }) {
  const blocking = [];
  try {
    verifyCurrentShimmerGenerationPointer({ repoRoot, pointer: payload });
  } catch (error) {
    blocking.push(`current Shimmer generation pointer is invalid: ${error.message}`);
  }
  return semanticResult({
    reportPath,
    cleanMessage: `current Shimmer generation pointer is verified in ${reportPath}`,
    blocking,
  });
}

function shimmerDbImportSemantics({ repoRoot, payload, reportPath }) {
  const blocking = [];
  if (!isPrivateOrdinaryEvidenceFile({ repoRoot, relativePath: reportPath })) {
    blocking.push('completed Shimmer import result must be a private ordinary file');
  }
  requireGeneratedAt(payload, blocking);
  if (payload?.operationId !== CANONICAL_SHIMMER_IMPORT_OPERATION_ID) {
    blocking.push(`operationId must be ${CANONICAL_SHIMMER_IMPORT_OPERATION_ID}`);
  }
  if (payload?.apply !== true) {
    blocking.push('shimmer import result is not from an applied run');
  }
  if (payload?.status !== 'completed') {
    blocking.push(`shimmer import result status must be completed, received ${payload?.status ?? 'missing'}`);
  }
  if (payload?.transaction?.status !== 'completed') {
    blocking.push('shimmer import result transaction is not completed');
  }

  let verified = null;
  try {
    verified = verifyCurrentShimmerGenerationPointer({ repoRoot, pointer: readCurrentShimmerPointer(repoRoot) });
  } catch (error) {
    blocking.push(`current Shimmer generation pointer is invalid: ${error.message}`);
  }
  if (verified != null) {
    assertShimmerResultMatchesGeneration({ payload, verified, blocking });
  }

  return semanticResult({
    reportPath,
    cleanMessage: `Shimmer import binds the current verified generation and completed private result in ${reportPath}`,
    blocking,
  });
}

function readCurrentShimmerPointer(repoRoot) {
  const pointerPath = assertCurrentShimmerPointerPath(repoRoot);
  return JSON.parse(fs.readFileSync(pointerPath, 'utf8'));
}

function verifyCurrentShimmerGenerationPointer({ repoRoot, pointer }) {
  const requiredFields = [
    'schemaVersion',
    'entity',
    'generationId',
    'manifestPath',
    'manifestSha256',
    'dataBundleSha256',
    'generatedAt',
  ];
  if (!pointer || typeof pointer !== 'object' || Array.isArray(pointer)
      || JSON.stringify(Object.keys(pointer).sort()) !== JSON.stringify(requiredFields.sort())) {
    throw new Error('pointer must contain exactly the current-generation fields');
  }
  if (pointer.schemaVersion !== 1 || pointer.entity !== 'wiki_shimmer_current_generation') {
    throw new Error('pointer entity or schema version is invalid');
  }
  if (!/^[a-f0-9]{64}$/.test(String(pointer.generationId ?? ''))
      || !isSha256(pointer.manifestSha256)
      || !isSha256(pointer.dataBundleSha256)
      || !isTimestamp(pointer.generatedAt)) {
    throw new Error('pointer generation identity is invalid');
  }
  const expectedRelativeManifestPath = `generations/${pointer.generationId}/wiki-shimmer-manifest.json`;
  if (pointer.manifestPath !== expectedRelativeManifestPath) {
    throw new Error('pointer manifest path does not name its content-addressed generation');
  }
  const root = path.resolve(repoRoot);
  assertCurrentShimmerPointerPath(root);
  const generationRoot = path.join(root, 'data/generated/shimmer/generations');
  const manifestPath = path.resolve(root, 'data/generated/shimmer', pointer.manifestPath);
  if (!manifestPath.startsWith(`${path.resolve(generationRoot)}${path.sep}`)) {
    throw new Error('pointer manifest path escapes the generation root');
  }
  assertRepositoryOrdinaryDirectory({
    repoRoot: root,
    filePath: generationRoot,
    label: 'pointer generation root',
  });
  assertRepositoryOrdinaryFile({
    repoRoot: root,
    filePath: manifestPath,
    label: 'pointer manifest',
  });
  const realRepoRoot = fs.realpathSync(root);
  const realGenerationRoot = fs.realpathSync(generationRoot);
  if (!isPathInside(realRepoRoot, realGenerationRoot)) {
    throw new Error('pointer generation root must resolve inside the repository root');
  }
  const realManifestPath = fs.realpathSync(manifestPath);
  if (!isPathInside(realGenerationRoot, realManifestPath)) {
    throw new Error('pointer manifest must resolve inside the canonical generation root');
  }
  const verified = verifyShimmerGeneration({ manifestPath });
  if (verified.manifest.generationId !== pointer.generationId
      || verified.manifest.manifestSha256 !== pointer.manifestSha256
      || verified.manifest.dataBundleSha256 !== pointer.dataBundleSha256
      || verified.manifest.generatedAt !== pointer.generatedAt) {
    throw new Error('pointer identity does not match its verified generation manifest');
  }
  return verified;
}

function assertShimmerResultMatchesGeneration({ payload, verified, blocking }) {
  const { manifest } = verified;
  if (payload?.generationId !== manifest.generationId) {
    blocking.push('completed Shimmer import generationId does not match the current pointer');
  }
  if (payload?.manifestSha256 !== manifest.manifestSha256) {
    blocking.push('completed Shimmer import manifest hash does not match the current pointer');
  }
  if (payload?.dataBundleSha256 !== manifest.dataBundleSha256) {
    blocking.push('completed Shimmer import data bundle hash does not match the current pointer');
  }
  if (!isSha256(payload?.previewSha256)) {
    blocking.push('completed Shimmer import preview hash is missing or invalid');
  }
  if (!hasExpectedShimmerProviderScope(payload?.providerScope)) {
    blocking.push('completed Shimmer import provider scope is outside wiki_zh/微光');
  }
  const target = normalizeShimmerTarget(payload?.target);
  if (target == null || !isSha256(payload?.targetFingerprintSha256)
      || hashCanonical(target) !== payload.targetFingerprintSha256) {
    blocking.push('completed Shimmer import target fingerprint is missing or does not match the target descriptor');
  }

  const preview = {
    schemaVersion: 1,
    operationId: CANONICAL_SHIMMER_IMPORT_OPERATION_ID,
    providerScope: payload?.providerScope,
    generationId: payload?.generationId,
    dataBundleSha256: payload?.dataBundleSha256,
    manifestSha256: payload?.manifestSha256,
    target: payload?.target,
    targetFingerprintSha256: payload?.targetFingerprintSha256,
    tables: payload?.tables,
    worldContext: payload?.worldContext,
    snapshots: payload?.snapshots,
  };
  if (isSha256(payload?.previewSha256) && hashCanonical(preview) !== payload.previewSha256) {
    blocking.push('completed Shimmer import preview descriptor does not match previewSha256');
  }

  const descriptorByName = new Map(manifest.files.map((descriptor) => [descriptor.name, descriptor]));
  const context = descriptorByName.get('wiki-shimmer-context.importable.json');
  if (context?.recordCount !== 1) {
    blocking.push('current Shimmer generation must contain exactly one context record');
  }
  assertShimmerDescriptor({
    descriptor: payload?.worldContext?.before,
    tableName: 'world_contexts',
    label: 'world context preview before',
    blocking,
  });
  assertShimmerDescriptor({
    descriptor: payload?.worldContext?.after,
    tableName: 'world_contexts',
    label: 'world context after',
    expectedCount: context?.recordCount,
    blocking,
  });

  const tables = [
    ['shimmer_item_transforms', 'wiki-shimmer-item-transforms.importable.json'],
    ['shimmer_decraft_rules', 'wiki-shimmer-decraft-rules.importable.json'],
    ['shimmer_entity_transforms', 'wiki-shimmer-entity-transforms.importable.json'],
    ['shimmer_npc_transforms', 'wiki-shimmer-npc-transforms.importable.json'],
  ];
  if (!payload?.tables || typeof payload.tables !== 'object' || Array.isArray(payload.tables)
      || JSON.stringify(Object.keys(payload.tables).sort()) !== JSON.stringify(tables.map(([name]) => name).sort())) {
    blocking.push('completed Shimmer import does not report exactly the provider-owned tables');
  }
  for (const [tableName, fileName] of tables) {
    const expectedCount = descriptorByName.get(fileName)?.recordCount;
    assertShimmerDescriptor({
      descriptor: payload?.tables?.[tableName]?.before,
      tableName,
      label: `${tableName} preview before`,
      blocking,
    });
    assertShimmerDescriptor({
      descriptor: payload?.tables?.[tableName]?.after,
      tableName,
      label: `${tableName} after`,
      expectedCount,
      blocking,
    });
  }

  assertShimmerSnapshotCoverage({
    before: payload?.snapshots?.before,
    after: payload?.snapshots?.after,
    manifest,
    blocking,
  });

  const titleResolution = readShimmerGenerationPayload(
    verified.generationPath,
    'wiki-shimmer-title-resolution.evidence.json',
  );
  if (!Array.isArray(titleResolution?.records)) {
    blocking.push('current Shimmer generation title-resolution evidence is unreadable');
  } else {
    const invalidKinds = titleResolution.records.filter((record) => (
      !['item', 'item_group', 'npc', 'none'].includes(record?.kind)
    ));
    if (invalidKinds.length > 0) {
      const unresolved = invalidKinds.filter((record) => record?.kind === 'unresolved').length;
      const ambiguous = invalidKinds.filter((record) => record?.kind === 'ambiguous').length;
      blocking.push(
        `current Shimmer generation has non-importable title identities=${invalidKinds.length}`
        + ` (unresolved=${unresolved}, ambiguous=${ambiguous})`,
      );
    }
  }
}

function assertShimmerDescriptor({ descriptor, tableName, label, expectedCount = null, blocking }) {
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)
      || !isNonNegativeNumber(descriptor.count)
      || !isSha256(descriptor.keySha256)
      || !isSha256(descriptor.sha256)
      || !Array.isArray(descriptor.logicalKeys)
      || descriptor.logicalKeys.length !== descriptor.count) {
    blocking.push(`${label} descriptor is missing or invalid`);
    return;
  }
  if (descriptor.keySha256 !== hashCanonical({ tableName, rows: descriptor.logicalKeys })) {
    blocking.push(`${label} logical-key hash does not match its descriptor`);
  }
  if (expectedCount != null && descriptor.count !== expectedCount) {
    blocking.push(`${label} count=${descriptor.count} does not match the verified manifest count=${expectedCount}`);
  }
}

function assertShimmerSnapshotCoverage({ before, after, manifest, blocking }) {
  assertShimmerDescriptor({
    descriptor: before,
    tableName: 'entity_source_snapshots',
    label: 'snapshot preview before',
    blocking,
  });
  assertShimmerDescriptor({
    descriptor: after,
    tableName: 'entity_source_snapshots',
    label: 'snapshot after',
    blocking,
  });

  const beforeKeys = snapshotLogicalKeyMap(before?.logicalKeys, 'snapshot preview before', blocking);
  const afterKeys = snapshotLogicalKeyMap(after?.logicalKeys, 'snapshot after', blocking);
  const currentGenerationKeys = snapshotLogicalKeyMap(
    currentShimmerSnapshotLogicalKeys(manifest),
    'current Shimmer generation snapshot',
    blocking,
  );
  if (beforeKeys == null || afterKeys == null || currentGenerationKeys == null) return;

  const expectedAfterKeys = new Map([...beforeKeys, ...currentGenerationKeys]);
  if (!sameLogicalKeySets(afterKeys, expectedAfterKeys)) {
    blocking.push('completed Shimmer import snapshot keys do not match the frozen preview plus current generation');
  }

  if (!Array.isArray(after?.descriptors) || after.descriptors.length !== after.count) {
    blocking.push('completed Shimmer import snapshot descriptors are missing or incomplete');
    return;
  }
  const descriptorKeys = new Map();
  for (const entry of after.descriptors) {
    if (!entry?.logicalKey || typeof entry.logicalKey !== 'object' || Array.isArray(entry.logicalKey)
        || !isSha256(entry.payloadSha256)) {
      blocking.push('completed Shimmer import snapshot descriptors are missing or incomplete');
      return;
    }
    const key = canonicalLogicalKey(entry.logicalKey);
    if (!afterKeys.has(key) || descriptorKeys.has(key)) {
      blocking.push('completed Shimmer import snapshot descriptors do not match snapshot logical keys');
      return;
    }
    descriptorKeys.set(key, entry);
  }
  if (!sameLogicalKeySets(descriptorKeys, afterKeys)) {
    blocking.push('completed Shimmer import snapshot descriptors do not cover every snapshot logical key');
  }
}

function currentShimmerSnapshotLogicalKeys(manifest) {
  const generationPath = `data/generated/shimmer/generations/${manifest.generationId}`;
  return [
    ['wiki_shimmer_page', 'wiki_page', 'wiki-shimmer.raw.json'],
    ['wiki_shimmer_context', 'generated_json', 'wiki-shimmer-context.importable.json'],
    ['wiki_shimmer_item_transforms', 'generated_json', 'wiki-shimmer-item-transforms.importable.json'],
    ['wiki_shimmer_decraft_rules', 'generated_json', 'wiki-shimmer-decraft-rules.importable.json'],
    ['wiki_shimmer_entity_transforms', 'generated_json', 'wiki-shimmer-entity-transforms.importable.json'],
    ['wiki_shimmer_npc_transforms', 'generated_json', 'wiki-shimmer-npc-transforms.importable.json'],
    ['wiki_shimmer_manifest', 'generated_json', 'wiki-shimmer-manifest.json'],
  ].map(([entityType, sourceKind, fileName]) => ({
    entityType,
    provider: SHIMMER_IMPORT_PROVIDER_SCOPE.provider,
    sourceKind,
    sourceLocator: `${generationPath}/${fileName}`,
  }));
}

function snapshotLogicalKeyMap(logicalKeys, label, blocking) {
  if (!Array.isArray(logicalKeys)) return null;
  const keys = new Map();
  for (const logicalKey of logicalKeys) {
    if (!logicalKey || typeof logicalKey !== 'object' || Array.isArray(logicalKey)) {
      blocking.push(`${label} contains an invalid logical key`);
      return null;
    }
    const key = canonicalLogicalKey(logicalKey);
    if (keys.has(key)) {
      blocking.push(`${label} contains a duplicate logical key`);
      return null;
    }
    keys.set(key, logicalKey);
  }
  return keys;
}

function canonicalLogicalKey(value) {
  return JSON.stringify(stableValue(value));
}

function sameLogicalKeySets(left, right) {
  return left.size === right.size && [...left.keys()].every((key) => right.has(key));
}

function isPrivateOrdinaryEvidenceFile({ repoRoot, relativePath }) {
  try {
    const root = path.resolve(repoRoot);
    const filePath = path.resolve(root, relativePath);
    if (!filePath.startsWith(`${root}${path.sep}`)) return false;
    assertRepositoryOrdinaryFile({
      repoRoot: root,
      filePath,
      label: 'completed Shimmer import result',
    });
    const stat = fs.lstatSync(filePath);
    return (stat.mode & 0o077) === 0;
  } catch {
    return false;
  }
}

function assertShimmerEvidenceConfinement({ repoRoot, domainId, panelId, evidence, resolvedPath }) {
  const pathKey = normalizePath(evidence.path);
  if (domainId === 'support.shimmer'
      && panelId === 'sourceReadiness'
      && pathKey === 'data/generated/shimmer/wiki-shimmer-current-generation.json') {
    assertCurrentShimmerPointerPath(repoRoot);
    return;
  }
  if (domainId === 'support.shimmer'
      && panelId === 'blockingGate'
      && pathKey === CANONICAL_SHIMMER_IMPORT_RESULT_PATH) {
    const root = path.resolve(repoRoot);
    assertRepositoryOrdinaryFile({
      repoRoot: root,
      filePath: path.resolve(root, resolvedPath),
      label: 'completed Shimmer import result',
    });
  }
}

function assertCurrentShimmerPointerPath(repoRoot) {
  const root = path.resolve(repoRoot);
  return assertRepositoryOrdinaryFile({
    repoRoot: root,
    filePath: path.join(root, 'data/generated/shimmer/wiki-shimmer-current-generation.json'),
    label: 'current Shimmer generation pointer',
  });
}

function readShimmerGenerationPayload(generationPath, fileName) {
  try {
    return JSON.parse(fs.readFileSync(path.join(generationPath, fileName), 'utf8'));
  } catch {
    return null;
  }
}

function hasExpectedShimmerProviderScope(scope) {
  return scope != null
    && typeof scope === 'object'
    && !Array.isArray(scope)
    && JSON.stringify(Object.keys(scope).sort()) === JSON.stringify(['provider', 'sourcePage', 'tables'])
    && scope.provider === SHIMMER_IMPORT_PROVIDER_SCOPE.provider
    && scope.sourcePage === SHIMMER_IMPORT_PROVIDER_SCOPE.sourcePage
    && JSON.stringify(scope.tables) === JSON.stringify(SHIMMER_IMPORT_PROVIDER_SCOPE.tables);
}

function normalizeShimmerTarget(target) {
  const host = String(target?.host ?? '').trim();
  const database = String(target?.database ?? '').trim();
  const serverUuid = String(target?.serverUuid ?? '').trim();
  const port = Number(target?.port);
  if (!host || !database || !serverUuid || !Number.isInteger(port) || port <= 0) return null;
  return { host, port, database, serverUuid };
}

function isTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isSha256(value) {
  return /^sha256:[a-f0-9]{64}$/.test(String(value ?? ''));
}

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`)
    && relative !== '..' && !path.isAbsolute(relative);
}

function hashCanonical(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(stableValue(value)), 'utf8').digest('hex')}`;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
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

function bossImageLineageSemantics(payload, reportPath) {
  const bossEntry = payload?.entities?.bosses;
  const blocking = [];
  const warnings = [];
  if (!bossEntry || typeof bossEntry !== 'object') {
    blocking.push('bosses lineage entry is missing');
  } else if (bossEntry.contractReady !== true) {
    const gaps = Array.isArray(bossEntry.gapReasons) ? bossEntry.gapReasons.filter(Boolean) : [];
    warnings.push(`boss image lineage is not contract-ready: ${gaps.length > 0 ? gaps.join(', ') : 'unknown gaps'}`);
  }
  return semanticResult({
    reportPath,
    cleanMessage: `boss image lineage contract is ready in ${reportPath}`,
    blocking,
    warnings,
  });
}

function bossImageContractSemantics(payload, reportPath) {
  const text = String(payload ?? '');
  const blocking = [];
  if (!text.includes('boss_groups.image_url')) {
    blocking.push('boss image contract is missing boss_groups.image_url');
  }
  if (!text.includes('maint_bosses.image_url')) {
    blocking.push('boss image contract is missing maint_bosses.image_url');
  }
  if (!text.includes('relation_bosses.image_url')) {
    blocking.push('boss image contract is missing relation_bosses.image_url');
  }
  if (!text.includes('projection_bosses.image_url')) {
    blocking.push('boss image contract is missing projection_bosses.image_url');
  }
  return semanticResult({
    reportPath,
    cleanMessage: `boss image contract is documented in ${reportPath}`,
    blocking,
  });
}

function bossProjectionSchemaSemantics(payload, reportPath) {
  const text = String(payload ?? '');
  const blocking = [];
  for (const token of ['projection_bosses', 'code', 'image_url', 'member_npcs_json', 'loot_items_json', 'effects_json']) {
    if (!text.includes(token)) {
      blocking.push(`boss projection schema is missing ${token}`);
    }
  }
  return semanticResult({
    reportPath,
    cleanMessage: `boss projection schema evidence is ready in ${reportPath}`,
    blocking,
  });
}

function bossProjectionSyncSemantics(payload, reportPath) {
  const text = String(payload ?? '');
  const blocking = [];
  for (const token of ['projectionBosses', 'relationBosses', 'bossItemRewardRelations', 'bossEffectRelations']) {
    if (!text.includes(token)) {
      blocking.push(`boss projection sync is missing ${token}`);
    }
  }
  return semanticResult({
    reportPath,
    cleanMessage: `boss projection sync evidence is ready in ${reportPath}`,
    blocking,
  });
}

function bossPublicControllerSemantics(payload, reportPath) {
  const text = String(payload ?? '');
  const warnings = [];
  if (!text.includes('/public/bosses')) {
    warnings.push('public boss controller does not expose /public/bosses');
  }
  return semanticResult({
    reportPath,
    cleanMessage: `boss public controller evidence is ready in ${reportPath}`,
    warnings,
  });
}

function bossPublicControllerTestSemantics(payload, reportPath) {
  const text = String(payload ?? '');
  const warnings = [];
  if (!/class\s+PublicBossControllerTest/.test(text)) {
    warnings.push('public boss controller test class is missing');
  }
  if (!text.includes('publicReadiness') && !text.includes('/public/bosses')) {
    warnings.push('public boss controller test does not reference the public boss route contract');
  }
  return semanticResult({
    reportPath,
    cleanMessage: `boss public controller test evidence is ready in ${reportPath}`,
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
  requireGeneratedAt(payload, blocking);
  if (payload?.apply !== true) {
    blocking.push('projectile backfill report is not from an applied run');
  }
  for (const key of ['sourceMapCount', 'total', 'totalAvailable', 'imageResolved', 'unresolvedImage', 'unresolvedZh']) {
    if (!isNonNegativeNumber(payload?.[key])) {
      blocking.push(`${key} is missing or invalid`);
    }
  }
  if (isNonNegativeNumber(payload?.total)
    && isNonNegativeNumber(payload?.totalAvailable)
    && payload.total !== payload.totalAvailable) {
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

function imageSyncReportSemantics(payload, reportPath, scope) {
  const blocking = [];
  requireGeneratedAt(payload, blocking);
  if (payload?.apply !== true) {
    blocking.push('image sync report is not from an applied run');
  }
  if (!Array.isArray(payload?.scopes) || !payload.scopes.includes(scope)) {
    blocking.push(`image sync scopes do not include ${scope}`);
  }
  const module = payload?.modules?.[scope];
  if (!module || typeof module !== 'object' || Array.isArray(module)) {
    blocking.push(`image sync module ${scope} is missing`);
  } else {
    if (module.apply !== true) {
      blocking.push(`image sync module ${scope} is not applied`);
    }
    for (const key of ['total', 'candidates', 'alreadyManaged', 'uploaded', 'changed', 'missingSource']) {
      if (!isNonNegativeNumber(module[key])) {
        blocking.push(`image sync module ${scope}.${key} is missing or invalid`);
      }
    }
    if (isNonNegativeNumber(module.total) && module.total <= 0) {
      blocking.push(`image sync module ${scope}.total is zero`);
    }
    if (isNonNegativeNumber(module.missingSource) && module.missingSource > 0) {
      blocking.push(`image sync module ${scope}.missingSource=${module.missingSource}`);
    }
    // A reused object is a completed candidate too: it was already in managed
    // storage under the verified file title, so the equation must count it or a
    // run that reused most of its images reads as broken.
    const reused = isNonNegativeNumber(module.reused) ? module.reused : 0;
    const normalizedCount = Array.isArray(module.normalizedKeys)
      ? module.normalizedKeys.length
      : 0;
    const regularRunComplete = isNonNegativeNumber(module.candidates)
      && isNonNegativeNumber(module.uploaded)
      && isNonNegativeNumber(module.alreadyManaged)
      && module.candidates === module.uploaded + reused + module.alreadyManaged;
    const boundedLegacyRepairComplete = isNonNegativeNumber(module.total)
      && isNonNegativeNumber(module.candidates)
      && isNonNegativeNumber(module.uploaded)
      && isNonNegativeNumber(module.alreadyManaged)
      && isNonNegativeNumber(module.changed)
      && module.candidates + module.alreadyManaged === module.total
      && normalizedCount === module.candidates
      && module.uploaded === 0
      && reused === 0
      && module.changed === module.candidates;
    if (!regularRunComplete && !boundedLegacyRepairComplete) {
      blocking.push(
        `image sync module ${scope}.candidates=${module.candidates} does not match `
        + `uploaded+reused+alreadyManaged=${module.uploaded + reused + module.alreadyManaged}`
      );
    }
    if (Array.isArray(module.failedKeys) && module.failedKeys.length > 0) {
      blocking.push(`image sync module ${scope} has ${module.failedKeys.length} failed image(s)`);
    }
  }
  if (payload?.status != null && payload.status !== 'completed') {
    blocking.push(`image sync report status is ${payload.status}`);
  }
  if (Array.isArray(payload?.failedKeys) && payload.failedKeys.length > 0) {
    blocking.push(`image sync reports ${payload.failedKeys.length} failed image(s)`);
  }
  return semanticResult({
    reportPath,
    cleanMessage: `${scope} image sync semantic gates are clean in ${reportPath}`,
    blocking,
  });
}

function bossImportSemantics(payload, reportPath) {
  const blocking = [];
  requireGeneratedAt(payload, blocking);
  if (payload?.dryRun !== false) {
    blocking.push('boss import report is not from a formal run');
  }
  for (const key of ['totalBosses', 'createdBossGroups', 'updatedBossGroups', 'mappedBosses', 'unmappedBosses']) {
    if (!isNonNegativeNumber(payload?.[key])) {
      blocking.push(`${key} is missing or invalid`);
    }
  }
  if (isNonNegativeNumber(payload?.totalBosses) && payload.totalBosses <= 0) {
    blocking.push('totalBosses is zero');
  }
  if (isNonNegativeNumber(payload?.totalBosses)
    && isNonNegativeNumber(payload?.createdBossGroups)
    && isNonNegativeNumber(payload?.updatedBossGroups)
    && payload.createdBossGroups + payload.updatedBossGroups !== payload.totalBosses) {
    blocking.push(`createdBossGroups + updatedBossGroups does not match totalBosses=${payload.totalBosses}`);
  }
  if (isNonNegativeNumber(payload?.totalBosses)
    && isNonNegativeNumber(payload?.mappedBosses)
    && isNonNegativeNumber(payload?.unmappedBosses)
    && payload.mappedBosses + payload.unmappedBosses !== payload.totalBosses) {
    blocking.push(`mappedBosses + unmappedBosses does not match totalBosses=${payload.totalBosses}`);
  }
  requireZeroCounters(payload, blocking, [
    'unmappedBosses',
    'remainingWikiBossImages',
    'remainingWikiBossMemberImages',
    'bossMemberImageMissingSource',
    'failedBossImages',
    'failedBossMemberImages',
  ]);
  requireEmptyArray(payload, 'unresolvedBosses', blocking);
  return semanticResult({
    reportPath,
    cleanMessage: `boss import semantic gates are clean in ${reportPath}`,
    blocking,
  });
}

function bossLootImportSemantics(payload, reportPath) {
  const blocking = [];
  requireGeneratedAt(payload, blocking);
  if (payload?.dryRun !== false) {
    blocking.push('boss loot import report is not from a formal run');
  }
  for (const key of ['totalBossRecords', 'totalDropRecords', 'targetedBossGroups', 'importedBosses', 'skippedBosses', 'insertedLootRows', 'updatedLootRows', 'removedLootRows', 'skippedLootRows']) {
    if (!isNonNegativeNumber(payload?.[key])) {
      blocking.push(`${key} is missing or invalid`);
    }
  }
  if (isNonNegativeNumber(payload?.totalBossRecords) && payload.totalBossRecords <= 0) {
    blocking.push('totalBossRecords is zero');
  }
  if (isNonNegativeNumber(payload?.totalDropRecords) && payload.totalDropRecords <= 0) {
    blocking.push('totalDropRecords is zero');
  }
  if (isNonNegativeNumber(payload?.totalBossRecords)
    && isNonNegativeNumber(payload?.importedBosses)
    && isNonNegativeNumber(payload?.skippedBosses)
    && payload.importedBosses + payload.skippedBosses !== payload.totalBossRecords) {
    blocking.push(`importedBosses + skippedBosses does not match totalBossRecords=${payload.totalBossRecords}`);
  }
  requireEmptyArray(payload, 'unresolvedBosses', blocking);
  requireEmptyArray(payload, 'unresolvedItems', blocking);
  return semanticResult({
    reportPath,
    cleanMessage: `boss loot import semantic gates are clean in ${reportPath}`,
    blocking,
  });
}

function recipeCrawlerSnapshotSemantics(payload, reportPath) {
  const blocking = [];
  requireGeneratedAt(payload, blocking);
  if (payload?.entity !== 'wiki_zh_recipe_pages') {
    blocking.push('entity is not wiki_zh_recipe_pages');
  }
  if (isBlank(payload?.sourceApi)) {
    blocking.push('sourceApi is missing');
  }
  if (!Array.isArray(payload?.requestedPages) || payload.requestedPages.length === 0) {
    blocking.push('requestedPages is missing or empty');
  }
  const records = Array.isArray(payload?.records) ? payload.records : [];
  if (records.length === 0) {
    blocking.push('records is missing or empty');
  }
  let actualRecipeTableCount = 0;
  let actualRecipeRowCount = 0;
  let actualRecipePages = 0;
  for (const [recordIndex, record] of records.entries()) {
    if (isBlank(record?.pageTitle) || isBlank(record?.sourceUrl)) {
      blocking.push(`records[${recordIndex}] is missing pageTitle or sourceUrl`);
    }
    const tables = Array.isArray(record?.recipeTables) ? record.recipeTables : [];
    const pageRowCount = tables.reduce((sum, table, tableIndex) => {
      const rows = Array.isArray(table?.rows) ? table.rows : [];
      if (!isNonNegativeNumber(table?.rowCount) || table.rowCount !== rows.length) {
        blocking.push(`records[${recordIndex}].recipeTables[${tableIndex}].rowCount does not match rows`);
      }
      const invalidRows = rows.filter((row) => (
        isBlank(row?.resultName)
        || !Number.isFinite(row?.resultQuantity)
        || row.resultQuantity <= 0
        || !Array.isArray(row?.ingredients)
        || row.ingredients.length === 0
        || row.ingredients.some((ingredient) => isBlank(ingredient?.text))
      ));
      if (invalidRows.length > 0) {
        blocking.push(`records[${recordIndex}].recipeTables[${tableIndex}] has ${invalidRows.length} invalid recipe rows`);
      }
      return sum + rows.length;
    }, 0);
    if (!isNonNegativeNumber(record?.recipeTableCount) || record.recipeTableCount !== tables.length) {
      blocking.push(`records[${recordIndex}].recipeTableCount does not match recipeTables`);
    }
    if (!isNonNegativeNumber(record?.recipeRowCount) || record.recipeRowCount !== pageRowCount) {
      blocking.push(`records[${recordIndex}].recipeRowCount does not match recipe rows`);
    }
    actualRecipeTableCount += tables.length;
    actualRecipeRowCount += pageRowCount;
    if (pageRowCount > 0) {
      actualRecipePages += 1;
    }
  }
  const expected = {
    crawledPages: records.length,
    requestedPages: records.filter((record) => record?.requested === true).length,
    recipePages: actualRecipePages,
    recipeTableCount: actualRecipeTableCount,
    recipeRowCount: actualRecipeRowCount,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (!isNonNegativeNumber(payload?.summary?.[key]) || payload.summary[key] !== value) {
      blocking.push(`summary.${key}=${payload?.summary?.[key]} does not match records=${value}`);
    }
  }
  if (expected.recipeRowCount <= 0) {
    blocking.push('recipeRowCount is zero');
  }
  return semanticResult({
    reportPath,
    cleanMessage: `recipe crawler snapshot semantic gates are clean in ${reportPath}`,
    blocking,
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

function townNpcLegacyImportSemantics(payload, reportPath) {
  const counters = collectCounters(payload, [
    'errorCount',
    'blockedCount',
    'blockingCount',
    'unresolvedCount',
    'driftCount',
    'duplicateCount',
    'failedCount',
    'invalidCount',
    'unmatchedNpcCount',
    'unmatchedShopItemCount',
  ]);
  const warnings = counters
    .filter((counter) => counter.value > 0)
    .map((counter) => `${counter.key}=${counter.value}`);
  return semanticResult({
    reportPath,
    cleanMessage: `town NPC legacy import semantic gates are clean in ${reportPath}: ${formatMetrics(Object.fromEntries(counters.map((counter) => [counter.key, counter.value])))}`,
    warnings: warnings.length > 0
      ? [`town NPC legacy import counters are non-zero: ${warnings.join(', ')}`]
      : [],
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
    .filter((record) => ['placeholder', 'expected_placeholder'].includes(String(record?.status ?? '')))
    .map((record) => ({
      armorSetId: Number(record?.armorSetId),
      name: String(record?.name ?? ''),
      internalCode: String(record?.internalCode ?? ''),
      itemIds: Array.isArray(record?.itemIds) ? record.itemIds.map(Number).filter(Number.isFinite) : [],
      status: String(record?.status ?? ''),
      review: record?.review ?? null,
    }));
}

function isAcceptedArmorDefinitionPlaceholder(record) {
  const expected = resolveExpectedArmorSetPlaceholder(record);
  return Boolean(
    expected
    && record?.status === 'expected_placeholder'
    && record?.review?.status === 'accepted_expected_placeholder'
    && record?.review?.reason === expected.reason,
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
  const allowedBasename = /^armor_set_images\.parsed\.(latest|\d{4}-\d{2}-\d{2}T.+)\.json$/;
  const candidatePaths = [];
  const normalizedText = normalizePath(text);
  if (normalizedText.startsWith('shared-data/')) {
    candidatePaths.push(resolveSharedDataRoot(...normalizedText.slice('shared-data/'.length).split('/').filter(Boolean)));
  } else {
    candidatePaths.push(path.isAbsolute(text) ? path.resolve(text) : path.resolve(repoRoot, text));
  }
  const basename = path.posix.basename(normalizePath(text));
  if (allowedBasename.test(basename)) {
    candidatePaths.push(resolveSharedDataRoot('raw', 'wiki', basename));
  }
  const root = path.resolve(repoRoot);
  const sharedRoot = resolveSharedDataRoot();
  for (const candidatePath of candidatePaths) {
    const relative = normalizePath(path.relative(root, candidatePath));
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      if (/^data\/raw\/wiki\/armor_set_images\.parsed\.(latest|\d{4}-\d{2}-\d{2}T.+)\.json$/.test(relative)) {
        return candidatePath;
      }
    }
    const sharedRelative = normalizePath(path.relative(sharedRoot, candidatePath));
    if (!sharedRelative.startsWith('..') && !path.isAbsolute(sharedRelative)) {
      if (/^raw\/wiki\/armor_set_images\.parsed\.(latest|\d{4}-\d{2}-\d{2}T.+)\.json$/.test(sharedRelative)) {
        return candidatePath;
      }
    }
  }
  return null;
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
  return collectCounters(payload, BLOCKING_GATE_COUNTER_KEYS);
}

function collectCounters(payload, keys) {
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
  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      continue;
    }
    for (const key of keys) {
      const value = candidate[key];
      if (Number.isFinite(value) && !seen.has(key)) {
        counters.push({ key, value });
        seen.add(key);
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

function requireGeneratedAt(payload, blocking) {
  const generatedAt = payload?.generatedAt;
  if (typeof generatedAt !== 'string' || generatedAt.trim() === '' || !Number.isFinite(Date.parse(generatedAt))) {
    blocking.push('generatedAt is missing or invalid');
  }
}

function requireZeroCounters(payload, blocking, keys) {
  for (const key of keys) {
    if (!isNonNegativeNumber(payload?.[key])) {
      blocking.push(`${key} is missing or invalid`);
    } else if (payload[key] > 0) {
      blocking.push(`${key}=${payload[key]}`);
    }
  }
}

function requireEmptyArray(payload, key, blocking) {
  if (!Array.isArray(payload?.[key])) {
    blocking.push(`${key} is missing or invalid`);
  } else if (payload[key].length > 0) {
    blocking.push(`${key}=${payload[key].length}`);
  }
}

function isNonNegativeNumber(value) {
  return Number.isFinite(value) && value >= 0;
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
  const sharedDataPrefix = 'shared-data/';
  const fullPath = relativePath.startsWith(sharedDataPrefix)
    ? resolveSharedDataRoot(...relativePath.slice(sharedDataPrefix.length).split('/').filter(Boolean))
    : path.join(repoRoot, relativePath);
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
    relativePath: relativePath.startsWith(sharedDataPrefix)
      ? normalizePath(relativePath)
      : normalizePath(relativePath),
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

function optionalSharedJson(relativePath, options = {}) {
  return evidence(`shared-data/${normalizePath(relativePath)}`, false, options.type ?? 'json');
}

function requiredLatestJson(reportPattern, options = {}) {
  return evidence(reportPattern, true, 'json', true, options);
}

function optionalLatestJson(reportPattern, options = {}) {
  return evidence(reportPattern, false, 'json', true, options);
}

function optionalLatestText(reportPattern) {
  return evidence(reportPattern, false, 'text', true);
}

function optionalText(relativePath) {
  return evidence(relativePath, false, 'text');
}

function requiredText(relativePath) {
  return evidence(relativePath, true, 'text');
}

function optionalDirectory(relativePath) {
  return evidence(relativePath, false, 'directory');
}

function evidence(relativePath, required, type, latest = false, options = {}) {
  return {
    id: evidenceId(relativePath),
    path: relativePath,
    required,
    type,
    latest,
    warnWhenMissing: options.warnWhenMissing !== false,
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

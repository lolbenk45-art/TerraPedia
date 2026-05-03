#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const DEFAULT_INPUTS = {
  relationHealth: 'reports/relation/relation-health-2026-04-30.json',
  itemGroupAudit: 'reports/item-groups/any-item-group-source-audit-2026-05-01.json',
  imageReadinessText: 'docs/audits/image-asset-readiness.md',
  entityCompleteness: 'reports/\u5b9e\u4f53\u6570\u636e\u5b8c\u6574\u6027\u5ba1\u8ba1_2026-04-22.json',
};

const ENTITY_MODULES = ['items', 'buffs', 'npcs', 'projectiles', 'biomes'];

export function buildDataMaintenanceChainAudit({
  generatedAt = new Date().toISOString(),
  relationHealth = {},
  itemGroupAudit = {},
  imageReadinessReport = null,
  imageReadinessText = '',
  entityCompleteness = {},
} = {}) {
  const relationBlockingCount = numeric(relationHealth?.summary?.blockingCount);
  const relationWarningCount = numeric(relationHealth?.summary?.warningCount);
  const blockedGroupReferences = numeric(itemGroupAudit?.summary?.blockedGroupReferences);
  const duplicateGroupKeys = numeric(itemGroupAudit?.summary?.duplicateGroupKeys);
  const imageReadiness = summarizeImageReadiness({ imageReadinessReport, imageReadinessText });
  const blockingReasons = [];
  const warningReasons = [];
  const recommendedCommands = new Set();

  if (relationBlockingCount > 0) {
    blockingReasons.push(formatCountReason('relation health has', relationBlockingCount, 'blocking check'));
    recommendedCommands.add('node scripts/data/relation/relation-health-report.mjs --print-checklist=true');
  }
  if (relationWarningCount > 0) {
    warningReasons.push(formatCountReason('relation health has', relationWarningCount, 'warning'));
  }
  if (blockedGroupReferences > 0) {
    blockingReasons.push(formatCountReason('Any Item Group audit has', blockedGroupReferences, 'blocked consumer reference'));
    recommendedCommands.add('node scripts/data/audit/audit-any-item-group-sources.mjs');
  }
  if (duplicateGroupKeys > 0) {
    warningReasons.push(formatCountReason('Any Item Group audit has', duplicateGroupKeys, 'duplicate group key'));
  }
  if (!imageReadiness.items.ready) {
    blockingReasons.push(imageReadiness.items.blockingReason);
    recommendedCommands.add('node scripts/data/workflow/run-image-sync.mjs --apply=false --scopes=items,buffs');
  }
  if (!imageReadiness.buffs.ready) {
    blockingReasons.push(imageReadiness.buffs.blockingReason);
    recommendedCommands.add('node scripts/data/workflow/run-image-sync.mjs --apply=false --scopes=items,buffs');
  }
  if (!imageReadiness.npcs.ready) {
    warningReasons.push(imageReadiness.npcs.warningReason);
  }

  const anyItemGroupsChain = {
    status: blockedGroupReferences > 0 ? 'blocked' : duplicateGroupKeys > 0 ? 'warning' : 'pass',
    counts: {
      blockedGroupReferences,
      duplicateGroupKeys,
    },
    sourceGeneratedAt: itemGroupAudit?.generatedAt ?? null,
  };
  const chains = {
    npc_item_source_relation: {
      status: relationBlockingCount > 0 ? 'blocked' : relationWarningCount > 0 ? 'warning' : 'pass',
      counts: {
        blockingCount: relationBlockingCount,
        warningCount: relationWarningCount,
      },
      sourceGeneratedAt: relationHealth?.generatedAt ?? null,
    },
    item_image_assets: {
      status: imageReadiness.items.ready ? 'pass' : 'blocked',
      ready: imageReadiness.items.ready,
      sourceGeneratedAt: imageReadiness.generatedAt,
      evidence: imageReadiness.items.evidence,
    },
    buff_image_assets: {
      status: imageReadiness.buffs.ready ? 'pass' : 'blocked',
      ready: imageReadiness.buffs.ready,
      sourceGeneratedAt: imageReadiness.generatedAt,
      evidence: imageReadiness.buffs.evidence,
    },
    npc_image_assets: {
      status: imageReadiness.npcs.ready ? 'pass' : 'warning',
      ready: imageReadiness.npcs.ready,
      sourceGeneratedAt: imageReadiness.generatedAt,
      evidence: imageReadiness.npcs.evidence,
    },
    any_item_groups: anyItemGroupsChain,
    recipe_item_groups: anyItemGroupsChain,
  };

  return {
    generatedAt,
    status: blockingReasons.length > 0 ? 'blocked' : warningReasons.length > 0 ? 'warning' : 'pass',
    chains,
    blockingReasons,
    warningReasons,
    recommendedCommands: [...recommendedCommands],
    entityCompleteness: summarizeEntityCompleteness(entityCompleteness),
  };
}

function summarizeImageReadiness({ imageReadinessReport = null, imageReadinessText = '' } = {}) {
  if (imageReadinessReport && typeof imageReadinessReport === 'object') {
    return summarizeStructuredImageReadiness(imageReadinessReport);
  }
  return summarizeTextImageReadiness(imageReadinessText);
}

function summarizeStructuredImageReadiness(report) {
  const entities = report?.entities ?? {};
  const blockingReasons = strings(report?.blockingReasons);
  const warningReasons = strings(report?.warningReasons);
  return {
    generatedAt: report?.generatedAt ?? null,
    items: summarizeStructuredImageEntity('items', entities.items, { blockingReasons, warningReasons }),
    buffs: summarizeStructuredImageEntity('buffs', entities.buffs, { blockingReasons, warningReasons }),
    npcs: summarizeStructuredImageEntity('npcs', entities.npcs, { blockingReasons, warningReasons }),
  };
}

function summarizeStructuredImageEntity(entityType, entity, { blockingReasons = [], warningReasons = [] } = {}) {
  if (!entity || typeof entity !== 'object') {
    return {
      ready: false,
      blockingReason: `${entityType} image assets are missing from structured image readiness report`,
      warningReason: `${entityType} image assets are missing from structured image readiness report`,
      evidence: null,
    };
  }
  const status = String(entity?.status ?? '').toLowerCase();
  const reportBlockingReason = findEntityReason(blockingReasons, entityType);
  const reportWarningReason = findEntityReason(warningReasons, entityType);
  const ready = entityType === 'npcs'
    ? status !== 'blocked' && entity?.unifiedContractReady !== false
    : status === 'pass';
  return {
    ready,
    blockingReason: reportBlockingReason ?? `${entityType} image assets are not marked ready in structured image readiness report`,
    warningReason: reportWarningReason ?? `${entityType} image assets still need a unified source/cache/fallback contract`,
    evidence: ready
      ? `${entityType} image readiness report marks the entity chain as pass`
      : null,
  };
}

function summarizeTextImageReadiness(imageReadinessText = '') {
  const imageReadiness = String(imageReadinessText ?? '');
  const itemImageReady = imageReadiness.includes('item_images.cached_url')
    && imageReadiness.includes('original_url')
    && imageReadiness.includes('legacy wiki fallback');
  const buffImageReady = imageReadiness.includes('V40__add_buff_image_cache_columns.sql')
    && imageReadiness.includes('image_original_url')
    && imageReadiness.includes('image_cached_url');
  const npcImageNeedsUnifiedContract = imageReadiness.includes('NPC/Biome/Projectile/Article')
    && imageReadiness.includes('source/cache/fallback');
  return {
    generatedAt: null,
    items: {
      ready: itemImageReady,
      blockingReason: 'item image assets are not marked ready in image readiness text',
      evidence: itemImageReady
        ? 'image readiness text references item_images.cached_url, original_url, and legacy wiki fallback'
        : null,
    },
    buffs: {
      ready: buffImageReady,
      blockingReason: 'buff image assets are not marked ready in image readiness text',
      evidence: buffImageReady
        ? 'image readiness text references V40 buff cache columns and source/cache fields'
        : null,
    },
    npcs: {
      ready: !npcImageNeedsUnifiedContract,
      blockingReason: 'NPC/Biome/Projectile/Article image assets still need a unified source/cache/fallback contract',
      warningReason: 'NPC/Biome/Projectile/Article image assets still need a unified source/cache/fallback contract',
      evidence: npcImageNeedsUnifiedContract
        ? 'image readiness text states NPC/Biome/Projectile/Article still need source/cache/fallback contract'
        : null,
    },
  };
}

function strings(value) {
  return Array.isArray(value)
    ? value.map((entry) => String(entry ?? '').trim()).filter(Boolean)
    : [];
}

function findEntityReason(reasons, entityType) {
  return reasons.find((reason) => reason.toLowerCase().includes(`${entityType.toLowerCase()} `)) ?? null;
}

function summarizeEntityCompleteness(entityCompleteness) {
  const modules = entityCompleteness?.modules ?? {};
  return Object.fromEntries(ENTITY_MODULES.map((key) => {
    const module = modules?.[key] ?? {};
    return [key, {
      standardizedCount: numeric(module?.standardizedCount, null),
      imageStats: summarizeImageStats(module),
    }];
  }));
}

function summarizeImageStats(module) {
  const dbImageStats = Object.fromEntries(
    Object.entries(module?.dbStats ?? {})
      .filter(([key]) => key.toLowerCase().includes('image') || key.toLowerCase().includes('minio'))
      .map(([key, value]) => [key, numeric(value, value ?? null)]),
  );
  const imageFields = Array.isArray(module?.imageFields)
    ? module.imageFields.map((field) => ({
        field: String(field?.field ?? ''),
        present: Boolean(field?.present),
      }))
    : [];
  return {
    ...dbImageStats,
    imageFields,
  };
}

function numeric(value, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.trunc(number);
}

function formatCountReason(prefix, count, singular) {
  return `${prefix} ${count} ${singular}${count === 1 ? '' : 's'}`;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const imageReadinessInput = resolveImageReadinessInput(args, await findLatestImageReadinessReport());
  const inputs = {
    relationHealth: args.relationHealth ?? DEFAULT_INPUTS.relationHealth,
    itemGroupAudit: args.itemGroupAudit ?? DEFAULT_INPUTS.itemGroupAudit,
    imageReadinessReport: imageReadinessInput.imageReadinessReport,
    imageReadinessText: imageReadinessInput.imageReadinessText,
    entityCompleteness: args.entityCompleteness ?? DEFAULT_INPUTS.entityCompleteness,
  };
  const audit = buildDataMaintenanceChainAudit({
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    relationHealth: await readJson(inputs.relationHealth),
    itemGroupAudit: await readJson(inputs.itemGroupAudit),
    imageReadinessReport: await readJsonIfExists(inputs.imageReadinessReport),
    imageReadinessText: await readTextIfExists(inputs.imageReadinessText),
    entityCompleteness: await readJson(inputs.entityCompleteness),
  });
  const output = `${JSON.stringify(audit, null, 2)}\n`;

  if (args.output) {
    const outputPath = path.resolve(repoRoot, args.output);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, output, 'utf8');
    console.log(output);
    return;
  }

  console.log(output);
}

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) {
      continue;
    }
    const withoutPrefix = token.slice(2);
    const separatorIndex = withoutPrefix.indexOf('=');
    const key = separatorIndex === -1 ? withoutPrefix : withoutPrefix.slice(0, separatorIndex);
    const value = separatorIndex === -1 ? true : withoutPrefix.slice(separatorIndex + 1);
    args[toCamelCase(key)] = value;
  }
  return args;
}

function toCamelCase(value) {
  return String(value).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function resolveImageReadinessInput(args = {}, latestImageReadinessReport = null) {
  if (args.imageReadinessReport) {
    return {
      imageReadinessReport: args.imageReadinessReport,
      imageReadinessText: args.imageReadinessText ?? DEFAULT_INPUTS.imageReadinessText,
    };
  }
  if (args.imageReadinessText) {
    return {
      imageReadinessReport: null,
      imageReadinessText: args.imageReadinessText,
    };
  }
  return {
    imageReadinessReport: latestImageReadinessReport,
    imageReadinessText: DEFAULT_INPUTS.imageReadinessText,
  };
}

async function readJson(filePath) {
  const raw = await readText(filePath);
  return JSON.parse(raw);
}

async function readJsonIfExists(filePath) {
  if (!filePath) {
    return null;
  }
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function readTextIfExists(filePath) {
  if (!filePath) {
    return '';
  }
  try {
    return await readText(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

async function findLatestImageReadinessReport() {
  const dir = path.resolve(repoRoot, 'reports', 'audit');
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const candidates = [];
    for (const entry of entries) {
      if (
        entry.isFile()
        && entry.name.startsWith('image-asset-readiness')
        && entry.name.endsWith('.json')
      ) {
        const fullPath = path.join(dir, entry.name);
        candidates.push({
          fullPath,
          fileName: entry.name,
          mtimeMs: (await fs.stat(fullPath)).mtimeMs,
        });
      }
    }
    candidates.sort(compareImageReadinessReportCandidates);
    return candidates[0]?.fullPath ?? null;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export function compareImageReadinessReportCandidates(left, right) {
  const leftDate = imageReadinessReportDate(left.fileName);
  const rightDate = imageReadinessReportDate(right.fileName);
  if (leftDate !== rightDate) {
    return rightDate.localeCompare(leftDate);
  }
  return right.fileName.localeCompare(left.fileName);
}

function imageReadinessReportDate(fileName) {
  return String(fileName ?? '').match(/image-asset-readiness-(\d{4}-\d{2}-\d{2})\.json$/)?.[1] ?? '';
}

async function readText(filePath) {
  return fs.readFile(path.resolve(repoRoot, filePath), 'utf8');
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

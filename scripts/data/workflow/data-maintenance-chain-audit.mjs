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
  imageReadinessText = '',
  entityCompleteness = {},
} = {}) {
  const relationBlockingCount = numeric(relationHealth?.summary?.blockingCount);
  const relationWarningCount = numeric(relationHealth?.summary?.warningCount);
  const blockedGroupReferences = numeric(itemGroupAudit?.summary?.blockedGroupReferences);
  const duplicateGroupKeys = numeric(itemGroupAudit?.summary?.duplicateGroupKeys);
  const imageReadiness = String(imageReadinessText ?? '');
  const itemImageReady = imageReadiness.includes('item_images.cached_url')
    && imageReadiness.includes('original_url')
    && imageReadiness.includes('legacy wiki fallback');
  const buffImageReady = imageReadiness.includes('V40__add_buff_image_cache_columns.sql')
    && imageReadiness.includes('image_original_url')
    && imageReadiness.includes('image_cached_url');
  const npcImageNeedsUnifiedContract = imageReadiness.includes('NPC/Biome/Projectile/Article')
    && imageReadiness.includes('source/cache/fallback');
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
  if (!itemImageReady) {
    blockingReasons.push('item image assets are not marked ready in image readiness text');
    recommendedCommands.add('node scripts/data/workflow/run-image-sync.mjs --apply=false --scopes=items,buffs');
  }
  if (!buffImageReady) {
    blockingReasons.push('buff image assets are not marked ready in image readiness text');
    recommendedCommands.add('node scripts/data/workflow/run-image-sync.mjs --apply=false --scopes=items,buffs');
  }
  if (npcImageNeedsUnifiedContract) {
    warningReasons.push('NPC/Biome/Projectile/Article image assets still need a unified source/cache/fallback contract');
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
      status: itemImageReady ? 'pass' : 'blocked',
      ready: itemImageReady,
      evidence: itemImageReady
        ? 'image readiness text references item_images.cached_url, original_url, and legacy wiki fallback'
        : null,
    },
    buff_image_assets: {
      status: buffImageReady ? 'pass' : 'blocked',
      ready: buffImageReady,
      evidence: buffImageReady
        ? 'image readiness text references V40 buff cache columns and source/cache fields'
        : null,
    },
    npc_image_assets: {
      status: npcImageNeedsUnifiedContract ? 'warning' : 'pass',
      ready: !npcImageNeedsUnifiedContract,
      evidence: npcImageNeedsUnifiedContract
        ? 'image readiness text states NPC/Biome/Projectile/Article still need source/cache/fallback contract'
        : null,
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
  const inputs = {
    relationHealth: args.relationHealth ?? DEFAULT_INPUTS.relationHealth,
    itemGroupAudit: args.itemGroupAudit ?? DEFAULT_INPUTS.itemGroupAudit,
    imageReadinessText: args.imageReadinessText ?? DEFAULT_INPUTS.imageReadinessText,
    entityCompleteness: args.entityCompleteness ?? DEFAULT_INPUTS.entityCompleteness,
  };
  const audit = buildDataMaintenanceChainAudit({
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    relationHealth: await readJson(inputs.relationHealth),
    itemGroupAudit: await readJson(inputs.itemGroupAudit),
    imageReadinessText: await readText(inputs.imageReadinessText),
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

async function readJson(filePath) {
  const raw = await readText(filePath);
  return JSON.parse(raw);
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

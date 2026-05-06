#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getProjectRoot } from '../lib/project-root.mjs';

const repoRoot = getProjectRoot();

function createField(config) {
  return {
    field: config.field,
    sourceMode: config.sourceMode,
    coverageRisk: config.coverageRisk ?? 'unknown',
    maintTables: config.maintTables ?? [],
    sourceScripts: config.sourceScripts ?? [],
    upstreamInputs: config.upstreamInputs ?? [],
    relationOutputs: config.relationOutputs ?? [],
    projectionOutputs: config.projectionOutputs ?? [],
    localDependencies: config.localDependencies ?? [],
    notes: config.notes ?? null,
  };
}

export const CORE_FIELD_SOURCE_MATRIX = {
  items: [
    createField({
      field: 'name_zh',
      sourceMode: 'stable',
      coverageRisk: 'sparse',
      maintTables: ['maint_items.name_zh'],
      sourceScripts: [
        'scripts/data/maint/zh-source-index.mjs',
        'scripts/data/maint/sync-landing-to-maint.mjs',
      ],
      upstreamInputs: [
        'generated zh source indexes',
        'landing.items_raw module payload',
      ],
      relationOutputs: ['relation_items.name_zh'],
      projectionOutputs: ['projection_items.name_zh'],
      notes: 'No live local bridge in the current pipeline, but upstream zh coverage is still sparse.',
    }),
    createField({
      field: 'image',
      sourceMode: 'bridge',
      coverageRisk: 'sparse',
      maintTables: ['maint_item_images.cached_url', 'maint_item_images.original_url'],
      sourceScripts: [
        'scripts/data/maint/sync-standardized-item-images-to-maint.mjs',
        'scripts/data/maint/sync-item-page-images-to-maint.mjs',
        'scripts/data/relation/sync-maint-to-relation.mjs',
      ],
      upstreamInputs: [
        'standardized items image bundle',
        'item page html image extraction',
      ],
      relationOutputs: ['relation_item_images.cached_url'],
      projectionOutputs: ['projection_items.image'],
      localDependencies: [
        'scripts/data/relation/sync-maint-to-relation.mjs::reconcileProjectionItemImageFromLocal',
      ],
      notes: 'Maint-backed item images exist, but relation sync still applies a local fallback for missing projection rows.',
    }),
    createField({
      field: 'damage',
      sourceMode: 'stable',
      coverageRisk: 'mixed',
      maintTables: ['maint_items.combat_value', 'maint_item_numeric_overrides.damage_value'],
      sourceScripts: [
        'scripts/data/maint/sync-landing-to-maint.mjs',
        'scripts/data/maint/sync-standardized-item-numeric-to-maint.mjs',
        'scripts/data/relation/sync-maint-to-relation.mjs',
      ],
      upstreamInputs: [
        'landing.items_raw module payload',
        'data/standardized/items.standardized.json',
      ],
      relationOutputs: ['relation_items.combat_value'],
      projectionOutputs: ['projection_items.damage'],
      notes: 'Standardized numeric overrides intentionally patch zero-safe gaps from maint item payloads.',
    }),
    createField({
      field: 'defense',
      sourceMode: 'stable',
      coverageRisk: 'mixed',
      maintTables: ['maint_items.defense_value', 'maint_item_numeric_overrides.defense_value'],
      sourceScripts: [
        'scripts/data/maint/sync-landing-to-maint.mjs',
        'scripts/data/maint/sync-standardized-item-numeric-to-maint.mjs',
        'scripts/data/relation/sync-maint-to-relation.mjs',
      ],
      upstreamInputs: [
        'landing.items_raw module payload',
        'data/standardized/items.standardized.json',
      ],
      relationOutputs: ['relation_items.defense_value'],
      projectionOutputs: ['projection_items.defense'],
    }),
    createField({
      field: 'knockback',
      sourceMode: 'stable',
      coverageRisk: 'mixed',
      maintTables: ['maint_items.raw_json', 'maint_item_numeric_overrides.knockback_value'],
      sourceScripts: [
        'scripts/data/maint/sync-landing-to-maint.mjs',
        'scripts/data/maint/sync-standardized-item-numeric-to-maint.mjs',
        'scripts/data/relation/projection-sync.mjs',
      ],
      upstreamInputs: [
        'landing.items_raw module payload',
        'data/standardized/items.standardized.json',
      ],
      relationOutputs: ['relation_items.raw_json'],
      projectionOutputs: ['projection_items.knockback'],
      notes: 'Knockback remains projection-derived from maint facts rather than a dedicated normalized relation column.',
    }),
    createField({
      field: 'use_time',
      sourceMode: 'stable',
      coverageRisk: 'mixed',
      maintTables: ['maint_items.use_time', 'maint_item_numeric_overrides.use_time'],
      sourceScripts: [
        'scripts/data/maint/sync-landing-to-maint.mjs',
        'scripts/data/maint/sync-standardized-item-numeric-to-maint.mjs',
        'scripts/data/relation/sync-maint-to-relation.mjs',
      ],
      upstreamInputs: [
        'landing.items_raw module payload',
        'data/standardized/items.standardized.json',
      ],
      relationOutputs: ['relation_items.use_time'],
      projectionOutputs: ['projection_items.use_time'],
    }),
    createField({
      field: 'buy',
      sourceMode: 'stable',
      coverageRisk: 'mixed',
      maintTables: ['maint_items.major_value', 'maint_item_numeric_overrides.buy_value'],
      sourceScripts: [
        'scripts/data/maint/sync-landing-to-maint.mjs',
        'scripts/data/maint/sync-standardized-item-numeric-to-maint.mjs',
        'scripts/data/relation/sync-maint-to-relation.mjs',
      ],
      upstreamInputs: [
        'landing.items_raw module payload',
        'data/standardized/items.standardized.json',
      ],
      relationOutputs: ['relation_items.major_value', 'relation_items.value_raw'],
      projectionOutputs: ['projection_items.buy'],
    }),
    createField({
      field: 'sell',
      sourceMode: 'stable',
      coverageRisk: 'mixed',
      maintTables: ['maint_item_pages.sell_value', 'maint_item_numeric_overrides.sell_value'],
      sourceScripts: [
        'scripts/data/maint/sync-landing-to-maint.mjs',
        'scripts/data/maint/sync-standardized-item-numeric-to-maint.mjs',
        'scripts/data/relation/sync-maint-to-relation.mjs',
      ],
      upstreamInputs: [
        'item page html sell extraction',
        'data/standardized/items.standardized.json',
      ],
      relationOutputs: ['relation_items.sell_raw'],
      projectionOutputs: ['projection_items.sell'],
    }),
    createField({
      field: 'tooltip',
      sourceMode: 'gap',
      coverageRisk: 'none',
      maintTables: [],
      sourceScripts: [],
      upstreamInputs: [],
      relationOutputs: [],
      projectionOutputs: ['projection_items.tooltip'],
      notes: 'No approved maint-backed English item tooltip source is currently modeled.',
    }),
    createField({
      field: 'tooltip_zh',
      sourceMode: 'bridge',
      coverageRisk: 'sparse',
      maintTables: ['maint_item_text_overrides.tooltip_zh'],
      sourceScripts: [
        'scripts/data/maint/sync-local-item-tooltip-zh-to-maint.mjs',
        'scripts/data/relation/sync-maint-to-relation.mjs',
      ],
      upstreamInputs: ['terria_v1_local.items.tooltip_zh'],
      relationOutputs: [],
      projectionOutputs: ['projection_items.tooltip_zh'],
      localDependencies: [
        'scripts/data/maint/sync-local-item-tooltip-zh-to-maint.mjs',
      ],
      notes: 'Current zh tooltip facts are explicitly bridged from legacy local into maint overrides.',
    }),
    createField({
      field: 'description',
      sourceMode: 'gap',
      coverageRisk: 'none',
      maintTables: [],
      sourceScripts: [],
      upstreamInputs: [],
      relationOutputs: [],
      projectionOutputs: ['projection_items.description'],
      notes: 'No approved maint-backed item description source is currently modeled.',
    }),
    createField({
      field: 'description_zh',
      sourceMode: 'bridge',
      coverageRisk: 'sparse',
      maintTables: ['maint_item_text_overrides.description_zh'],
      sourceScripts: [
        'scripts/data/maint/sync-local-item-tooltip-zh-to-maint.mjs',
        'scripts/data/relation/sync-maint-to-relation.mjs',
      ],
      upstreamInputs: ['terria_v1_local.items.description_zh'],
      relationOutputs: [],
      projectionOutputs: ['projection_items.description_zh'],
      localDependencies: [
        'scripts/data/maint/sync-local-item-tooltip-zh-to-maint.mjs',
      ],
      notes: 'Current zh item descriptions are explicitly bridged from legacy local into maint overrides.',
    }),
    createField({
      field: 'rarity_id',
      sourceMode: 'stable',
      coverageRisk: 'mixed',
      maintTables: ['maint_item_rarity_overrides.rarity_id', 'maint_items.raw_json'],
      sourceScripts: [
        'scripts/data/maint/sync-standardized-item-rarity-to-maint.mjs',
        'scripts/data/relation/sync-maint-to-relation.mjs',
      ],
      upstreamInputs: [
        'data/standardized/items.standardized.json',
        'landing.items_raw module payload',
      ],
      relationOutputs: ['relation_items.rare_raw', 'relation_item_rarities.id'],
      projectionOutputs: ['projection_items.rarity_id'],
    }),
    createField({
      field: 'stack_size',
      sourceMode: 'stable',
      coverageRisk: 'mixed',
      maintTables: ['maint_items.stack_size'],
      sourceScripts: [
        'scripts/data/maint/sync-landing-to-maint.mjs',
        'scripts/data/maint/sync-standardized-item-stack-to-maint.mjs',
        'scripts/data/relation/sync-maint-to-relation.mjs',
      ],
      upstreamInputs: [
        'landing.items_raw module payload',
        'data/standardized/items.standardized.json',
      ],
      relationOutputs: ['relation_items.stack_size'],
      projectionOutputs: ['projection_items.stack_size', 'projection_items.is_stackable'],
      notes: 'Pipeline is maint-backed and current normalized coverage is broad, but raw maxStack coverage remains sparse and still needs explicit audit separation.',
    }),
  ],
  npcs: [
    createField({
      field: 'name_zh',
      sourceMode: 'stable',
      coverageRisk: 'sparse',
      maintTables: ['maint_npcs.name_zh'],
      sourceScripts: [
        'scripts/data/maint/zh-source-index.mjs',
        'scripts/data/maint/sync-landing-to-maint.mjs',
      ],
      upstreamInputs: [
        'generated zh source indexes',
        'landing.npcs_raw payload',
      ],
      relationOutputs: ['relation_npcs.name_zh'],
      projectionOutputs: ['projection_npcs.name_zh'],
    }),
    createField({
      field: 'sub_name_zh',
      sourceMode: 'stable',
      coverageRisk: 'sparse',
      maintTables: ['maint_npcs.sub_name_zh'],
      sourceScripts: [
        'scripts/data/maint/zh-source-index.mjs',
        'scripts/data/maint/sync-landing-to-maint.mjs',
      ],
      upstreamInputs: [
        'generated zh source indexes',
        'landing.npcs_raw payload',
      ],
      relationOutputs: ['relation_npcs.sub_name_zh'],
      projectionOutputs: ['projection_npcs.sub_name_zh'],
    }),
    createField({
      field: 'is_boss',
      sourceMode: 'stable',
      coverageRisk: 'full_expected',
      maintTables: ['maint_npcs.flags_json'],
      sourceScripts: [
        'scripts/data/maint/sync-landing-to-maint.mjs',
        'scripts/data/relation/projection-sync.mjs',
      ],
      upstreamInputs: ['landing.npcs_raw payload'],
      relationOutputs: ['relation_npcs.flags_json'],
      projectionOutputs: ['projection_npcs.is_boss'],
    }),
    createField({
      field: 'is_friendly',
      sourceMode: 'stable',
      coverageRisk: 'full_expected',
      maintTables: ['maint_npcs.flags_json'],
      sourceScripts: [
        'scripts/data/maint/sync-landing-to-maint.mjs',
        'scripts/data/relation/projection-sync.mjs',
      ],
      upstreamInputs: ['landing.npcs_raw payload'],
      relationOutputs: ['relation_npcs.flags_json'],
      projectionOutputs: ['projection_npcs.is_friendly'],
    }),
    createField({
      field: 'is_town_npc',
      sourceMode: 'stable',
      coverageRisk: 'full_expected',
      maintTables: ['maint_npcs.flags_json'],
      sourceScripts: [
        'scripts/data/maint/sync-landing-to-maint.mjs',
        'scripts/data/relation/projection-sync.mjs',
      ],
      upstreamInputs: ['landing.npcs_raw payload'],
      relationOutputs: ['relation_npcs.flags_json'],
      projectionOutputs: ['projection_npcs.is_town_npc'],
    }),
  ],
  projectiles: [
    createField({
      field: 'name_zh',
      sourceMode: 'stable',
      coverageRisk: 'sparse',
      maintTables: ['maint_projectiles.name_zh'],
      sourceScripts: [
        'scripts/data/maint/zh-source-index.mjs',
        'scripts/data/maint/sync-landing-to-maint.mjs',
      ],
      upstreamInputs: [
        'generated zh source indexes',
        'landing.projectiles_raw payload',
      ],
      relationOutputs: ['relation_projectiles.name_zh'],
      projectionOutputs: ['projection_projectiles.name_zh'],
    }),
    createField({
      field: 'friendly',
      sourceMode: 'stable',
      coverageRisk: 'full_expected',
      maintTables: ['maint_projectiles.flags_json', 'maint_projectiles.raw_json'],
      sourceScripts: [
        'scripts/data/maint/sync-landing-to-maint.mjs',
        'scripts/data/relation/projection-sync.mjs',
      ],
      upstreamInputs: ['landing.projectiles_raw payload'],
      relationOutputs: ['relation_projectiles.flags_json'],
      projectionOutputs: ['projection_projectiles.friendly'],
      notes: 'Projection prefers flags_json and only falls back to raw_json when flags are missing.',
    }),
    createField({
      field: 'hostile',
      sourceMode: 'stable',
      coverageRisk: 'full_expected',
      maintTables: ['maint_projectiles.flags_json', 'maint_projectiles.raw_json'],
      sourceScripts: [
        'scripts/data/maint/sync-landing-to-maint.mjs',
        'scripts/data/relation/projection-sync.mjs',
      ],
      upstreamInputs: ['landing.projectiles_raw payload'],
      relationOutputs: ['relation_projectiles.flags_json'],
      projectionOutputs: ['projection_projectiles.hostile'],
      notes: 'Projection prefers flags_json and only falls back to raw_json when flags are missing.',
    }),
    createField({
      field: 'tile_collide',
      sourceMode: 'stable',
      coverageRisk: 'full_expected',
      maintTables: ['maint_projectiles.flags_json', 'maint_projectiles.raw_json'],
      sourceScripts: [
        'scripts/data/maint/sync-landing-to-maint.mjs',
        'scripts/data/relation/projection-sync.mjs',
      ],
      upstreamInputs: ['landing.projectiles_raw payload'],
      relationOutputs: ['relation_projectiles.flags_json'],
      projectionOutputs: ['projection_projectiles.tile_collide'],
      notes: 'Landing sync normalizes null tileCollide values to true before relation/projection consumption.',
    }),
  ],
  buffs: [
    createField({
      field: 'name_zh',
      sourceMode: 'stable',
      coverageRisk: 'unknown',
      maintTables: ['maint_buffs.name_zh'],
      sourceScripts: ['scripts/data/maint/sync-landing-to-maint.mjs'],
      upstreamInputs: ['landing.buffs_raw payload'],
      relationOutputs: ['relation_buffs.name_zh'],
      projectionOutputs: ['projection_buffs.name_zh'],
    }),
    createField({
      field: 'image',
      sourceMode: 'stable',
      coverageRisk: 'full_expected',
      maintTables: ['maint_buffs.raw_json', 'relation_buff_images.cached_url'],
      sourceScripts: [
        'scripts/data/maint/sync-landing-to-maint.mjs',
        'scripts/data/relation/image-processor.mjs',
      ],
      upstreamInputs: ['landing.buffs_raw payload'],
      relationOutputs: ['relation_buff_images.cached_url'],
      projectionOutputs: ['projection_buffs.image'],
    }),
    createField({
      field: 'tooltip_zh',
      sourceMode: 'stable',
      coverageRisk: 'unknown',
      maintTables: ['maint_buffs.raw_json'],
      sourceScripts: [
        'scripts/data/maint/sync-landing-to-maint.mjs',
        'scripts/data/relation/buff-entity-processor.mjs',
      ],
      upstreamInputs: ['landing.buffs_raw payload'],
      relationOutputs: ['relation_buffs.tooltip_zh'],
      projectionOutputs: ['projection_buffs.tooltip_zh'],
    }),
  ],
};

function listFields(matrix = CORE_FIELD_SOURCE_MATRIX) {
  return Object.entries(matrix).flatMap(([domain, fields]) => fields.map((field) => ({ domain, ...field })));
}

export function buildCoreFieldSourceMatrixReport(matrix = CORE_FIELD_SOURCE_MATRIX) {
  const fields = listFields(matrix);
  const sourceModeBreakdown = fields.reduce((acc, field) => {
    acc[field.sourceMode] = (acc[field.sourceMode] ?? 0) + 1;
    return acc;
  }, {});
  const localBridgeFields = fields
    .filter((field) => field.localDependencies.length > 0 || field.sourceMode === 'bridge')
    .map((field) => ({
      domain: field.domain,
      field: field.field,
      localDependencies: field.localDependencies,
    }));

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      domainCount: Object.keys(matrix).length,
      fieldCount: fields.length,
      sourceModeBreakdown,
      localBridgeFieldCount: localBridgeFields.length,
    },
    localBridgeFields,
    domains: matrix,
  };
}

function buildMarkdown(report) {
  const lines = [
    '# Core Field Source Matrix',
    '',
    `Generated At: ${report.generatedAt}`,
    '',
    '## Summary',
    `- domains: ${report.summary.domainCount}`,
    `- fields: ${report.summary.fieldCount}`,
    `- stable: ${report.summary.sourceModeBreakdown.stable ?? 0}`,
    `- bridge: ${report.summary.sourceModeBreakdown.bridge ?? 0}`,
    `- gap: ${report.summary.sourceModeBreakdown.gap ?? 0}`,
    `- local bridge fields: ${report.summary.localBridgeFieldCount}`,
    '',
    '## Live Local Bridges',
  ];

  if (report.localBridgeFields.length === 0) {
    lines.push('- none');
  } else {
    for (const field of report.localBridgeFields) {
      lines.push(`- ${field.domain}.${field.field}: ${field.localDependencies.join(', ') || 'bridge-without-explicit-dependency'}`);
    }
  }

  for (const [domain, fields] of Object.entries(report.domains)) {
    lines.push('', `## ${domain}`);
    for (const field of fields) {
      lines.push(`### ${field.field}`);
      lines.push(`- source mode: ${field.sourceMode}`);
      lines.push(`- coverage risk: ${field.coverageRisk}`);
      lines.push(`- maint tables: ${field.maintTables.join(', ') || 'none'}`);
      lines.push(`- source scripts: ${field.sourceScripts.join(', ') || 'none'}`);
      lines.push(`- upstream inputs: ${field.upstreamInputs.join(', ') || 'none'}`);
      lines.push(`- relation outputs: ${field.relationOutputs.join(', ') || 'none'}`);
      lines.push(`- projection outputs: ${field.projectionOutputs.join(', ') || 'none'}`);
      lines.push(`- local dependencies: ${field.localDependencies.join(', ') || 'none'}`);
      lines.push(`- notes: ${field.notes ?? 'none'}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

export async function runCoreFieldSourceMatrixReport({ output } = {}) {
  const report = buildCoreFieldSourceMatrixReport();
  const resolvedOutput = output ?? path.join(repoRoot, 'reports', 'relation', `core-field-source-matrix-${new Date().toISOString().slice(0, 10)}.json`);
  const markdownPath = resolvedOutput.replace(/\.json$/i, '.md');
  await fs.mkdir(path.dirname(resolvedOutput), { recursive: true });
  await fs.writeFile(resolvedOutput, JSON.stringify(report, null, 2));
  await fs.writeFile(markdownPath, buildMarkdown(report));
  return {
    report,
    outputPath: resolvedOutput,
    markdownPath,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const outputArg = process.argv.slice(2).find((token) => token.startsWith('--output='));
  const output = outputArg ? outputArg.slice('--output='.length) : undefined;
  const result = await runCoreFieldSourceMatrixReport({ output });
  console.log(JSON.stringify({
    outputPath: result.outputPath,
    markdownPath: result.markdownPath,
    summary: result.report.summary,
  }, null, 2));
}

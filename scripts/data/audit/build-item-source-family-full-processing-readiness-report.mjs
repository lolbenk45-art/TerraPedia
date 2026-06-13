#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { parseCliArgs, writeJson } from '../lib/wiki-item-utils.mjs';

const MUTATION_FLAGS = new Set([
  'apply',
  'write-db',
  'sync',
  'import',
  'materialize',
  'backfill',
  'refresh',
  'pipeline',
  'crawler',
  'fetch',
  'flyway',
  'delete',
  'truncate',
  'drop',
  'alter',
  'write'
]);

const GLOBAL_FORBIDDEN_ACTIONS = [
  'Do not run crawler/fetch/import/backfill/sync/pipeline from this preparation report.',
  'Do not hand-write SQL data changes.',
  'Do not page-level allow mixed family pages.',
  'Do not apply candidate rows unless dry-run reports blockedRows=0, validationErrors=0, and toInsert>0.'
];

const FAMILY_RULES = {
  Dragonflies: {
    phase: 1,
    readinessStatus: 'parser_ready_after_capture_contract',
    parserStrategy: 'Capture/critter family parser: map each dragonfly item to capture source only after the source model is confirmed.',
    unmetConditions: [
      'Confirm whether capture should be ordinary item source or dedicated critter projection.',
      'Resolve dragonfly item identity to critter/capture evidence without NPC loot pollution.'
    ],
    acceptance: [
      'Focused tests cover one dragonfly positive row and one non-dragonfly negative row.',
      'Candidate dry-run has blockedRows=0 and validationErrors=0, or rows are moved to projection treatment.'
    ]
  },
  Vases: {
    phase: 2,
    readinessStatus: 'parser_ready_after_worldgen_contract',
    parserStrategy: 'Worldgen/container-style parser with item-specific page evidence; do not classify decorative vases by name only.',
    unmetConditions: [
      'Extract item-specific vase evidence from raw page rows or narrative sections.',
      'Separate worldgen/container evidence from decorative/craft evidence.'
    ],
    acceptance: [
      'Each vase row has a sourcePage/sourceRowText or explicit non-import treatment.',
      'Dry-run validates all resolved source refs.'
    ]
  },
  Moss: {
    phase: 2,
    readinessStatus: 'parser_ready_after_worldgen_contract',
    parserStrategy: 'Worldgen/mining parser for moss variants with explicit biome/location wording.',
    unmetConditions: [
      'Identify whether each moss item source is mining, worldgen, shimmer, or projection-only.',
      'Avoid converting biome/location-only evidence into fake drop/shop rows.'
    ],
    acceptance: [
      'Tests distinguish mining/worldgen from biome projection.',
      'No blocked source rows remain after dry-run.'
    ]
  },
  'Unsafe Walls': {
    phase: 2,
    readinessStatus: 'parser_ready_after_worldgen_contract',
    parserStrategy: 'Unsafe wall parser: keep natural wall/worldgen evidence distinct from safe wall crafting.',
    unmetConditions: [
      'Prove the unsafe wall is obtainable as placed/generated wall evidence.',
      'Do not infer from safe wall recipes.'
    ],
    acceptance: [
      'Positive unsafe wall fixture maps to reviewed worldgen/mining source.',
      'Safe wall fixture remains excluded.'
    ]
  },
  'Planter Boxes': {
    phase: 2,
    readinessStatus: 'parser_ready_after_shop_contract',
    parserStrategy: 'Shop family parser with item-specific vendor and condition checks.',
    unmetConditions: [
      'Resolve the exact vendor and condition for the remaining planter box.',
      'Confirm existing shop relation is absent before writing ordinary source.'
    ],
    acceptance: [
      'Candidate resolves to a concrete NPC source or existing relation treatment.',
      'Dry-run has zero validation errors.'
    ]
  },
  'Shimmer Tools': {
    phase: 2,
    readinessStatus: 'parser_ready_after_mechanism_contract',
    parserStrategy: 'Mechanism/shimmer parser: only write ordinary source when source item transform is explicit.',
    unmetConditions: [
      'Confirm whether evidence is actual Shimmer acquisition or mechanism/projection-only.',
      'Resolve source item identity if Shimmer transform is importable.'
    ],
    acceptance: [
      'Shimmer transform has sourceRefType=item and resolved item id, or is documented as projection-only.',
      'No unknown source contract rows.'
    ]
  },
  Banners: {
    phase: 2,
    readinessStatus: 'parser_ready_after_enemy_identity_contract',
    parserStrategy: 'Banner item to NPC identity parser, using explicit alias mapping when display names collide.',
    unmetConditions: [
      'Resolve the remaining banner to one stable NPC identity.',
      'Confirm it is not an explicit unobtainable enemy banner exemption.'
    ],
    acceptance: [
      'Banner source resolves to concrete NPC id or explicit exemption.',
      'No display-text-only ambiguous NPC mapping.'
    ]
  },
  Altars: {
    phase: 2,
    readinessStatus: 'parser_ready_after_mixed_worldgen_boss_contract',
    parserStrategy: 'Mixed altar parser: split worldgen/mining, boss/event, and uncollectible evidence by item.',
    unmetConditions: [
      'Determine whether each altar is obtainable as an item or only world fixture.',
      'Split boss/event references from worldgen references.'
    ],
    acceptance: [
      'Each altar row lands in importable source, projection treatment, or explicit exemption.',
      'No page-level shared source allow.'
    ]
  },
  Paintings: {
    phase: 3,
    readinessStatus: 'requires_item_matrix_parser',
    parserStrategy: 'Large mixed matrix parser: match each painting item to a table row or section-specific evidence.',
    unmetConditions: [
      'Build item-level matrix extraction for painting rows.',
      'Split worldgen, shop, event, and special-source painting evidence.',
      'Detect painting names that are only decorative identities without source row evidence.'
    ],
    acceptance: [
      'Tests cover at least one worldgen painting, one shop/event painting, and one excluded non-matching row.',
      'All painting rows become importable, projection/exemption, or missing raw evidence.'
    ]
  },
  'Music Boxes': {
    phase: 3,
    readinessStatus: 'requires_item_matrix_parser',
    parserStrategy: 'Large mixed matrix parser: split recording, shimmer, drop/event, and shop evidence per music box.',
    unmetConditions: [
      'Split recording/shimmer/event/drop/shop evidence by individual music box.',
      'Decide whether recording-only evidence should be ordinary source or dedicated music-box projection.',
      'Resolve any event/boss source refs without text-only false positives.'
    ],
    acceptance: [
      'Tests cover recorded music box, shimmer transform, event/drop music box, and excluded aggregate row.',
      'No generic Music Boxes page source is applied to every item.'
    ]
  },
  Statues: {
    phase: 3,
    readinessStatus: 'requires_item_matrix_parser',
    parserStrategy: 'Large mixed matrix parser: separate worldgen statues, functional statue mechanics, shop/drop, and unavailable variants.',
    unmetConditions: [
      'Build item-level statue matrix matching.',
      'Separate mechanism/function-only evidence from actual acquisition source.',
      'Resolve statue-specific worldgen/shop/drop evidence.'
    ],
    acceptance: [
      'Tests cover worldgen statue, functional-only statue, and mixed-source statue.',
      'No function/mechanism evidence is written as fake drop/shop source.'
    ]
  }
};

const FAMILY_ORDER = [
  'Dragonflies',
  'Vases',
  'Moss',
  'Altars',
  'Banners',
  'Planter Boxes',
  'Shimmer Tools',
  'Unsafe Walls',
  'Paintings',
  'Music Boxes',
  'Statues'
];

export function parseBuildItemSourceFamilyFullProcessingReadinessArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  for (const [key, value] of Object.entries(options)) {
    if (MUTATION_FLAGS.has(key.toLowerCase()) && value !== false && value !== 'false') {
      throw new Error(`read-only family full-processing readiness report refuses mutation flag: --${key}`);
    }
  }
  return {
    workItemsPath: options['work-items'] ?? options.workItems ?? 'data/reports/item-source-remaining-work-items-report-2026-06-12.json',
    outputPath: options.output ?? null,
    summaryOutputPath: options['summary-output'] ?? options.summaryOutput ?? null
  };
}

export function buildItemSourceFamilyFullProcessingReadinessReport({
  generatedAt = new Date().toISOString(),
  workItemsReport = {},
  inputs = {}
} = {}) {
  const rows = Array.isArray(workItemsReport.workItems?.familyPolicyPendingClosureRows)
    ? workItemsReport.workItems.familyPolicyPendingClosureRows
    : [];
  const groups = groupRows(rows, classifyFamily);
  const familyPlans = [...groups.entries()]
    .map(([family, familyRows]) => buildFamilyPlan(family, familyRows))
    .sort(compareFamilyPlan);
  const assignedRows = familyPlans.reduce((sum, family) => sum + family.count, 0);

  return {
    generatedAt,
    readOnly: true,
    entity: 'item_source_family_full_processing_readiness',
    inputs,
    summary: {
      totalFamilyPolicyPendingRows: rows.length,
      totalFamilies: familyPlans.length,
      allRowsAssignedToFamilyPlan: assignedRows === rows.length,
      phaseCounts: countBy(familyPlans, (family) => `phase_${family.phase}`),
      readinessStatusCounts: countBy(familyPlans, (family) => family.readinessStatus)
    },
    globalGates: {
      sourceChain: 'raw/wiki evidence -> family parser -> focused candidate plan -> local compat dry-run -> guarded local apply -> refreshed reports',
      applyGate: 'blockedRows=0, validationErrors=0, toInsert>0 before apply; re-run dry-run to toInsert=0 after apply.',
      reportGate: 'Refresh evidence/work/treatment/final status reports after each batch.',
      forbiddenActions: GLOBAL_FORBIDDEN_ACTIONS
    },
    familyPlans
  };
}

export function renderItemSourceFamilyFullProcessingReadinessChineseSummary(report) {
  const lines = [];
  lines.push('# 物品来源 family 全量处理准备报告');
  lines.push('');
  lines.push(`生成时间：${report.generatedAt ?? ''}`);
  lines.push('');
  lines.push('## 总览');
  lines.push('');
  lines.push(`- 剩余 family_policy_pending rows：${report.summary?.totalFamilyPolicyPendingRows ?? 0}`);
  lines.push(`- 剩余 family 数：${report.summary?.totalFamilies ?? 0}`);
  lines.push(`- 是否全部分配处理计划：${report.summary?.allRowsAssignedToFamilyPlan ? '是' : '否'}`);
  lines.push('');
  lines.push('## 全局门禁');
  lines.push('');
  lines.push(`- 来源链：${report.globalGates?.sourceChain ?? ''}`);
  lines.push(`- 写入门槛：${report.globalGates?.applyGate ?? ''}`);
  lines.push(`- 报告门槛：${report.globalGates?.reportGate ?? ''}`);
  lines.push('- 禁止动作：不能整页放行；不能跑 crawler/fetch/import/backfill/sync/pipeline；不能手写 SQL 改库。');
  lines.push('');
  lines.push('## Family 处理表');
  lines.push('');
  lines.push('| phase | family | rows | readiness | parser strategy | unmet conditions |');
  lines.push('| ---: | --- | ---: | --- | --- | --- |');
  for (const family of report.familyPlans ?? []) {
    lines.push(`| ${family.phase} | ${family.family} | ${family.count} | ${family.readinessStatus} | ${escapePipe(family.parserStrategy)} | ${escapePipe(family.unmetConditions.join('；'))} |`);
  }
  lines.push('');
  lines.push('## 执行顺序');
  lines.push('');
  lines.push('1. Phase 1：Dragonflies，先确认 capture/critter 是否走普通 source 或投影。');
  lines.push('2. Phase 2：Vases/Moss/Altars/Banners/Planter Boxes/Shimmer Tools/Unsafe Walls，小类逐个 parser + dry-run。');
  lines.push('3. Phase 3：Paintings/Music Boxes/Statues，大混合页必须 item-level matrix parser，不能整页放行。');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function runBuildItemSourceFamilyFullProcessingReadinessReport(options = {}, dependencies = {}) {
  const report = buildItemSourceFamilyFullProcessingReadinessReport({
    generatedAt: (dependencies.now instanceof Date ? dependencies.now : new Date()).toISOString(),
    workItemsReport: dependencies.workItemsReport ?? readJson(options.workItemsPath),
    inputs: {
      workItemsPath: options.workItemsPath
    }
  });
  if (options.outputPath) {
    writeJson(path.resolve(process.cwd(), options.outputPath), report);
  }
  if (options.summaryOutputPath) {
    fs.mkdirSync(path.dirname(path.resolve(process.cwd(), options.summaryOutputPath)), { recursive: true });
    fs.writeFileSync(path.resolve(process.cwd(), options.summaryOutputPath), renderItemSourceFamilyFullProcessingReadinessChineseSummary(report));
  }
  return report;
}

function buildFamilyPlan(family, rows) {
  const rule = FAMILY_RULES[family] ?? {
    phase: 99,
    readinessStatus: 'unclassified_family_requires_plan_repair',
    parserStrategy: 'Repair classification before execution.',
    unmetConditions: ['Add family rule before any import plan generation.'],
    acceptance: ['The family appears in this readiness report with a concrete phase and parser strategy.']
  };
  return {
    family,
    count: rows.length,
    phase: rule.phase,
    readinessStatus: rule.readinessStatus,
    parserStrategy: rule.parserStrategy,
    unmetConditions: rule.unmetConditions,
    acceptance: rule.acceptance,
    forbiddenActions: GLOBAL_FORBIDDEN_ACTIONS,
    sampleItems: rows.slice(0, 12).map((row) => ({
      itemId: row.itemId ?? null,
      internalName: row.internalName ?? row.itemInternalName ?? null,
      name: row.name ?? row.itemName ?? null
    }))
  };
}

function classifyFamily(row) {
  const internalName = String(row?.internalName ?? row?.itemInternalName ?? '');
  const name = String(row?.name ?? row?.itemName ?? '');
  if (/MusicBox/i.test(internalName) || /Music Box/i.test(name)) return 'Music Boxes';
  if (/Statue$/i.test(internalName) || /Statue\b/i.test(name)) return 'Statues';
  if (/Dragonfly/i.test(internalName) || /Dragonfly\b/i.test(name)) return 'Dragonflies';
  if (/PlanterBox/i.test(internalName) || /Planter Box/i.test(name)) return 'Planter Boxes';
  if (/Altar/i.test(internalName) || /Altar\b/i.test(name)) return 'Altars';
  if (/Moss/i.test(internalName) || /Moss\b/i.test(name)) return 'Moss';
  if (/Vase/i.test(internalName) || /Vase\b/i.test(name)) return 'Vases';
  if (/Wall/i.test(internalName) || /Wall\b/i.test(name)) return 'Unsafe Walls';
  if (/Shimmer/i.test(internalName) || /Shimmer/i.test(name)) return 'Shimmer Tools';
  if (/Banner/i.test(internalName) || /Banner\b/i.test(name)) return 'Banners';
  return 'Paintings';
}

function compareFamilyPlan(a, b) {
  if (a.phase !== b.phase) return a.phase - b.phase;
  const orderA = FAMILY_ORDER.indexOf(a.family);
  const orderB = FAMILY_ORDER.indexOf(b.family);
  const safeA = orderA === -1 ? Number.MAX_SAFE_INTEGER : orderA;
  const safeB = orderB === -1 ? Number.MAX_SAFE_INTEGER : orderB;
  return safeA - safeB || a.family.localeCompare(b.family);
}

function groupRows(rows, keySelector) {
  const groups = new Map();
  for (const row of rows) {
    const key = keySelector(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function countBy(values = [], keySelector) {
  const counts = {};
  for (const value of values) {
    const key = keySelector(value) ?? '(blank)';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function escapePipe(value) {
  return String(value ?? '').replace(/\|/g, '\\|');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), 'utf8'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const report = runBuildItemSourceFamilyFullProcessingReadinessReport(parseBuildItemSourceFamilyFullProcessingReadinessArgs());
    process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

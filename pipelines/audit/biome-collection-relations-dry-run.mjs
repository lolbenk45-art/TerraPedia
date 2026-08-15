#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ALLOWED_ARGS = new Set(['input', 'output']);
const COLLECTION_POLICY_ACTIONS = new Set([
  'armor_set_relation_schema_needed',
  'item_set_component_collection_schema_needed',
  'item_family_collection_schema_needed'
]);
const EXPECTED_POLICY_COUNTS = {
  boss_treasure_bag_projection_only: 2,
  armor_set_relation_schema_needed: 2,
  item_set_component_collection_schema_needed: 2,
  item_family_collection_schema_needed: 1,
  ambiguous_npc_variant_policy_needed: 14,
  normalized_npc_candidate_policy_needed: 3,
  weak_npc_family_backfill_clue_only: 16,
  still_missing_entity_evidence_needed: 2
};
const ALLOWLIST = new Map([
  [22, { name: 'Ninja armor', candidateCategory: 'armor_set_relation_candidate' }],
  [25, { name: 'Mummy set', candidateCategory: 'item_set_collection_candidate' }],
  [36, { name: 'Obsidian furniture', candidateCategory: 'item_family_collection_candidate' }],
  [40, { name: 'Snow armor', candidateCategory: 'armor_set_relation_candidate' }],
  [41, { name: "Pedguin's set", candidateCategory: 'item_set_collection_candidate' }]
]);
const ALLOWED_CANDIDATE_CATEGORIES = new Set([
  'armor_set_relation_candidate',
  'item_set_collection_candidate',
  'item_family_collection_candidate'
]);
const FORBIDDEN_FUTURE_SURFACES = new Set(['item_biomes', 'npc_biomes', 'biome_relations']);
const FORBIDDEN_WRITE_INTENT_KEYS = new Set([
  'aliasMap',
  'aliasesToWrite',
  'apply',
  'biomeRelationPayload',
  'importPlan',
  'insertPlan',
  'itemBiomePayload',
  'itemIds',
  'npcBiomePayload',
  'npcIds',
  'relationPayload',
  'resolvedId',
  'resolvedIds',
  'resolvedItemId',
  'resolvedItemIds',
  'resolvedNpcId',
  'resolvedNpcIds',
  'sql',
  'targetTable',
  'targetTables',
  'writePlan'
]);

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const separatorIndex = body.indexOf('=');
    const key = separatorIndex >= 0 ? body.slice(0, separatorIndex) : body;
    if (!ALLOWED_ARGS.has(key)) throw new Error(`Unknown option: --${key}`);
    args[key] = separatorIndex >= 0 ? body.slice(separatorIndex + 1) : 'true';
  }
  if (!toNullableText(args.input)) throw new Error('--input is required');
  return {
    input: args.input,
    output: args.output ?? defaultOutputPath()
  };
}

export function buildBiomeCollectionRelationsDryRun({ policyReport, generatedAt = new Date().toISOString(), sourceReportPath = null }) {
  validatePolicyReportContract(policyReport);
  const policyRows = Array.isArray(policyReport?.rows) ? policyReport.rows : [];
  const candidates = [];
  const excludedPolicyActions = {};
  const seenAllowlisted = new Set();

  for (const row of policyRows) {
    const classification = classifyCollectionCandidate(row);
    if (!classification) {
      excludedPolicyActions[row.policyAction] = (excludedPolicyActions[row.policyAction] ?? 0) + 1;
      continue;
    }
    const allowed = ALLOWLIST.get(row.inputIndex);
    if (!allowed) throw new Error(`unexpected collection policy row ${row.inputIndex}`);
    if (row.original?.name !== allowed.name) {
      throw new Error(`allowlisted row ${row.inputIndex} name mismatch: expected ${allowed.name}, got ${row.original?.name}`);
    }
    if (classification.candidateCategory !== allowed.candidateCategory) {
      throw new Error(`allowlisted row ${row.inputIndex} category mismatch: expected ${allowed.candidateCategory}, got ${classification.candidateCategory}`);
    }
    seenAllowlisted.add(row.inputIndex);
    candidates.push(buildCandidateRow(row, classification));
  }

  for (const inputIndex of ALLOWLIST.keys()) {
    if (!seenAllowlisted.has(inputIndex)) throw new Error(`missing allowlisted collection row ${inputIndex}`);
  }

  candidates.sort((left, right) => left.inputIndex - right.inputIndex);
  const report = {
    entity: 'biome_collection_relations_dry_run',
    generatedAt,
    sourceReportPath,
    sourceGeneratedAt: policyReport?.generatedAt ?? null,
    summary: summarizeRows(candidates),
    excludedPolicyActions,
    rows: candidates
  };
  const validation = validateBiomeCollectionRelationsDryRun(report);
  if (!validation.valid) {
    throw new Error(`Biome collection relations dry-run contract failed:\n${validation.issues.join('\n')}`);
  }
  return report;
}

export function classifyCollectionCandidate(policyRow) {
  if (policyRow?.policyAction === 'armor_set_relation_schema_needed') {
    return {
      candidateCategory: 'armor_set_relation_candidate',
      futureSurface: 'biome_armor_sets',
      candidateKey: armorSetCandidateKey(policyRow),
      candidateLabel: policyRow.original?.name ?? 'Armor set'
    };
  }
  if (policyRow?.policyAction === 'item_set_component_collection_schema_needed') {
    return {
      candidateCategory: 'item_set_collection_candidate',
      futureSurface: 'biome_item_collections',
      candidateKey: itemCollectionCandidateKey(policyRow),
      candidateLabel: policyRow.original?.name ?? 'Item set'
    };
  }
  if (policyRow?.policyAction === 'item_family_collection_schema_needed') {
    return {
      candidateCategory: 'item_family_collection_candidate',
      futureSurface: 'biome_item_collections',
      candidateKey: itemCollectionCandidateKey(policyRow),
      candidateLabel: policyRow.original?.name ?? 'Item collection'
    };
  }
  return null;
}

export function validateBiomeCollectionRelationsDryRun(report) {
  const issues = [];
  if (report?.entity !== 'biome_collection_relations_dry_run') issues.push('wrong entity');
  if (!Object.hasOwn(report ?? {}, 'generatedAt')) issues.push('missing generatedAt');
  if (!Object.hasOwn(report ?? {}, 'sourceReportPath')) issues.push('missing sourceReportPath');
  if (!Object.hasOwn(report ?? {}, 'sourceGeneratedAt')) issues.push('missing sourceGeneratedAt');
  if (!report?.summary || typeof report.summary !== 'object') issues.push('missing summary');
  if (!Array.isArray(report?.rows)) issues.push('rows is not an array');
  if (report?.summary?.total !== report?.rows?.length) issues.push('summary total does not match row length');
  if (!report?.summary?.byCandidateCategory || typeof report.summary.byCandidateCategory !== 'object') issues.push('missing summary.byCandidateCategory');
  if (!report?.summary?.dbWriteActions || typeof report.summary.dbWriteActions !== 'object') issues.push('missing summary.dbWriteActions');
  issues.push(...findForbiddenWriteIntentFields(report));

  const seen = new Set();
  for (const row of Array.isArray(report?.rows) ? report.rows : []) {
    if (!Number.isInteger(row.inputIndex)) issues.push(`row ${row.inputIndex} invalid inputIndex`);
    if (seen.has(row.inputIndex)) issues.push(`duplicate inputIndex ${row.inputIndex}`);
    seen.add(row.inputIndex);
    if (!ALLOWLIST.has(row.inputIndex)) issues.push(`row ${row.inputIndex} is not allowlisted`);
    if (!toNullableText(row.rowKey)) issues.push(`row ${row.inputIndex} missing rowKey`);
    if (!toNullableText(row.biomeCode)) issues.push(`row ${row.inputIndex} missing biomeCode`);
    if (!toNullableText(row.biomeName)) issues.push(`row ${row.inputIndex} missing biomeName`);
    if (!toNullableText(row.wikiName)) issues.push(`row ${row.inputIndex} missing wikiName`);
    if (!toNullableText(row.source)) issues.push(`row ${row.inputIndex} missing source`);
    if (!ALLOWED_CANDIDATE_CATEGORIES.has(row.candidateCategory)) issues.push(`row ${row.inputIndex} unsupported candidateCategory ${row.candidateCategory}`);
    if (FORBIDDEN_FUTURE_SURFACES.has(row.futureSurface)) issues.push(`row ${row.inputIndex} forbidden futureSurface ${row.futureSurface}`);
    if (!toNullableText(row.futureSurface)) issues.push(`row ${row.inputIndex} missing futureSurface`);
    if (!toNullableText(row.candidateKey)) issues.push(`row ${row.inputIndex} missing candidateKey`);
    if (!toNullableText(row.candidateLabel)) issues.push(`row ${row.inputIndex} missing candidateLabel`);
    if (!row.memberEvidence || typeof row.memberEvidence !== 'object') issues.push(`row ${row.inputIndex} missing memberEvidence`);
    if (row.schemaRequired !== true) issues.push(`row ${row.inputIndex} schemaRequired must be true`);
    if (row.dbWriteAction !== 'none') issues.push(`row ${row.inputIndex} dbWriteAction must be none`);
    if (row.resolvedMapping !== null) issues.push(`row ${row.inputIndex} resolvedMapping must be null`);
    if (row.evidenceOnly !== true) issues.push(`row ${row.inputIndex} not evidenceOnly`);
    if (row.needsUserDecision !== true) issues.push(`row ${row.inputIndex} not marked for user decision`);
  }
  return { valid: issues.length === 0, issues };
}

export async function writeBiomeCollectionRelationsDryRun({ inputPath, outputPath, generatedAt }) {
  const resolvedInputPath = path.resolve(process.cwd(), inputPath);
  const resolvedOutputPath = path.resolve(process.cwd(), outputPath ?? defaultOutputPath());
  const policyReport = JSON.parse(fs.readFileSync(resolvedInputPath, 'utf8'));
  const report = buildBiomeCollectionRelationsDryRun({
    policyReport,
    generatedAt,
    sourceReportPath: resolvedInputPath
  });
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(resolvedOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return { outputPath: resolvedOutputPath, summary: report.summary };
}

function validatePolicyReportContract(policyReport) {
  if (policyReport?.entity !== 'biome_wikitext_policy_relation_plan') {
    throw new Error('wrong policy report entity');
  }
  if (policyReport?.summary?.total !== 42) {
    throw new Error(`policy report summary.total expected 42 got ${policyReport?.summary?.total}`);
  }
  if (policyReport?.summary?.dbWriteActions?.none !== 42) {
    throw new Error(`policy report dbWriteActions.none expected 42 got ${policyReport?.summary?.dbWriteActions?.none}`);
  }
  for (const [policyAction, expected] of Object.entries(EXPECTED_POLICY_COUNTS)) {
    const actual = policyReport?.summary?.byPolicyAction?.[policyAction] ?? 0;
    if (actual !== expected) {
      throw new Error(`policy action ${policyAction} expected ${expected} got ${actual}`);
    }
  }
  for (const row of Array.isArray(policyReport?.rows) ? policyReport.rows : []) {
    if (row.evidenceOnly !== true) throw new Error(`policy row ${row.inputIndex} not evidenceOnly`);
    if (row.needsUserDecision !== true) throw new Error(`policy row ${row.inputIndex} not marked for user decision`);
    if (row.dbWriteAction !== 'none') throw new Error(`policy row ${row.inputIndex} dbWriteAction must be none`);
    if (row.resolvedMapping !== null) throw new Error(`policy row ${row.inputIndex} resolvedMapping must be null`);
  }
}

function buildCandidateRow(policyRow, classification) {
  const memberEvidence = memberEvidenceFor(policyRow, classification.candidateCategory);
  return {
    inputIndex: policyRow.inputIndex,
    rowKey: policyRow.original?.rowKey ?? null,
    biomeCode: policyRow.original?.biomeCode ?? null,
    biomeName: policyRow.original?.pageTitle ?? null,
    wikiName: policyRow.original?.name ?? null,
    source: policyRow.original?.source ?? null,
    sourcePolicyAction: policyRow.policyAction ?? null,
    candidateCategory: classification.candidateCategory,
    futureSurface: classification.futureSurface,
    candidateKey: classification.candidateKey,
    candidateLabel: classification.candidateLabel,
    memberEvidence,
    schemaRequired: true,
    dbWriteAction: 'none',
    resolvedMapping: null,
    evidenceOnly: true,
    needsUserDecision: true
  };
}

function memberEvidenceFor(policyRow, candidateCategory) {
  if (candidateCategory === 'armor_set_relation_candidate') {
    const armorSetCandidates = clone(policyRow.evidence?.armorSetCandidates ?? []);
    if (armorSetCandidates.length === 0) throw new Error(`row ${policyRow.inputIndex} missing armorSetCandidates evidence`);
    return {
      armorSetCandidates,
      componentItemCandidates: [],
      familyItemCandidates: []
    };
  }
  if (candidateCategory === 'item_set_collection_candidate') {
    const componentItemCandidates = clone(policyRow.evidence?.componentItemCandidates ?? []);
    if (componentItemCandidates.length === 0) throw new Error(`row ${policyRow.inputIndex} missing componentItemCandidates evidence`);
    return {
      armorSetCandidates: [],
      componentItemCandidates,
      familyItemCandidates: []
    };
  }
  if (candidateCategory === 'item_family_collection_candidate') {
    const familyItemCandidates = clone(policyRow.evidence?.familyItemCandidates ?? []);
    if (familyItemCandidates.length === 0) throw new Error(`row ${policyRow.inputIndex} missing familyItemCandidates evidence`);
    return {
      armorSetCandidates: [],
      componentItemCandidates: [],
      familyItemCandidates
    };
  }
  throw new Error(`unsupported candidate category ${candidateCategory}`);
}

function armorSetCandidateKey(policyRow) {
  return `armor_set_candidate:${slugify(policyRow?.original?.name)}`;
}

function itemCollectionCandidateKey(policyRow) {
  return `item_collection:${slugify(policyRow?.original?.name)}`;
}

function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/'s\b/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function summarizeRows(rows) {
  const summary = {
    total: rows.length,
    byCandidateCategory: {},
    dbWriteActions: {}
  };
  for (const row of rows) {
    summary.byCandidateCategory[row.candidateCategory] = (summary.byCandidateCategory[row.candidateCategory] ?? 0) + 1;
    summary.dbWriteActions[row.dbWriteAction] = (summary.dbWriteActions[row.dbWriteAction] ?? 0) + 1;
  }
  return summary;
}

function findForbiddenWriteIntentFields(value, pathName = '') {
  const issues = [];
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      issues.push(...findForbiddenWriteIntentFields(entry, `${pathName}[${index}]`));
    });
    return issues;
  }
  if (!value || typeof value !== 'object') return issues;
  for (const [key, nested] of Object.entries(value)) {
    const childPath = pathName ? `${pathName}.${key}` : key;
    if (FORBIDDEN_WRITE_INTENT_KEYS.has(key)) {
      issues.push(`forbidden write-intent field ${childPath}`);
    }
    issues.push(...findForbiddenWriteIntentFields(nested, childPath));
  }
  return issues;
}

function defaultOutputPath() {
  const dateTag = new Date().toISOString().slice(0, 10);
  return path.join('reports', `biome-collection-relations-dry-run-${dateTag}.json`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toNullableText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

if (process.argv[1] === __filename) {
  try {
    const args = parseArgs();
    const result = await writeBiomeCollectionRelationsDryRun({
      inputPath: args.input,
      outputPath: args.output
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('[biome-collection-relations-dry-run] failed');
    console.error(error);
    process.exitCode = 1;
  }
}

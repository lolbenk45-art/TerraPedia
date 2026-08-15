#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ALLOWED_ARGS = new Set(['local-domain', 'missing-evidence', 'output']);
const ALLOWED_POLICY_ACTIONS = new Set([
  'boss_treasure_bag_projection_only',
  'armor_set_relation_schema_needed',
  'item_set_component_collection_schema_needed',
  'item_family_collection_schema_needed',
  'ambiguous_npc_variant_policy_needed',
  'normalized_npc_candidate_policy_needed',
  'weak_npc_family_backfill_clue_only',
  'still_missing_entity_evidence_needed',
  'unresolved_policy_review_needed'
]);
const FORBIDDEN_WRITE_INTENT_KEYS = new Set([
  'aliasMap',
  'aliases',
  'apply',
  'applyPlan',
  'importPlan',
  'insertPlan',
  'resolvedId',
  'resolvedIds',
  'resolvedItemId',
  'resolvedItemIds',
  'resolvedNpcId',
  'resolvedNpcIds',
  'sql',
  'sqlStatement',
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
  if (!toNullableText(args['local-domain'])) throw new Error('--local-domain is required');
  if (!toNullableText(args['missing-evidence'])) throw new Error('--missing-evidence is required');
  return {
    localDomain: args['local-domain'],
    missingEvidence: args['missing-evidence'],
    output: args.output ?? defaultOutputPath()
  };
}

export function buildBiomeWikitextPolicyRelationPlan({
  localDomainReport,
  missingEvidenceReport,
  generatedAt = new Date().toISOString(),
  sourceReportPaths = {}
}) {
  const localDomainRows = Array.isArray(localDomainReport?.rows) ? localDomainReport.rows : [];
  const missingEvidenceRows = Array.isArray(missingEvidenceReport?.rows) ? missingEvidenceReport.rows : [];
  const localDomainByIndex = indexRows(localDomainRows, 'local-domain');
  const missingEvidenceByIndex = indexRows(missingEvidenceRows, 'missing-evidence');
  validateInputMergeContract({ localDomainRows, localDomainByIndex, missingEvidenceRows });

  const rows = localDomainRows.map((localDomainRow) => {
    const missingEvidenceRow = missingEvidenceByIndex.get(localDomainRow.inputIndex) ?? null;
    const classification = classifyPolicyAction({ localDomainRow, missingEvidenceRow });
    return {
      inputIndex: localDomainRow.inputIndex,
      original: clone(localDomainRow.original),
      sourceRecommendations: {
        localDomain: localDomainRow.recommendation ?? null,
        missingEvidence: missingEvidenceRow?.recommendation ?? null
      },
      policyAction: classification.policyAction,
      targetSurface: classification.targetSurface,
      nextDecision: classification.nextDecision,
      evidence: buildEvidenceSnapshot(localDomainRow, missingEvidenceRow),
      dbWriteAction: 'none',
      resolvedMapping: null,
      evidenceOnly: true,
      needsUserDecision: true
    };
  });
  return {
    entity: 'biome_wikitext_policy_relation_plan',
    generatedAt,
    sourceReportPaths: {
      localDomain: sourceReportPaths.localDomain ?? localDomainReport?.sourceReportPath ?? null,
      missingEvidence: sourceReportPaths.missingEvidence ?? missingEvidenceReport?.sourceReportPath ?? null
    },
    sourceGeneratedAt: {
      localDomain: localDomainReport?.generatedAt ?? null,
      missingEvidence: missingEvidenceReport?.generatedAt ?? null
    },
    summary: summarizeRows(rows),
    rows
  };
}

export function classifyPolicyAction({ localDomainRow, missingEvidenceRow = null }) {
  const localRecommendation = localDomainRow?.recommendation ?? null;
  const missingRecommendation = missingEvidenceRow?.recommendation ?? null;

  if (localRecommendation === 'evidence_boss_treasure_bag_projection') {
    return policy(
      'boss_treasure_bag_projection_only',
      'boss_detail_loot_projection',
      'Keep Treasure Bag out of item_biomes; decide later only if a biome-boss context table is approved.'
    );
  }
  if (localRecommendation === 'evidence_armor_set_variant_needs_decision' || localRecommendation === 'evidence_armor_set_single_candidate') {
    return policy(
      'armor_set_relation_schema_needed',
      'biome_armor_sets',
      'Create a typed armor-set relation only after user approval; do not expand to component item_biomes.'
    );
  }
  if (localRecommendation === 'ambiguous_npc_variant_needs_decision') {
    return policy(
      'ambiguous_npc_variant_policy_needed',
      'npc_biomes_policy_gate',
      'Choose a user-reviewed NPC variant policy before any npc_biomes write.'
    );
  }
  if (localRecommendation === 'missing_local_entity_needs_backfill') {
    if (missingRecommendation === 'normalized_internal_name_candidate') {
      return policy(
        'normalized_npc_candidate_policy_needed',
        'npc_biomes_policy_gate',
        'Review the normalized NPC candidate and related family variants before any npc_biomes write.'
      );
    }
    if (missingRecommendation === 'weak_npc_family_candidate_needs_decision') {
      return policy(
        'weak_npc_family_backfill_clue_only',
        'future_entity_backfill_clue',
        'Use family evidence only as a search clue; it is not a relation mapping.'
      );
    }
    if (missingRecommendation === 'component_item_set_candidate') {
      return policy(
        'item_set_component_collection_schema_needed',
        'biome_item_collections',
        'Create a typed collection relation only after user approval; do not expand to item_biomes.'
      );
    }
    if (missingRecommendation === 'item_family_candidate') {
      return policy(
        'item_family_collection_schema_needed',
        'biome_item_collections',
        'Review a collection model and candidate filter before any item relation write.'
      );
    }
    if (missingRecommendation === 'still_missing_after_local_evidence_audit') {
      return policy(
        'still_missing_entity_evidence_needed',
        'future_entity_evidence_audit',
        'Keep unresolved until stronger local or Wiki evidence is available.'
      );
    }
  }
  return policy(
    'unresolved_policy_review_needed',
    'manual_policy_review',
    'No policy action matched; keep unresolved and review the source evidence.'
  );
}

export function validatePolicyRelationPlanReport(report) {
  const issues = [];
  if (report?.entity !== 'biome_wikitext_policy_relation_plan') issues.push('wrong entity');
  if (!Object.hasOwn(report ?? {}, 'generatedAt')) issues.push('missing generatedAt');
  if (!report?.sourceReportPaths || typeof report.sourceReportPaths !== 'object') issues.push('missing sourceReportPaths');
  if (!report?.sourceGeneratedAt || typeof report.sourceGeneratedAt !== 'object') issues.push('missing sourceGeneratedAt');
  if (!report?.summary || typeof report.summary !== 'object') issues.push('missing summary');
  if (!Array.isArray(report?.rows)) issues.push('rows is not an array');
  if (report?.summary?.total !== report?.rows?.length) issues.push('summary total does not match row length');
  if (!report?.summary?.byPolicyAction || typeof report.summary.byPolicyAction !== 'object') issues.push('missing summary.byPolicyAction');
  if (!report?.summary?.dbWriteActions || typeof report.summary.dbWriteActions !== 'object') issues.push('missing summary.dbWriteActions');
  issues.push(...findForbiddenWriteIntentFields(report));

  const seen = new Set();
  for (const row of Array.isArray(report?.rows) ? report.rows : []) {
    if (!Number.isInteger(row.inputIndex)) issues.push(`row ${row.inputIndex} invalid inputIndex`);
    if (seen.has(row.inputIndex)) issues.push(`duplicate inputIndex ${row.inputIndex}`);
    seen.add(row.inputIndex);
    if (!row.original || typeof row.original !== 'object') issues.push(`row ${row.inputIndex} missing original`);
    if (!row.sourceRecommendations || typeof row.sourceRecommendations !== 'object') issues.push(`row ${row.inputIndex} missing sourceRecommendations`);
    if (!ALLOWED_POLICY_ACTIONS.has(row.policyAction)) issues.push(`row ${row.inputIndex} unsupported policyAction ${row.policyAction}`);
    if (!toNullableText(row.targetSurface)) issues.push(`row ${row.inputIndex} missing targetSurface`);
    if (!toNullableText(row.nextDecision)) issues.push(`row ${row.inputIndex} missing nextDecision`);
    if (!row.evidence || typeof row.evidence !== 'object') issues.push(`row ${row.inputIndex} missing evidence`);
    if (row.dbWriteAction !== 'none') issues.push(`row ${row.inputIndex} dbWriteAction must be none`);
    if (row.resolvedMapping !== null) issues.push(`row ${row.inputIndex} resolvedMapping must be null`);
    if (row.evidenceOnly !== true) issues.push(`row ${row.inputIndex} not evidenceOnly`);
    if (row.needsUserDecision !== true) issues.push(`row ${row.inputIndex} not marked for user decision`);
  }
  return { valid: issues.length === 0, issues };
}

function indexRows(rows, label) {
  const byIndex = new Map();
  for (const row of rows) {
    if (!Number.isInteger(row.inputIndex)) {
      throw new Error(`${label} row has invalid inputIndex ${row.inputIndex}`);
    }
    if (byIndex.has(row.inputIndex)) {
      throw new Error(`duplicate ${label} inputIndex ${row.inputIndex}`);
    }
    byIndex.set(row.inputIndex, row);
  }
  return byIndex;
}

function validateInputMergeContract({ localDomainRows, localDomainByIndex, missingEvidenceRows }) {
  for (const missingRow of missingEvidenceRows) {
    const localRow = localDomainByIndex.get(missingRow.inputIndex);
    if (!localRow) {
      throw new Error(`missing-evidence row ${missingRow.inputIndex} has no matching local-domain row`);
    }
    if (localRow.recommendation !== 'missing_local_entity_needs_backfill') {
      throw new Error(`missing-evidence row ${missingRow.inputIndex} does not belong to a missing local-domain row`);
    }
    const localRowKey = localRow.original?.rowKey ?? null;
    const missingRowKey = missingRow.original?.rowKey ?? null;
    if (localRowKey !== missingRowKey) {
      throw new Error(`rowKey mismatch for inputIndex ${missingRow.inputIndex}: ${localRowKey} != ${missingRowKey}`);
    }
  }

  for (const localRow of localDomainRows) {
    if (localRow.recommendation === 'missing_local_entity_needs_backfill' && !localDomainByIndex.has(localRow.inputIndex)) {
      throw new Error(`missing local-domain row index ${localRow.inputIndex}`);
    }
  }
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

export async function writePolicyRelationPlanReport({ localDomainPath, missingEvidencePath, outputPath, generatedAt }) {
  const resolvedLocalDomainPath = path.resolve(process.cwd(), localDomainPath);
  const resolvedMissingEvidencePath = path.resolve(process.cwd(), missingEvidencePath);
  const resolvedOutputPath = path.resolve(process.cwd(), outputPath ?? defaultOutputPath());
  const localDomainReport = JSON.parse(fs.readFileSync(resolvedLocalDomainPath, 'utf8'));
  const missingEvidenceReport = JSON.parse(fs.readFileSync(resolvedMissingEvidencePath, 'utf8'));
  const report = buildBiomeWikitextPolicyRelationPlan({
    localDomainReport,
    missingEvidenceReport,
    generatedAt,
    sourceReportPaths: {
      localDomain: resolvedLocalDomainPath,
      missingEvidence: resolvedMissingEvidencePath
    }
  });
  const validation = validatePolicyRelationPlanReport(report);
  if (!validation.valid) {
    throw new Error(`Biome wikitext policy relation plan report contract failed:\n${validation.issues.join('\n')}`);
  }
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(resolvedOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return { outputPath: resolvedOutputPath, summary: report.summary };
}

function policy(policyAction, targetSurface, nextDecision) {
  return { policyAction, targetSurface, nextDecision };
}

function buildEvidenceSnapshot(localDomainRow, missingEvidenceRow) {
  return {
    itemExactMatches: clone(localDomainRow?.itemExactMatches ?? []),
    itemLikeMatches: clone(localDomainRow?.itemLikeMatches ?? []),
    npcExactMatches: clone(localDomainRow?.npcExactMatches ?? []),
    npcLikeMatches: clone(localDomainRow?.npcLikeMatches ?? []),
    armorSetCandidates: clone(localDomainRow?.armorSetCandidates ?? []),
    bossLootCandidates: clone(localDomainRow?.bossLootCandidates ?? []),
    normalizedNpcCandidates: clone(missingEvidenceRow?.normalizedNpcCandidates ?? []),
    familyNpcCandidates: clone(missingEvidenceRow?.familyNpcCandidates ?? []),
    componentItemCandidates: clone(missingEvidenceRow?.componentItemCandidates ?? []),
    familyItemCandidates: clone(missingEvidenceRow?.familyItemCandidates ?? [])
  };
}

function summarizeRows(rows) {
  const summary = {
    total: rows.length,
    byPolicyAction: {},
    dbWriteActions: {}
  };
  for (const row of rows) {
    summary.byPolicyAction[row.policyAction] = (summary.byPolicyAction[row.policyAction] ?? 0) + 1;
    summary.dbWriteActions[row.dbWriteAction] = (summary.dbWriteActions[row.dbWriteAction] ?? 0) + 1;
  }
  return summary;
}

function defaultOutputPath() {
  const dateTag = new Date().toISOString().slice(0, 10);
  return path.join('reports', `biome-wikitext-policy-relation-plan-${dateTag}.json`);
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
    const result = await writePolicyRelationPlanReport({
      localDomainPath: args.localDomain,
      missingEvidencePath: args.missingEvidence,
      outputPath: args.output
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('[biome-wikitext-policy-relation-plan] failed');
    console.error(error);
    process.exitCode = 1;
  }
}
